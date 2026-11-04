import { describe, expect, it, vi } from "vitest";
import { fetchCurrentlyPlaying, parseCurrentlyPlaying } from "../../../src/front/Spotify/SpotifyPlayerApi";

const playingTrack = {
    is_playing: true,
    currently_playing_type: "track",
    item: {
        name: "Harder, Better, Faster, Stronger",
        artists: [{ name: "Daft Punk" }, { name: "Kanye West" }],
        external_urls: { spotify: "https://open.spotify.com/track/abc" },
        album: {
            name: "Graduation",
            images: [
                { url: "https://i.scdn.co/image/large", width: 640 },
                { url: "https://i.scdn.co/image/medium", width: 300 },
                { url: "https://i.scdn.co/image/small", width: 64 },
            ],
        },
    },
};

const respondWith = (response: Response) => vi.fn<typeof fetch>().mockResolvedValue(response);

describe("parseCurrentlyPlaying", () => {
    it("keeps the position in the track, timed at the reading", () => {
        expect(parseCurrentlyPlaying({ ...playingTrack, progress_ms: 61_000 }, 1_000_000)).toMatchObject({
            positionMs: 61_000,
            positionAt: 1_000_000,
        });
        expect(parseCurrentlyPlaying(playingTrack)).not.toHaveProperty("positionMs");
    });

    it("reads the playing track", () => {
        expect(parseCurrentlyPlaying(playingTrack)).toEqual({
            title: "Harder, Better, Faster, Stronger",
            artist: "Daft Punk, Kanye West",
            url: "https://open.spotify.com/track/abc",
            album: "Graduation",
            artworkUrl: "https://i.scdn.co/image/medium",
            source: "spotify",
        });
    });

    it("shares nothing while paused, for episodes and ads, or for an unexpected answer", () => {
        expect(parseCurrentlyPlaying({ ...playingTrack, is_playing: false })).toBeUndefined();
        expect(parseCurrentlyPlaying({ ...playingTrack, currently_playing_type: "episode" })).toBeUndefined();
        expect(parseCurrentlyPlaying({ ...playingTrack, currently_playing_type: "ad", item: null })).toBeUndefined();
        expect(parseCurrentlyPlaying({ unexpected: true })).toBeUndefined();
    });
});

describe("fetchCurrentlyPlaying", () => {
    it("sends the access token and reads the track", async () => {
        const fetchFn = respondWith(new Response(JSON.stringify(playingTrack), { status: 200 }));

        const result = await fetchCurrentlyPlaying("token", fetchFn);

        expect(fetchFn.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer token" });
        expect(result).toEqual({ status: "ok", track: expect.objectContaining({ artist: "Daft Punk, Kanye West" }) });
    });

    it("reads nothing playing from a 204", async () => {
        expect(await fetchCurrentlyPlaying("token", respondWith(new Response(null, { status: 204 })))).toEqual({
            status: "ok",
            track: undefined,
        });
    });

    it("reports an expired token, an account the app refuses and the rate limit", async () => {
        expect(await fetchCurrentlyPlaying("token", respondWith(new Response(null, { status: 401 })))).toEqual({
            status: "unauthorized",
        });
        expect(await fetchCurrentlyPlaying("token", respondWith(new Response(null, { status: 403 })))).toEqual({
            status: "forbidden",
        });
        expect(
            await fetchCurrentlyPlaying(
                "token",
                respondWith(new Response(null, { status: 429, headers: { "Retry-After": "120" } })),
            ),
        ).toEqual({ status: "rateLimited", retryAfterMs: 120_000 });
    });
});
