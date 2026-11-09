import { describe, expect, it } from "vitest";
import {
    flashAlpha,
    LAMP_FADE_IN_MS,
    LAMP_FADE_OUT_MS,
    nextBrightness,
    FLASH_DURATION_MS,
    neonColor,
    NEON_BASS_COLOR,
    NEON_TREBLE_COLOR,
    spotAngle,
} from "../../../../../src/front/Phaser/Game/Lamps/LampStyle";

describe("neonColor", () => {
    it("is the bass colour when only the bass plays, the treble colour when only the treble plays", () => {
        expect(neonColor({ bass: 1, mid: 0, treble: 0 })).toBe(NEON_BASS_COLOR);
        expect(neonColor({ bass: 0, mid: 0, treble: 1 })).toBe(NEON_TREBLE_COLOR);
    });

    it("rests on the bass colour in silence", () => {
        expect(neonColor({ bass: 0, mid: 0, treble: 0 })).toBe(NEON_BASS_COLOR);
    });

    it("blends the two when both play", () => {
        const blended = neonColor({ bass: 0.5, mid: 0, treble: 0.5 });
        expect(blended).not.toBe(NEON_BASS_COLOR);
        expect(blended).not.toBe(NEON_TREBLE_COLOR);
        // Each channel lies between the channels of the two ends.
        for (const shift of [16, 8, 0]) {
            const channel = (blended >> shift) & 0xff;
            const low = Math.min((NEON_BASS_COLOR >> shift) & 0xff, (NEON_TREBLE_COLOR >> shift) & 0xff);
            const high = Math.max((NEON_BASS_COLOR >> shift) & 0xff, (NEON_TREBLE_COLOR >> shift) & 0xff);
            expect(channel).toBeGreaterThanOrEqual(low);
            expect(channel).toBeLessThanOrEqual(high);
        }
    });
});

describe("spotAngle", () => {
    it("sweeps to and fro around the vertical, never further than 0.7 radian", () => {
        for (let time = 0; time < 20_000; time += 53) {
            expect(Math.abs(spotAngle(time, 1))).toBeLessThanOrEqual(0.7);
        }
    });

    it("sweeps faster at a higher speed", () => {
        // A quarter of the period: the slow spot is nearer the vertical than the fast one.
        expect(Math.abs(spotAngle(500, 2))).toBeGreaterThan(Math.abs(spotAngle(500, 1)));
    });

    it("stands still at speed 0", () => {
        expect(spotAngle(12_345, 0)).toBe(0);
    });
});

describe("flashAlpha", () => {
    it("is full on the beat and gone once the flash is over", () => {
        expect(flashAlpha(0)).toBe(1);
        expect(flashAlpha(FLASH_DURATION_MS)).toBe(0);
        expect(flashAlpha(FLASH_DURATION_MS * 3)).toBe(0);
    });

    it("fades in between, never rising again", () => {
        let previous = 1;
        for (let since = 0; since <= FLASH_DURATION_MS; since += 5) {
            const alpha = flashAlpha(since);
            expect(alpha).toBeLessThanOrEqual(previous);
            previous = alpha;
        }
    });

    it("is dark before any beat", () => {
        expect(flashAlpha(undefined)).toBe(0);
    });
});

describe("nextBrightness", () => {
    it("rises to full in a fraction of a second when the lamp lights up", () => {
        expect(nextBrightness(0, true, LAMP_FADE_IN_MS)).toBe(1);
        expect(nextBrightness(0, true, LAMP_FADE_IN_MS / 2)).toBeCloseTo(0.5, 5);
    });

    it("falls slowly, in about a second and a half, when the music stops: the light dies away", () => {
        expect(nextBrightness(1, false, LAMP_FADE_OUT_MS)).toBe(0);
        expect(nextBrightness(1, false, LAMP_FADE_OUT_MS / 2)).toBeCloseTo(0.5, 5);
        expect(LAMP_FADE_OUT_MS).toBeGreaterThan(LAMP_FADE_IN_MS * 4);
    });

    it("never goes beyond 0 and 1", () => {
        expect(nextBrightness(0.9, true, 10_000)).toBe(1);
        expect(nextBrightness(0.1, false, 10_000)).toBe(0);
    });

    it("stays where it is when no time passed, or when it already is where it goes", () => {
        expect(nextBrightness(0.4, true, 0)).toBe(0.4);
        expect(nextBrightness(1, true, 500)).toBe(1);
        expect(nextBrightness(0, false, 500)).toBe(0);
    });

    it("picks up from where it was: a lamp that flickers off and on again does not start over", () => {
        const fallen = nextBrightness(1, false, LAMP_FADE_OUT_MS / 2);
        expect(nextBrightness(fallen, true, LAMP_FADE_IN_MS / 4)).toBeGreaterThan(fallen);
    });
});
