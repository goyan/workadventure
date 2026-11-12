import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, writable } from "svelte/store";
import type { LyricsResult } from "../../../src/common/Lyrics";
import type { KaraokePlayback } from "../../../src/front/Karaoke/JamKaraoke";
import { LyricsLoader } from "../../../src/front/Karaoke/LyricsLoader";
import { karaokeInputFocusStore } from "../../../src/front/Stores/UserInputStore";
import KaraokePanelContent from "./KaraokePanelContent.svelte";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return {
        LL: readable({
            spotify: {
                karaoke: {
                    title: () => "Karaoke",
                    close: () => "Close lyrics",
                    loading: () => "Loading",
                    error: () => "Error",
                    retry: () => "Retry",
                    instrumental: () => "Instrumental",
                    missing: () => "Missing",
                    noTrack: () => "No track",
                    noPosition: () => "No position",
                    paused: () => "Paused",
                    unsynced: () => "Unsynced",
                    follow: () => "Follow",
                    offset: () => "Offset",
                    offsetReset: () => "Reset",
                    next: () => "Up next",
                    source: ({ name }: { name: string }) => name,
                    choose: () => "Choose",
                    trackTitle: () => "Title",
                    artist: () => "Artist",
                    search: () => "Search",
                },
            },
        }),
    };
});
vi.mock("../../../src/front/Karaoke/LyricsApi", () => ({ fetchLyrics: vi.fn() }));
vi.mock("../../../src/front/Chat/ChatSidebarWidthStore", async () => {
    const { writable } = await import("svelte/store");
    return { chatSidebarWidthStore: writable(300) };
});
vi.mock("../../../src/front/Stores/ChatStore", async () => {
    const { writable } = await import("svelte/store");
    return { chatVisibilityStore: writable(false) };
});
vi.mock("../../../src/front/Stores/CoWebsiteStore", async () => {
    const { writable } = await import("svelte/store");
    return { windowSize: writable({ width: 1000, height: 800 }) };
});
vi.mock("../../../src/front/Stores/UserInputStore", async () => {
    const { writable } = await import("svelte/store");
    return { karaokeInputFocusStore: writable(false) };
});

const initial = {
    track: { title: "Test song", artist: "Test artist" },
    next: null,
    positionMs: 1000,
    positionAt: 10_000,
    playing: true,
} satisfies KaraokePlayback;
const found: LyricsResult = {
    status: "found",
    instrumental: false,
    plainLyrics: "First\nSecond",
    syncedLyrics: "[00:01.00]First\n[00:02.00]Second",
    source: "lrclib",
};
let target: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let playback: ReturnType<typeof writable<KaraokePlayback>>;
let request: ReturnType<typeof vi.fn<(track: unknown, signal: AbortSignal) => Promise<LyricsResult>>>;
const onclose = vi.fn();

async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    request = vi.fn().mockResolvedValue(found);
    playback = writable(initial);
    target = document.createElement("div");
    document.body.append(target);
    flushSync(() => {
        component = mount(KaraokePanelContent, {
            target,
            props: {
                playback,
                loader: new LyricsLoader(request),
                onclose,
                room: {
                    zone: { areaId: "area", propertyId: "property", areaName: "Test" },
                    jam: { home: true, hostUuid: "host", hostName: "Host" },
                },
            },
        });
    });
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("KaraokePanel", () => {
    it("shows the prefetched next recording in the same render that playback announces it", async () => {
        await settle();
        const forecast = { title: "Next song", artist: "Test artist", uri: "spotify:track:next" };
        request.mockResolvedValueOnce({ ...found, syncedLyrics: "[00:00.00]Next opening" });
        flushSync(() => playback.set({ ...initial, next: forecast }));
        await settle();
        expect(request).toHaveBeenCalledTimes(2);
        flushSync(() =>
            playback.set({
                ...initial,
                track: { ...forecast, album: "Test edition", durationMs: 200_000 },
                positionMs: 0,
                next: null,
            }),
        );
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("Next opening");
        expect(target.textContent).not.toContain("Loading");
        expect(request).toHaveBeenCalledTimes(2);
    });

    it("loads a new recording URI even when its title and artist stay identical", async () => {
        await settle();
        flushSync(() => playback.set({ ...initial, track: { ...initial.track, uri: "spotify:track:studio" } }));
        await settle();
        request.mockResolvedValueOnce({ ...found, syncedLyrics: "[00:00.00]Live opening" });
        flushSync(() =>
            playback.set({
                ...initial,
                track: { ...initial.track, uri: "spotify:track:live" },
                positionMs: 0,
            }),
        );
        await settle();
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("Live opening");
    });

    it("highlights by playback time, freezes on pause and follows a seek without new lyric requests", async () => {
        await settle();
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("First");
        await vi.advanceTimersByTimeAsync(1000);
        flushSync();
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("Second");
        flushSync(() => playback.set({ ...initial, playing: false, positionAt: 11_000 }));
        await vi.advanceTimersByTimeAsync(2000);
        flushSync();
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("First");
        flushSync(() => playback.set({ ...initial, playing: false, positionMs: 2000, positionAt: 13_000 }));
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("Second");
        expect(request).toHaveBeenCalledOnce();
    });

    it("clears old lyrics during a new lookup, then shows missing instead of the previous song", async () => {
        await settle();
        let finish: ((value: LyricsResult) => void) | undefined;
        request.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        flushSync(() => playback.set({ ...initial, track: { title: "New song", artist: "Test artist" } }));
        expect(target.textContent).toContain("Loading");
        expect(target.textContent).not.toContain("First");
        finish?.({ status: "missing" });
        await settle();
        expect(target.textContent).toContain("Missing");
        expect(target.textContent).not.toContain("First");
    });

    it("keeps literal provider text safe and shows unsynchronized lyrics without highlighting", async () => {
        await settle();
        request.mockResolvedValueOnce({ ...found, syncedLyrics: "", plainLyrics: "<script>literal</script>" });
        flushSync(() => playback.set({ ...initial, track: { title: "Plain song", artist: "Test artist" } }));
        await settle();
        expect(target.textContent).toContain("Unsynced");
        expect(target.textContent).toContain("<script>literal</script>");
        expect(target.querySelector("script")).toBeNull();
        expect(target.querySelector('[aria-current="true"]')).toBeNull();
    });

    it("fills the current line as playback goes through it, and leaves a line without a known end whole", async () => {
        await settle();
        const fill = (): string | undefined =>
            target.querySelector<HTMLElement>('[aria-current="true"] span')?.style.getPropertyValue("--karaoke-fill");
        expect(fill()).toBe("0%");
        await vi.advanceTimersByTimeAsync(500);
        flushSync();
        expect(fill()).toBe("50%");
        await vi.advanceTimersByTimeAsync(500);
        flushSync();
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("Second");
        expect(fill()).toBe("");
    });

    it("shows how far the track is only when its duration is known", async () => {
        await settle();
        expect(target.querySelector('[role="progressbar"]')).toBeNull();
        flushSync(() => playback.set({ ...initial, track: { ...initial.track, durationMs: 4000 } }));
        await settle();
        expect(target.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("25");
    });

    it("announces the next track", async () => {
        await settle();
        expect(target.textContent).not.toContain("Up next");
        flushSync(() => playback.set({ ...initial, next: { title: "Next song", artist: "Next artist" } }));
        await settle();
        expect(target.querySelector('[data-testid="karaoke-next"]')?.textContent).toMatch(
            /Up next.*Next song.*Next artist/s,
        );
    });

    it("keeps the delay setting folded until asked for, and resets it", async () => {
        await settle();
        const range = (): HTMLInputElement | null => target.querySelector('input[type="range"]');
        expect(range()).toBeNull();
        const toggle = target.querySelector<HTMLButtonElement>('[data-testid="karaoke-offset-toggle"]');
        expect(toggle?.getAttribute("aria-expanded")).toBe("false");
        flushSync(() => toggle?.click());
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
        const input = range();
        if (!input) throw new Error("Delay slider absent");
        input.value = "1000";
        flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
        // Lyrics shown one second early: the second line is already the current one.
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("Second");
        expect(toggle?.textContent).toContain("+1.00 s");
        const reset = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
            (button) => button.getAttribute("aria-label") === "Reset",
        );
        flushSync(() => reset?.click());
        expect(target.querySelector('[aria-current="true"]')?.textContent).toBe("First");
    });

    it("lets readers scroll manually and resume following", async () => {
        await settle();
        const lyrics = target.querySelector('[data-testid="karaoke-lyrics"]');
        if (!lyrics) throw new Error("Lyrics absent");
        flushSync(() => lyrics.dispatchEvent(new WheelEvent("wheel", { bubbles: true })));
        const follow = [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
            button.textContent?.includes("Follow"),
        );
        expect(follow).toBeDefined();
        flushSync(() => follow?.click());
        expect(target.textContent).not.toContain("Follow");
    });

    it("isolates input and Escape from avatar shortcuts and releases focus on close", async () => {
        await settle();
        const choose = [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
            button.textContent?.includes("Choose"),
        );
        flushSync(() => choose?.click());
        const input = target.querySelector<HTMLInputElement>('input:not([type="range"])');
        if (!input) throw new Error("Search field absent");
        flushSync(() => input.focus());
        expect(get(karaokeInputFocusStore)).toBe(true);
        const avatar = vi.fn();
        window.addEventListener("keydown", avatar);
        try {
            flushSync(() =>
                input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })),
            );
            expect(onclose).toHaveBeenCalledOnce();
            expect(avatar).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener("keydown", avatar);
        }
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        expect(get(karaokeInputFocusStore)).toBe(false);
    });
});
