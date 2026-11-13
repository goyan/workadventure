import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";

const openTab = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/front/Api/ScriptUtils", () => ({ scriptUtils: { openTab } }));

vi.mock("../../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const LL = readable({
        externalModule: {
            calendar: {
                openInTeamsQuestion: () => "Open the meeting in Teams?",
                openInTeamsYes: () => "Yes",
                openInTeamsNo: () => "No",
                goToMeetingRoomsFull: () => "Every Teams room is taken.",
                goToMeetingNoPath: () => "No way leads to the Teams room: your avatar stays here.",
                goToMeetingClaimFailed: () => "The Teams room could not be booked: your avatar stays here.",
            },
        },
        actionbar: { close: () => "Close" },
    });
    return { default: LL, LL };
});

import CalendarTeamsPrompt from "../../../../src/front/Components/Calendar/CalendarTeamsPrompt.svelte";
import {
    askToOpenInTeams,
    closeTeamsPrompt,
    teamsPromptStore,
} from "../../../../src/front/Components/Calendar/CalendarReminder";

const joinUrl = "https://teams.microsoft.com/l/meetup-join/abc";
const daily: CalendarEventInterface = {
    id: "mac:daily",
    title: "Daily standup",
    description: "",
    start: new Date("2026-11-17T09:15:00.000Z"),
    end: new Date("2026-11-17T09:45:00.000Z"),
    resource: { onlineMeeting: { joinUrl }, meetingKey: "a".repeat(64) },
};

describe("CalendarTeamsPrompt", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    beforeEach(() => {
        // jsdom has no Web Animations: the card flies in with one. A stand-in animation that never ends is enough here.
        Element.prototype.animate = vi.fn(
            () => ({ cancel: vi.fn(), finished: new Promise(() => {}), onfinish: null }) as unknown as Animation,
        );
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        delete (Element.prototype as Partial<Element>).animate;
        closeTeamsPrompt();
        openTab.mockClear();
    });

    function render() {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(CalendarTeamsPrompt, { target });
        flushSync();
    }

    function button(name: string): HTMLButtonElement {
        const found = [...target.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === name || candidate.getAttribute("aria-label") === name,
        );
        if (!found) throw new Error(`No button ${name}`);
        return found;
    }

    it("shows nothing until a meeting is to be opened", () => {
        render();
        expect(target.textContent?.trim()).toBe("");
    });

    it("asks whether to open the meeting, and opens it in a new tab on Yes", () => {
        render();
        askToOpenInTeams(daily, "arrived");
        flushSync();

        expect(target.textContent).toContain("Open the meeting in Teams?");
        expect(target.textContent).toContain("Daily standup");
        expect(openTab).not.toHaveBeenCalled();
        button("Yes").click();
        flushSync();

        expect(openTab).toHaveBeenCalledWith(joinUrl);
        expect(get(teamsPromptStore)).toBeUndefined();
    });

    it("opens nothing on No, on the close button, or on Escape", () => {
        render();
        for (const close of [
            () => button("No").click(),
            () => button("Close").click(),
            () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
        ]) {
            askToOpenInTeams(daily, "arrived");
            flushSync();
            close();
            flushSync();
            expect(get(teamsPromptStore)).toBeUndefined();
        }
        expect(openTab).not.toHaveBeenCalled();
    });

    it("says why the avatar stays when every room is taken", () => {
        render();
        askToOpenInTeams(daily, "rooms-full");
        flushSync();

        expect(target.textContent).toContain("Every Teams room is taken.");
    });

    it("says why the avatar stays when no way leads to the room", () => {
        render();
        askToOpenInTeams(daily, "no-path");
        flushSync();

        expect(target.textContent).toContain("No way leads to the Teams room: your avatar stays here.");
        expect(target.textContent).not.toContain("Every Teams room is taken.");
    });

    it("says why the avatar stays when the room could not be booked", () => {
        render();
        askToOpenInTeams(daily, "claim-failed");
        flushSync();

        expect(target.textContent).toContain("The Teams room could not be booked: your avatar stays here.");
    });

    it("says nothing more when the avatar arrived in the room", () => {
        render();
        askToOpenInTeams(daily, "arrived");
        flushSync();

        expect(target.textContent).not.toContain("your avatar stays here");
        expect(target.textContent).not.toContain("Every Teams room is taken.");
    });
});
