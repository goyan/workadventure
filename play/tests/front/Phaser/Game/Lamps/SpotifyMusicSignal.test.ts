import { describe, expect, it } from "vitest";
import { SpotifyMusicSignal } from "../../../../../src/front/Phaser/Game/Lamps/SpotifyMusicSignal";

const uri = "spotify:track:abc";
const idle = { bass: 0, mid: 0, treble: 0, beat: false };

describe("SpotifyMusicSignal", () => {
    it("punches the bass on each real beat, as hard as the attack under it, then lets it die away", () => {
        const signal = new SpotifyMusicSignal();
        signal.set({ uri, beatStartMs: 500, intensity: 0.5, attack: 0.9, brightness: 0.2 }, 0);
        const hit = signal.read(uri, 0);
        expect(hit.beat).toBe(true);
        expect(hit.bass).toBeCloseTo(0.3 * 0.5 + 0.7 * 0.9);
        expect(hit.mid).toBe(0.5);
        expect(hit.treble).toBeCloseTo(0.1);
        const later = signal.read(uri, 300);
        expect(later.beat).toBe(false);
        expect(later.bass).toBeLessThan(hit.bass / 2);
        // A soft attack (a chord, not a kick) hits less.
        signal.set({ uri, beatStartMs: 1000, intensity: 0.5, attack: 0.4 }, 500);
        expect(signal.read(uri, 500).bass).toBeLessThan(hit.bass);
    });

    it("opens a new scene on the first beat of each bar only", () => {
        const signal = new SpotifyMusicSignal();
        signal.set({ uri, beatStartMs: 0, intensity: 1, barStartMs: 0 }, 0);
        expect(signal.read(uri, 0).bar).toBe(true);
        signal.set({ uri, beatStartMs: 500, intensity: 1, barStartMs: 0 }, 500);
        expect(signal.read(uri, 500)).toMatchObject({ beat: true });
        expect(signal.read(uri, 500).bar).toBeUndefined();
        signal.set({ uri, beatStartMs: 2000, intensity: 1, barStartMs: 2000 }, 1000);
        expect(signal.read(uri, 1000).bar).toBe(true);
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
