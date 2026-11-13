import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { JamRoom } from "../../../../src/front/ListeningZone/ListeningZoneController";
import type { KaraokePlaybackIssue } from "../../../../src/front/Karaoke/JamKaraoke";
import { karaokeStatesStore } from "../../../../src/front/Karaoke/JamKaraoke";
import JamLinkStatus from "../../../../src/front/Components/ListeningZone/JamLinkStatus.svelte";

const mocks = vi.hoisted(() => ({
    update: vi.fn(),
    settings: vi.fn(),
    setRelinked: vi.fn<(hostUuid: string | undefined) => void>(),
}));
vi.mock("../../../../src/front/ListeningZone/ListeningZoneController", async () => {
    const { writable } = await import("svelte/store");
    const relinked = writable<string | undefined>(undefined);
    mocks.setRelinked.mockImplementation(relinked.set);
    return { relinkedJamHostStore: relinked, updateOwnRoom: mocks.update };
});
vi.mock("../../../../src/front/Stores/MenuStore", () => ({ openSpotifySettings: mocks.settings }));
vi.mock("../../../../src/i18n/i18n-svelte", async () => ({
    LL: (await import("svelte/store")).readable({
        spotify: {
            listeningZone: {
                sharePlaceholder: () => "Paste the invite link",
                invalidLink: () => "Not a Jam link",
                cancel: () => "Cancel",
                jamStatus: {
                    positionUnavailable: () => "Position unavailable: the Jam has most likely stopped",
                    noPlayback: () => "No playback (host)",
                    noPlaybackGuest: () => "No playback (guest)",
                    noPlayer: () => "No player read",
                    desktopNoPosition: () => "Desktop app gives no position",
                    authorizationExpired: () => "Authorization expired",
                    accessDenied: () => "Access denied",
                    rateLimited: () => "Rate limited",
                    readFailedStatus: ({ status }: { status: number }) => `Read failed (${status})`,
                    readFailedUnreadable: () => "Unreadable answer",
                    readFailedNetwork: () => "Spotify unreachable",
                    openSettings: () => "Spotify settings",
                    replace: () => "Paste a new Jam link",
                    replaceSubmit: () => "Replace the link",
                    relinked: () => "New link: join again",
                },
            },
        },
    }),
}));

const room: JamRoom = {
    zone: { areaId: "area", propertyId: "property", areaName: "Dancefloor" },
    jam: { url: "https://spotify.link/expired", hostUuid: "host", hostName: "Host" },
};
// Attached to the document: the paste field takes the focus.
const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;

function render(props: { mine: boolean; joined?: boolean }): void {
    flushSync(() => {
        component = mount(JamLinkStatus, { target, props: { room, joined: false, ...props } });
    });
}

function hostReports(
    issue: KaraokePlaybackIssue | undefined,
    issueStatus?: number,
    playback: { track: { title: string; artist: string } | null; positionAt: number } = { track: null, positionAt: 1 },
): void {
    flushSync(() =>
        karaokeStatesStore.set(
            new Map([
                [
                    "host",
                    {
                        areaId: "area",
                        propertyId: "property",
                        jamKey: "https://spotify.link/expired",
                        next: null,
                        playing: false,
                        positionMs: 0,
                        ...playback,
                        issue,
                        issueStatus,
                    },
                ],
            ]),
        ),
    );
}

function form(): HTMLFormElement | null {
    return target.querySelector<HTMLFormElement>('[data-testid="jam-link-replace-form"]');
}

function testId(id: string): HTMLElement | null {
    return target.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

beforeEach(() => {
    mocks.update.mockClear();
    mocks.settings.mockClear();
    mocks.setRelinked(undefined);
    karaokeStatesStore.set(new Map());
});
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.replaceChildren();
});

describe("Jam invite link status", () => {
    it("warns the host when Spotify returns no playback, and lets them paste a new link without closing the room", () => {
        render({ mine: true });
        expect(testId("jam-link-warning")).toBeNull();
        hostReports("noPlayback");
        // A known reason is named on its own: "the Jam has most likely stopped" is the last resort.
        expect(testId("jam-link-warning")?.textContent).toContain("No playback (host)");
        expect(testId("jam-link-warning")?.textContent).not.toContain("most likely stopped");
        expect(testId("jam-link-open-settings")).toBeNull();

        flushSync(() => testId("jam-link-replace")?.click());
        const input = target.querySelector<HTMLInputElement>("input[type=url]");
        if (!input) throw new Error("Missing link input");
        expect(document.activeElement).toBe(input);
        input.value = "  https://spotify.link/fresh  ";
        flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
        flushSync(() => form()?.requestSubmit());

        expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ url: "https://spotify.link/fresh" });
        expect(testId("jam-link-replace-form")).toBeNull();
    });

    it("asks the host to refresh the Jam when their position is unavailable for a reason nobody knows", () => {
        render({ mine: true });
        hostReports(undefined, undefined, { track: { title: "Pearl Necklace", artist: "ZZ Top" }, positionAt: 0 });
        expect(testId("jam-link-warning")?.textContent).toContain(
            "Position unavailable: the Jam has most likely stopped",
        );
        expect(testId("jam-link-replace")).not.toBeNull();
        hostReports(undefined, undefined, { track: { title: "Pearl Necklace", artist: "ZZ Top" }, positionAt: 5 });
        expect(testId("jam-link-warning")).toBeNull();
    });

    it("refuses a link that is not a Spotify Jam invite, without replacing anything", () => {
        render({ mine: true });
        flushSync(() => testId("jam-link-replace")?.click());
        const input = target.querySelector<HTMLInputElement>("input[type=url]");
        if (!input) throw new Error("Missing link input");
        input.value = "https://example.com/jam";
        flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
        flushSync(() => form()?.requestSubmit());

        expect(mocks.update).not.toHaveBeenCalled();
        expect(target.textContent).toContain("Not a Jam link");
    });

    it.each([
        ["noPlayer", "No player read"],
        ["desktopNoPosition", "Desktop app gives no position"],
        ["authorizationExpired", "Authorization expired"],
        ["accessDenied", "Access denied"],
    ] as const)("names a %s issue to the host and opens the Spotify settings", (issue, text) => {
        render({ mine: true });
        hostReports(issue);
        expect(testId("jam-link-warning")?.textContent).toContain(text);
        flushSync(() => testId("jam-link-open-settings")?.click());
        expect(mocks.settings).toHaveBeenCalledOnce();
    });

    it.each([
        ["rateLimited", undefined, "Rate limited"],
        ["readFailed", 502, "Read failed (502)"],
        ["readFailed", 200, "Unreadable answer"],
        ["readFailed", 0, "Spotify unreachable"],
    ] as const)("names to the host a %s read of their player (%s)", (issue, status, text) => {
        render({ mine: true });
        hostReports(issue, status);
        expect(testId("jam-link-warning")?.textContent).toContain(text);
        expect(testId("jam-link-open-settings")).toBeNull();
    });

    it("tells guests only that Spotify returns no playback, not the host's account issues", () => {
        render({ mine: false });
        hostReports("authorizationExpired");
        expect(testId("jam-link-warning")).toBeNull();
        expect(testId("jam-link-replace")).toBeNull();
        hostReports("noPlayback");
        expect(testId("jam-link-warning")?.textContent).toContain("No playback (guest)");
    });

    it("tells a guest whose Jam got a new link to join it again", () => {
        mocks.setRelinked("host");
        render({ mine: false });
        expect(testId("jam-link-relinked")?.textContent).toContain("New link: join again");
    });
});
