import { describe, expect, it, vi } from "vitest";
import type { SpotifyPlaybackState } from "../../../src/front/Interfaces/DesktopAppInterfaces";
import { watchSpotifyPlayback } from "../../../src/front/Spotify/SpotifyPlaybackStore";

const firstTrack: SpotifyPlaybackState = {
    track: { uri: "spotify:track:first", title: "First song", artist: "Artist", artworkUrl: "" },
    playing: true,
    positionMs: 1000,
    durationMs: 200_000,
    volume: 1,
    shuffle: false,
    repeat: 0,
};

describe("Shared Spotify playback", () => {
    it("keeps the karaoke and player updated with a desktop that only remembers one callback", () => {
        let notify: ((state: SpotifyPlaybackState | null) => void) | undefined;
        const stopWatching = vi.fn();
        const desktop = {
            watchSpotifyPlayback: vi.fn((callback: (state: SpotifyPlaybackState | null) => void) => {
                notify = callback;
                return stopWatching;
            }),
        };
        const karaoke = vi.fn();
        const player = vi.fn();
        const stopKaraoke = watchSpotifyPlayback(karaoke, desktop);
        notify?.(firstTrack);
        const stopPlayer = watchSpotifyPlayback(player, desktop);
        expect(player).toHaveBeenLastCalledWith(firstTrack);
        expect(desktop.watchSpotifyPlayback).toHaveBeenCalledOnce();

        const nextTrack = {
            ...firstTrack,
            track: {
                ...firstTrack.track,
                uri: "spotify:track:next",
                title: "Next song",
                artist: "Artist",
                artworkUrl: "",
            },
            positionMs: 0,
        };
        notify?.(nextTrack);
        expect(karaoke).toHaveBeenLastCalledWith(nextTrack);
        expect(player).toHaveBeenLastCalledWith(nextTrack);

        stopPlayer?.();
        expect(stopWatching).not.toHaveBeenCalled();
        notify?.({ ...nextTrack, playing: false });
        expect(karaoke).toHaveBeenLastCalledWith({ ...nextTrack, playing: false });
        stopKaraoke?.();
        expect(stopWatching).toHaveBeenCalledOnce();

        watchSpotifyPlayback(player, desktop)?.();
        expect(desktop.watchSpotifyPlayback).toHaveBeenCalledTimes(2);
        expect(player).toHaveBeenLastCalledWith(null);
    });

    it("does not subscribe when the desktop playback API is unavailable", () => {
        const callback = vi.fn();
        expect(watchSpotifyPlayback(callback, undefined)).toBeUndefined();
        expect(watchSpotifyPlayback(callback, {})).toBeUndefined();
        expect(callback).not.toHaveBeenCalled();
    });
});
