import { describe, expect, it } from "vitest";
import {
    effectiveStrobeHz,
    SAFE_STROBE_HZ,
    strobeFlashAlpha,
    strobeFlashDurationMs,
} from "../../../../../src/front/Phaser/Game/Lamps/StrobeClock";

describe("effectiveStrobeHz", () => {
    it("shows at most 3 flashes a second to a player who did not turn fast strobes on: the photosensitivity ceiling", () => {
        expect(SAFE_STROBE_HZ).toBe(3);
        expect(effectiveStrobeHz(2, { fastStrobes: false })).toBe(2);
        expect(effectiveStrobeHz(3, { fastStrobes: false })).toBe(3);
        expect(effectiveStrobeHz(10, { fastStrobes: false })).toBe(3);
        expect(effectiveStrobeHz(12, { fastStrobes: false })).toBe(3);
    });

    it("shows the rate of the lamp, up to 12 a second, to a player who turned fast strobes on", () => {
        expect(effectiveStrobeHz(10, { fastStrobes: true })).toBe(10);
        expect(effectiveStrobeHz(12, { fastStrobes: true })).toBe(12);
        expect(effectiveStrobeHz(40, { fastStrobes: true })).toBe(12);
    });

    it("never goes under half a flash a second, nor takes a nonsense rate for a rate", () => {
        expect(effectiveStrobeHz(0.1, { fastStrobes: false })).toBe(0.5);
        expect(effectiveStrobeHz(0, { fastStrobes: true })).toBe(0.5);
        expect(effectiveStrobeHz(Number.NaN, { fastStrobes: false })).toBe(2);
    });

    it("uses 2 flashes a second when the lamp sets no rate", () => {
        expect(effectiveStrobeHz(undefined, { fastStrobes: false })).toBe(2);
    });
});

describe("strobeFlashDurationMs", () => {
    it("is a fifth of the period, between one image and 60 ms: long enough to be seen, short enough to be a flash", () => {
        expect(strobeFlashDurationMs(0.5)).toBe(60);
        expect(strobeFlashDurationMs(2)).toBe(60);
        expect(strobeFlashDurationMs(3)).toBeCloseTo(60, 5);
        expect(strobeFlashDurationMs(10)).toBeCloseTo(20, 5);
        expect(strobeFlashDurationMs(12)).toBeGreaterThanOrEqual(16);
    });
});

describe("strobeFlashAlpha", () => {
    it("is full when a period starts and gone once the flash is over", () => {
        expect(strobeFlashAlpha(0, 2)).toBe(1);
        expect(strobeFlashAlpha(strobeFlashDurationMs(2), 2)).toBe(0);
        expect(strobeFlashAlpha(250, 2)).toBe(0);
    });

    it("fades during the flash, never rising again within it", () => {
        let previous = 1;
        for (let time = 0; time <= strobeFlashDurationMs(2); time += 2) {
            const alpha = strobeFlashAlpha(time, 2);
            expect(alpha).toBeLessThanOrEqual(previous);
            previous = alpha;
        }
    });

    it("comes again at every period: at 2 flashes a second, every 500 ms", () => {
        expect(strobeFlashAlpha(500, 2)).toBe(1);
        expect(strobeFlashAlpha(1000, 2)).toBe(1);
        expect(strobeFlashAlpha(1500 + 30, 2)).toBeGreaterThan(0);
    });

    it("does not depend on the music: it is a clock", () => {
        // Same answer whatever else is going on: only the time and the rate count.
        expect(strobeFlashAlpha(1234, 5)).toBe(strobeFlashAlpha(1234, 5));
    });

    // The safety of the whole feature: count the flashes a player actually sees, over a few seconds, in every window of
    // one second.
    function maxFlashesInOneSecond(hz: number): number {
        const onsets: number[] = [];
        let wasLit = false;
        for (let time = 0; time < 6000; time += 1) {
            const lit = strobeFlashAlpha(time, hz) > 0;
            if (lit && !wasLit) {
                onsets.push(time);
            }
            wasLit = lit;
        }
        return Math.max(...onsets.map((start) => onsets.filter((time) => time >= start && time < start + 1000).length));
    }

    it("never shows more than 3 flashes in any second at the rate a player who did not opt in gets, whatever the lamp asks", () => {
        for (const requested of [0.5, 1, 2, 3, 5, 8, 10, 12]) {
            const hz = effectiveStrobeHz(requested, { fastStrobes: false });
            expect(maxFlashesInOneSecond(hz)).toBeLessThanOrEqual(3);
        }
    });

    it("shows the fast rates to a player who opted in", () => {
        expect(maxFlashesInOneSecond(effectiveStrobeHz(10, { fastStrobes: true }))).toBe(10);
    });
});
