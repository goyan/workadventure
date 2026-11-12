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

    describe("synced version fallback", () => {
        const bonamassa = {
            title: "A New Day Yesterday",
            artist: "Joe Bonamassa",
            album: "A New Day Yesterday",
            durationMs: 285_000,
        };
        const plainOnly = { plainLyrics: "Plain line", syncedLyrics: null, instrumental: false };
        const synced = (overrides: Record<string, unknown>) => ({
            id: 1,
            trackName: "A New Day Yesterday",
            artistName: "Joe Bonamassa",
            albumName: "Greatest Hits",
            duration: 285,
            instrumental: false,
            plainLyrics: "Synced line",
            syncedLyrics: "[00:01.00]Synced line",
            ...overrides,
        });

        function routed(search: () => Response | Promise<Response>) {
            const times: number[] = [];
            const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
                times.push(performance.now());
                const url = new URL(input instanceof Request ? input.url : input);
                if (url.pathname === "/api/get") return Promise.resolve(new Response(JSON.stringify(plainOnly)));
                if (url.pathname === "/api/search") return Promise.resolve(search());
                return Promise.reject(new Error(`unexpected ${url.href}`));
            });
            return { fetchFn, times };
        }

        const plainResult = {
            status: "found",
            plainLyrics: "Plain line",
            syncedLyrics: "",
            instrumental: false,
            source: "lrclib",
        };

        it("replaces plain-only lyrics with a synced version of the same duration", async () => {
            const { fetchFn, times } = routed(
                () => new Response(JSON.stringify([synced({ duration: 300, id: 2 }), synced({})])),
            );
            expect(await new LyricsService(fetchFn).get(bonamassa)).toEqual({
                status: "found",
                plainLyrics: "Synced line",
                syncedLyrics: "[00:01.00]Synced line",
                instrumental: false,
                source: "lrclib",
            });
            expect(fetchFn).toHaveBeenCalledTimes(2);
            const input = fetchFn.mock.calls[1][0];
            const url = new URL(input instanceof Request ? input.url : input);
            expect(url.origin + url.pathname).toBe("https://lrclib.net/api/search");
            expect([...url.searchParams.keys()].sort()).toEqual(["artist_name", "track_name"]);
            expect(url.searchParams.get("track_name")).toBe("A New Day Yesterday");
            expect(url.searchParams.get("artist_name")).toBe("Joe Bonamassa");
            expect(fetchFn.mock.calls[1][1]?.headers).toMatchObject({ "Lrclib-Client": expect.any(String) });
            // The provider pacing applies between the exact lookup and the search.
            expect(times[1] - times[0]).toBeGreaterThanOrEqual(740);
        });

        it("prefers the same album, then the closest duration", async () => {
            const { fetchFn } = routed(
                () =>
                    new Response(
                        JSON.stringify([
                            synced({ duration: 285.2, syncedLyrics: "[00:01.00]Closest" }),
                            synced({
                                duration: 287,
                                albumName: "a new day yesterday",
                                syncedLyrics: "[00:01.00]Album",
                            }),
                            synced({ duration: 288, albumName: "A New Day Yesterday", syncedLyrics: "[00:01.00]Far" }),
                        ]),
                    ),
            );
            const result = await new LyricsService(fetchFn).get(bonamassa);
            expect(result).toMatchObject({ status: "found", syncedLyrics: "[00:01.00]Album" });
        });

        it("keeps the plain lyrics when no synced version is within 3 seconds", async () => {
            const { fetchFn } = routed(
                () =>
                    new Response(
                        JSON.stringify([
                            synced({ duration: 288.5 }),
                            synced({ duration: 285, syncedLyrics: "  " }),
                            synced({ duration: 285, instrumental: true }),
                        ]),
                    ),
            );
            expect(await new LyricsService(fetchFn).get(bonamassa)).toEqual(plainResult);
        });

        it.each([
            ["limited", () => new Response(null, { status: 429, headers: { "Retry-After": "120" } })],
            ["offline", () => Promise.reject(new Error("offline"))],
            ["failing", () => new Response(null, { status: 500 })],
            ["not JSON", () => new Response("not json")],
            ["malformed", () => new Response(JSON.stringify({ unexpected: true }))],
        ])("keeps the plain lyrics when the search is %s", async (_name, search) => {
            const { fetchFn } = routed(search);
            expect(await new LyricsService(fetchFn).get(bonamassa)).toEqual(plainResult);
            expect(fetchFn).toHaveBeenCalledTimes(2);
        });

        it("uses the first exact title and artist match when the duration is unknown", async () => {
            const { fetchFn } = routed(
                () =>
                    new Response(
                        JSON.stringify([
                            synced({ trackName: "A New Day Yesterday (Live)", syncedLyrics: "[00:01.00]Live" }),
                            synced({ trackName: "a new day yesterday", artistName: "JOE BONAMASSA" }),
                        ]),
                    ),
            );
            const result = await new LyricsService(fetchFn).get({ ...bonamassa, durationMs: undefined });
            expect(result).toMatchObject({ status: "found", syncedLyrics: "[00:01.00]Synced line" });
        });

        it("does not search when the exact lookup is already synced", async () => {
            const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(lyrics)));
            await new LyricsService(fetchFn).get(bonamassa);
            expect(fetchFn).toHaveBeenCalledOnce();
        });

        it("does not search for a version chosen by hand (title and artist only)", async () => {
            const { fetchFn } = routed(() => new Response(JSON.stringify([synced({})])));
            expect(await new LyricsService(fetchFn).get({ title: bonamassa.title, artist: bonamassa.artist })).toEqual(
                plainResult,
            );
            expect(fetchFn).toHaveBeenCalledOnce();
        });
    });

    it("does not cache provider errors as missing lyrics", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
        const service = new LyricsService(fetchFn);
        expect(await service.get(track)).toEqual({ status: "unavailable" });
    });
});
