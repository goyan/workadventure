import { afterEach, describe, expect, it, vi } from "vitest";
import { LyricsService } from "../../src/pusher/services/LyricsService";

const track = { title: "Test song", artist: "Test artist", album: "Test album", durationMs: 200_000 };
const lyrics = { plainLyrics: "First\nSecond", syncedLyrics: "[00:01.00]First\n[00:02.00]Second", instrumental: false };

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("LyricsService", () => {
    it("deduplicates colleagues' requests, caches lyrics and identifies the LRCLIB client", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(lyrics)));
        const service = new LyricsService(fetchFn);
        const [first, second] = await Promise.all([service.get(track), service.get({ ...track })]);
        expect(first).toEqual({ status: "found", ...lyrics, source: "lrclib" });
        expect(second).toEqual(first);
        expect(await service.get(track)).toEqual(first);
        expect(fetchFn).toHaveBeenCalledOnce();
        const input = fetchFn.mock.calls[0][0];
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin).toBe("https://lrclib.net");
        expect(url.searchParams.get("duration")).toBe("200");
        expect(fetchFn.mock.calls[0][1]?.headers).toMatchObject({ "Lrclib-Client": expect.any(String) });
    });

    it("uses plain lyrics on LRCLIB and preserves instrumentals without a fallback", async () => {
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                new Response(JSON.stringify({ ...lyrics, instrumental: true, syncedLyrics: null, plainLyrics: null })),
            );
        expect(await new LyricsService(fetchFn).get(track)).toEqual({
            status: "found",
            plainLyrics: "",
            syncedLyrics: "",
            instrumental: true,
            source: "lrclib",
        });
        expect(fetchFn).toHaveBeenCalledOnce();
    });

    it("falls back to lyrics.ovh only on a missing title and caches the absence", async () => {
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(new Response(null, { status: 404 }));
        const service = new LyricsService(fetchFn);
        expect(await service.get(track)).toEqual({ status: "missing" });
        expect(await service.get(track)).toEqual({ status: "missing" });
        expect(fetchFn).toHaveBeenCalledTimes(2);
        const input = fetchFn.mock.calls[1][0];
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin).toBe("https://api.lyrics.ovh");
    });

    it("honors Retry-After instead of retrying or calling another provider during a quota", async () => {
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "120" } }));
        const service = new LyricsService(fetchFn);
        expect(await service.get(track)).toEqual({ status: "limited", retryAfterMs: 120_000 });
        expect((await service.get({ ...track, title: "Next" })).status).toBe("limited");
        expect(fetchFn).toHaveBeenCalledOnce();
    });

    it("does not cache provider errors as missing lyrics", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
        const service = new LyricsService(fetchFn);
        expect(await service.get(track)).toEqual({ status: "unavailable" });
    });
});
