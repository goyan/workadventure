import { describe, expect, it } from "vitest";
import { SpotifyMusicSignal } from "../../../../../src/front/Phaser/Game/Lamps/SpotifyMusicSignal";

const uri = "spotify:track:abc";
const idle = { bass: 0, mid: 0, treble: 0, beat: false };

describe("SpotifyMusicSignal", () => {
    it("follows Spotify loudness and flashes once per real beat", () => {
        const signal = new SpotifyMusicSignal();
        signal.set({ uri, beatStartMs: 500, intensity: 0.7 }, 0);
        expect(signal.read(uri, 0)).toEqual({ bass: 0.7, mid: 0.7, treble: 0.7, beat: true });
        expect(signal.read(uri, 16).beat).toBe(false);
        signal.set({ uri, beatStartMs: 1000, intensity: 0.4 }, 500);
        expect(signal.read(uri, 500)).toEqual({ bass: 0.4, mid: 0.4, treble: 0.4, beat: true });
    });

    it("keeps the flash ceiling even when Spotify beats faster or seeks", () => {
        const signal = new SpotifyMusicSignal();
        signal.set({ uri, beatStartMs: 0, intensity: 1 }, 0);
        expect(signal.read(uri, 0).beat).toBe(true);
        signal.set({ uri, beatStartMs: 200, intensity: 1 }, 200);
        expect(signal.read(uri, 200).beat).toBe(false);
        expect(signal.read(uri, 350).beat).toBe(false);
        signal.set({ uri, beatStartMs: 0, intensity: 1 }, 400);
        expect(signal.read(uri, 400).beat).toBe(true);
    });

    it("ignores another track, paused Spotify, stale and invalid frames", () => {
        const signal = new SpotifyMusicSignal();
        signal.set({ uri, beatStartMs: 0, intensity: 1 }, 0);
        expect(signal.read("spotify:track:other", 0)).toEqual(idle);
        expect(signal.read(uri, 1001)).toEqual(idle);
        signal.set(null, 1002);
        expect(signal.read(uri, 1002)).toEqual(idle);
        signal.set({ uri, beatStartMs: -1, intensity: 8 }, 1003);
        expect(signal.read(uri, 1003)).toEqual(idle);
    });
});
