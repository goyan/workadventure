import { afterEach, describe, expect, it, vi } from "vitest";
import { desktopSpotifyPlayer } from "../../../src/front/Spotify/LocalSpotifyPlayer";
import type { DesktopSpotifyTrack, WorkAdventureDesktopApi } from "../../../src/front/Interfaces/DesktopAppInterfaces";

function withDesktopApp(watchSpotifyTrack?: WorkAdventureDesktopApi["watchSpotifyTrack"]) {
    window.WAD = { desktop: true, watchSpotifyTrack } as unknown as WorkAdventureDesktopApi;
}

describe("desktopSpotifyPlayer", () => {
    afterEach(() => {
        delete window.WAD;
    });

    it("is absent in a browser and in a desktop app that cannot read Spotify", () => {
        expect(desktopSpotifyPlayer()).toBeUndefined();
        withDesktopApp(undefined);
        expect(desktopSpotifyPlayer()).toBeUndefined();
    });

    it("passes the tracks read by the desktop app, and ignores what is not a Spotify track", () => {
        let send: ((track: DesktopSpotifyTrack | null) => void) | undefined;
        const stop = vi.fn();
        withDesktopApp((callback) => {
            send = callback;
            return stop;
        });
        const onTrack = vi.fn();

        const stopWatching = desktopSpotifyPlayer()?.watch(onTrack);
        send?.({ title: "Song", artist: "Artist", url: "https://open.spotify.com/track/abc" });
        send?.(null);
        send?.({ title: "Phishing", artist: "", url: "https://evil.example/track" });
        stopWatching?.();

        expect(onTrack.mock.calls).toEqual([
            [{ title: "Song", artist: "Artist", url: "https://open.spotify.com/track/abc" }],
            [undefined],
        ]);
        expect(stop).toHaveBeenCalledOnce();
    });

    it("passes the playlist a track plays from, and only the track for another kind of context", () => {
        let send: ((track: DesktopSpotifyTrack | null) => void) | undefined;
        withDesktopApp((callback) => {
            send = callback;
            return vi.fn();
        });
        const onTrack = vi.fn();
        const track = { title: "Song", artist: "Artist", url: "https://open.spotify.com/track/abc" };

        desktopSpotifyPlayer()?.watch(onTrack);
        send?.({ ...track, contextUri: "spotify:playlist:abc", contextName: "Focus" });
        send?.({ ...track, contextUri: "spotify:artist:abc", contextName: "Artist radio" });

        expect(onTrack.mock.calls).toEqual([
            [{ ...track, contextUri: "spotify:playlist:abc", contextName: "Focus" }],
            [track],
        ]);
    });
});
