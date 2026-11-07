import type { SpotifyListening } from "@workadventure/messages";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import {
    currentPositionMs,
    EMPTY_SPOTIFY_LISTENING,
    sanitizeSpotifyListening,
    spotifyContextUrl,
    spotifyTrackUri,
} from "../../../src/common/SpotifyListening";
import type { DesktopFollowTarget } from "../../../src/front/Interfaces/DesktopAppInterfaces";
import { startListeningFollower } from "../../../src/front/Spotify/ListeningFollower";
import type { ListeningByUserUuid } from "../../../src/front/Spotify/SpotifyListeningDirectory";

const listening = (trackId: string, positionMs: number, positionAt: number): SpotifyListening => ({
    ...EMPTY_SPOTIFY_LISTENING,
    trackTitle: `Track ${trackId}`,
    artistName: "Artist",
    trackUrl: `https://open.spotify.com/track/${trackId}`,
    positionMs,
    positionAt,
});

function createHarness(now = 10_000) {
    const followed = writable<string | undefined>(undefined);
    const directory = writable<ListeningByUserUuid>(new Map());
    const available = writable(true);
    const follow = vi.fn<(target: DesktopFollowTarget | null) => void>();
    const stop = startListeningFollower(followed, directory, available, follow, () => now);
    const share = (uuid: string, value: SpotifyListening) => directory.set(new Map([[uuid, value]]));
    return { followed, directory, available, follow, stop, share };
}

describe("startListeningFollower", () => {
    it("plays the followed track where it is now, and nothing before following", () => {
        const { followed, follow, share } = createHarness(10_000);
        share("nat", listening("abc", 60_000, 8_000));
        expect(follow).not.toHaveBeenCalled();

        followed.set("nat");

        expect(follow).toHaveBeenCalledWith({ uri: "spotify:track:abc", positionMs: 62_000 });
    });

    it("follows track changes and seeks, but not the regular progress", () => {
        const { followed, follow, share } = createHarness();
        followed.set("nat");
        share("nat", listening("abc", 0, 1_000));
        share("nat", listening("abc", 4_000, 5_000));
        expect(follow).toHaveBeenCalledTimes(1);

        share("nat", listening("abc", 90_000, 6_000));
        share("nat", listening("def", 0, 7_000));

        expect(follow.mock.calls.map(([target]) => target?.uri)).toEqual([
            "spotify:track:abc",
            "spotify:track:abc",
            "spotify:track:def",
        ]);
    });

    it("keeps a snapshot when world-space updates mutate the previously shared object", () => {
        const { followed, follow, share } = createHarness();
        const shared = listening("abc", 0, 1_000);
        share("nat", shared);
        followed.set("nat");
        Object.assign(shared, listening("def", 0, 2_000));
        share("nat", { ...shared });
        expect(follow).toHaveBeenCalledTimes(2);
        Object.assign(shared, listening("def", 90_000, 3_000));
        share("nat", { ...shared });
        expect(follow).toHaveBeenCalledTimes(3);
        expect(follow).toHaveBeenLastCalledWith({ uri: "spotify:track:def", positionMs: 97_000 });
    });

    it("leaves the player as it is when the followed user stops sharing, and resumes with their next track", () => {
        const { followed, follow, share } = createHarness();
        followed.set("nat");
        share("nat", listening("abc", 0, 1_000));
        share("nat", EMPTY_SPOTIFY_LISTENING);
        share("nat", listening("def", 0, 2_000));

        expect(follow.mock.calls.map(([target]) => target?.uri)).toEqual(["spotify:track:abc", "spotify:track:def"]);
    });

    it("stops following when asked, or when the scene closes", () => {
        const { followed, follow, share, stop } = createHarness();
        followed.set("nat");
        share("nat", listening("abc", 0, 1_000));
        followed.set(undefined);
        expect(follow).toHaveBeenLastCalledWith(null);

        followed.set("nat");
        stop();
        expect(follow).toHaveBeenLastCalledWith(null);
    });

    it("pauses while the Spicetify extension is not connected, and resumes when it is back", () => {
        const { followed, available, follow, share } = createHarness();
        followed.set("nat");
        share("nat", listening("abc", 0, 1_000));

        available.set(false);
        expect(follow).toHaveBeenLastCalledWith(null);
        share("nat", listening("def", 0, 2_000));
        expect(follow).toHaveBeenCalledTimes(2);

        available.set(true);
        expect(follow).toHaveBeenLastCalledWith({ uri: "spotify:track:def", positionMs: 8_000 });
    });

    it("never sends anything until the extension is connected", () => {
        const follow = vi.fn();
        const stop = startListeningFollower(writable("nat"), writable(new Map()), writable(false), follow);
        stop();
        expect(follow).not.toHaveBeenCalled();
    });

    it("does nothing without a desktop app able to follow", () => {
        expect(() =>
            startListeningFollower(writable("nat"), writable(new Map()), writable(true), undefined)(),
        ).not.toThrow();
    });
});

describe("listening position", () => {
    it("deduces where the track is now, unknown without a reported position", () => {
        expect(currentPositionMs(listening("abc", 30_000, 1_000), 3_500)).toBe(32_500);
        expect(currentPositionMs(listening("abc", 30_000, 0), 3_500)).toBeUndefined();
    });

    it("turns a track page into the URI a player plays, and nothing else", () => {
        expect(spotifyTrackUri("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")).toBe(
            "spotify:track:4cOdK2wGLETKBW3PvgPWqT",
        );
        expect(spotifyTrackUri("https://open.spotify.com/album/abc")).toBeUndefined();
        expect(spotifyTrackUri("")).toBeUndefined();
    });

    it("bounds the positions a client sends", () => {
        const sanitized = sanitizeSpotifyListening({ ...listening("abc", -5, Number.NaN) });
        expect(sanitized).toMatchObject({ positionMs: 0, positionAt: 0 });
        expect(sanitizeSpotifyListening(listening("abc", 1e12, 5)).positionMs).toBe(24 * 60 * 60 * 1000);
    });
});

describe("listening context", () => {
    it("keeps a playlist or an album others can open, and drops any other context with its name", () => {
        const withContext = (contextUri: string) =>
            sanitizeSpotifyListening({ ...listening("abc", 0, 0), contextUri, contextName: "Focus" });

        expect(withContext("spotify:playlist:37i9dQZF1DX8Uebhn9wzrS")).toMatchObject({
            contextUri: "spotify:playlist:37i9dQZF1DX8Uebhn9wzrS",
            contextName: "Focus",
        });
        expect(withContext("spotify:album:4aawyAB9vmqN3uQ7FjRGTy").contextUri).toBe(
            "spotify:album:4aawyAB9vmqN3uQ7FjRGTy",
        );
        for (const uri of ["spotify:artist:abc", "spotify:user:me:collection", "https://evil.example", ""]) {
            expect(withContext(uri)).toMatchObject({ contextUri: "", contextName: "" });
        }
    });

    it("links to the page of the playlist or album", () => {
        expect(spotifyContextUrl("spotify:playlist:37i9dQZF1DX8Uebhn9wzrS")).toBe(
            "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS",
        );
        expect(spotifyContextUrl("spotify:album:abc")).toBe("https://open.spotify.com/album/abc");
        expect(spotifyContextUrl("spotify:artist:abc")).toBeUndefined();
    });
});
