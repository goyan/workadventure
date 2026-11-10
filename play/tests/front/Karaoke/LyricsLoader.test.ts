import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { LyricsLoader } from "../../../src/front/Karaoke/LyricsLoader";
import type { LyricsResult } from "../../../src/common/Lyrics";

const first = { title: "First", artist: "Test artist" };
const next = { title: "Next", artist: "Test artist" };
const found: LyricsResult = {
    status: "found",
    plainLyrics: "Test line",
    syncedLyrics: "",
    instrumental: false,
    source: "lrclib",
};
afterEach(() => vi.restoreAllMocks());

describe("LyricsLoader", () => {
    it("shows prefetched lyrics immediately when the same recording gains album and duration at playback", async () => {
        const forecast = { ...next, uri: "spotify:track:next" };
        const playing = { ...forecast, album: "Test edition", durationMs: 200_000 };
        const request = vi.fn().mockResolvedValue(found);
        const loader = new LyricsLoader(request);
        await loader.load(first, forecast);
        const transition = loader.load(playing);
        expect(get(loader.state)).toEqual({ status: "ready", track: playing, lyrics: found });
        await transition;
        expect(request).toHaveBeenCalledTimes(2);
        loader.destroy();
    });

    it("promotes an in-flight forecast without aborting or restarting its lookup", async () => {
        let finish: ((lyrics: LyricsResult) => void) | undefined;
        let forecastSignal: AbortSignal | undefined;
        const request = vi
            .fn()
            .mockResolvedValueOnce(found)
            .mockImplementationOnce(
                (_track, signal: AbortSignal) =>
                    new Promise<LyricsResult>((resolve) => {
                        forecastSignal = signal;
                        finish = resolve;
                    }),
            )
            .mockResolvedValue(found);
        const loader = new LyricsLoader(request);
        const loading = loader.load(first, next);
        await vi.waitFor(() => expect(finish).toBeDefined());
        const transition = loader.load(next);
        expect(forecastSignal?.aborted).toBe(false);
        finish?.(found);
        await Promise.all([loading, transition]);
        expect(get(loader.state)).toEqual({ status: "ready", track: next, lyrics: found });
        expect(request).toHaveBeenCalledTimes(2);
        loader.destroy();
    });

    it("keeps different recordings with identical labels separate", async () => {
        const request = vi.fn().mockResolvedValue(found);
        const loader = new LyricsLoader(request);
        await loader.load({ ...next, uri: "spotify:track:studio" });
        await loader.load({ ...next, uri: "spotify:track:live" });
        expect(request).toHaveBeenCalledTimes(2);
        loader.destroy();
    });

    it("keeps the current lyrics visible while a changed queue preloads another successor", async () => {
        const loader = new LyricsLoader(vi.fn().mockResolvedValue(found));
        await loader.load(first, next);
        const statuses: string[] = [];
        const stop = loader.state.subscribe((state) => statuses.push(state.status));
        await loader.load(first, { title: "Other successor", artist: "Test artist" });
        expect(statuses).not.toContain("loading");
        stop();
        loader.destroy();
    });
    it("loads the current title first and preloads only its known successor", async () => {
        const request = vi.fn().mockResolvedValue(found);
        const loader = new LyricsLoader(request);
        await loader.load(first, next);
        expect(request.mock.calls.map(([track]) => track.title)).toEqual(["First", "Next"]);
        await loader.load(next);
        expect(request).toHaveBeenCalledTimes(2);
        expect(get(loader.state)).toEqual({ status: "ready", track: next, lyrics: found });
        loader.destroy();
    });

    it("clears the previous lyrics immediately and ignores a late result after a skip", async () => {
        let finish: ((lyrics: LyricsResult) => void) | undefined;
        const request = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<LyricsResult>((resolve) => {
                        finish = resolve;
                    }),
            )
            .mockResolvedValue(found);
        const loader = new LyricsLoader(request);
        const loading = loader.load(first, next);
        await loader.load(next);
        finish?.({ status: "missing" });
        await loading;
        expect(get(loader.state)).toEqual({ status: "ready", track: next, lyrics: found });
        expect(request.mock.calls.map(([track]) => track.title)).toEqual(["First", "Next"]);
        loader.destroy();
    });

    it("aborts on close and does not begin a prefetch after closing", async () => {
        let signal: AbortSignal | undefined;
        let finish: ((lyrics: LyricsResult) => void) | undefined;
        const loader = new LyricsLoader((_track, abort) => {
            signal = abort;
            return new Promise<LyricsResult>((resolve) => {
                finish = resolve;
            });
        });
        const loading = loader.load(first, next);
        loader.destroy();
        expect(signal?.aborted).toBe(true);
        finish?.(found);
        await loading;
        expect(get(loader.state).status).toBe("loading");
    });
});
