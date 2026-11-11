import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import { get } from "svelte/store";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
}));

vi.mock("../../../src/front/external-modules/infogene-calendar/CalendarApi", () => {
    class CalendarApiError extends Error {
        constructor(public readonly code: string) {
            super(code);
        }
    }
    return {
        CalendarApiError,
        listCalendarSources: mocks.list,
        addCalendarSource: mocks.add,
        deleteCalendarSource: mocks.remove,
    };
});
vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const text = (value: string) => () => value;
    return {
        default: readable({
            externalModule: {
                outlookIcs: {
                    title: text("My calendars"),
                    explain: text("Paste a link"),
                    delay: text("Delayed"),
                    label: text("Name"),
                    labelPlaceholder: text("Work"),
                    url: text("ICS link"),
                    add: text("Add"),
                    remove: ({ label }: { label: string }) => `Remove ${label}`,
                    empty: text("No calendar"),
                    busyOption: text("Busy in meetings"),
                    busyOptionHelp: text("Help"),
                    manage: text("Manage"),
                    closeSettings: text("Close"),
                    failed: ({ labels }: { labels: string }) => `Cannot read: ${labels}`,
                    errors: {
                        invalid: text("Refused"),
                        unreachable: text("No answer"),
                        quota: text("Too many"),
                        "rate-limit": text("Slow down"),
                        "not-found": text("Gone"),
                        unavailable: text("Unavailable"),
                    },
                },
            },
        }),
    };
});

import CalendarSourcesSettings from "../../../src/front/external-modules/infogene-calendar/CalendarSourcesSettings.svelte";
import { CalendarApiError } from "../../../src/front/external-modules/infogene-calendar/CalendarApi";
import {
    calendarRefresh,
    calendarSourcesStore,
    failedCalendarsStore,
} from "../../../src/front/external-modules/infogene-calendar/calendarModuleState";
import { inputFormFocusStore } from "../../../src/front/Stores/UserInputStore";

const infogene = { id: "59a53748-d07d-4a0a-900a-09c7b5326e66", label: "Infogene", host: "outlook.office365.com" };
const link = "https://outlook.office365.com/owa/calendar/a/b/calendar.ics";

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

async function settle(): Promise<void> {
    await tick();
    flushSync();
}

function fill(selector: string, value: string): void {
    const input = target.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`No ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function toggleSettings(): void {
    const button = target.querySelector<HTMLButtonElement>("button[aria-expanded]");
    if (!button) throw new Error("No settings toggle");
    button.click();
    flushSync();
}

function submit(): void {
    target.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

beforeEach(async () => {
    document.body.appendChild(target);
    mocks.list.mockResolvedValue([infogene]);
    mocks.add.mockResolvedValue(infogene);
    mocks.remove.mockResolvedValue(undefined);
    calendarRefresh.request = vi.fn();
    failedCalendarsStore.set([]);
    component = mount(CalendarSourcesSettings, { target });
    await vi.waitFor(() => expect(target.textContent).toContain("Infogene"));
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.innerHTML = "";
    calendarSourcesStore.set([]);
    vi.clearAllMocks();
});

describe("CalendarSourcesSettings", () => {
    it("folds the settings into one line once the user has calendars", () => {
        expect(target.querySelector("form")).toBeNull();
        expect(target.textContent).not.toContain("Paste a link");
        expect(target.textContent).toContain("Infogene");
        expect(target.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe("false");
    });

    it("opens and closes the settings on demand", () => {
        toggleSettings();
        expect(target.querySelector("form")).not.toBeNull();
        expect(target.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe("true");

        toggleSettings();
        expect(target.querySelector("form")).toBeNull();
    });

    it("shows the settings at once when the user has no calendar yet", async () => {
        mocks.list.mockResolvedValue([]);
        const newcomerTarget = document.createElement("div");
        document.body.appendChild(newcomerTarget);
        const newcomer = mount(CalendarSourcesSettings, { target: newcomerTarget });
        try {
            await vi.waitFor(() => expect(newcomerTarget.textContent).toContain("No calendar"));
            expect(newcomerTarget.querySelector("form")).not.toBeNull();
        } finally {
            await unmount(newcomer);
            newcomerTarget.remove();
        }
    });

    it("lists the calendars of the user by label and host, never by link", () => {
        toggleSettings();
        expect(target.textContent).toContain("Infogene");
        expect(target.textContent).toContain("outlook.office365.com");
        expect(target.textContent).not.toContain("calendar.ics");
    });

    it("adds a calendar, empties the form and refreshes the agenda", async () => {
        toggleSettings();
        fill('input[type="text"]', "Infogene");
        fill('input[type="url"]', link);
        submit();
        await vi.waitFor(() => expect(calendarRefresh.request).toHaveBeenCalledOnce());
        await settle();
        expect(mocks.add).toHaveBeenCalledWith({ label: "Infogene", url: link }, expect.any(AbortSignal));
        expect(target.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe("");
        expect(mocks.list).toHaveBeenCalledTimes(2);
    });

    it("keeps the link and says why when the calendar cannot be read", async () => {
        toggleSettings();
        mocks.add.mockRejectedValue(new CalendarApiError("unreachable"));
        fill('input[type="text"]', "Infogene");
        fill('input[type="url"]', link);
        submit();
        await vi.waitFor(() => expect(target.querySelector('[role="alert"]')?.textContent).toBe("No answer"));
        expect(target.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe(link);
        expect(calendarRefresh.request).not.toHaveBeenCalled();
    });

    it("removes a calendar and refreshes the agenda", async () => {
        toggleSettings();
        mocks.list.mockResolvedValue([]);
        target.querySelector<HTMLButtonElement>('button[aria-label="Remove Infogene"]')?.click();
        await vi.waitFor(() => expect(calendarRefresh.request).toHaveBeenCalledOnce());
        await settle();
        expect(mocks.remove).toHaveBeenCalledWith(infogene.id, expect.any(AbortSignal));
        expect(target.textContent).toContain("No calendar");
    });

    it("names the calendars that could not be read", async () => {
        failedCalendarsStore.set(["Emeria"]);
        await settle();
        expect(target.textContent).toContain("Cannot read: Emeria");
    });

    it("stops the avatar keys while the user types", () => {
        toggleSettings();
        const input = target.querySelector<HTMLInputElement>('input[type="url"]');
        input?.dispatchEvent(new FocusEvent("focus"));
        expect(get(inputFormFocusStore)).toBe(true);
        input?.dispatchEvent(new FocusEvent("blur"));
        expect(get(inputFormFocusStore)).toBe(false);
    });
});
