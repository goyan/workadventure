import { describe, expect, it } from "vitest";
import {
    DRAIN_ARMS,
    DRAIN_TURN_MS,
    drainRim,
    drainRings,
    drainStreaks,
    drainSwirl,
} from "../../../../../src/front/Phaser/Game/Catastrophe/DrainSwirl";

describe("drainSwirl", () => {
    it("draws five arms that wind from the rim to the middle, within the disc", () => {
        const arms = drainSwirl(0, false);
        expect(DRAIN_ARMS).toBe(5);
        expect(arms).toHaveLength(5);
        for (const arm of arms) {
            expect(arm.length).toBeGreaterThanOrEqual(8);
            for (const point of arm) expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(1.0001);
            expect(Math.hypot(arm[0].x, arm[0].y)).toBeGreaterThan(0.8);
            expect(Math.hypot(arm.at(-1)?.x ?? 1, arm.at(-1)?.y ?? 1)).toBeLessThan(0.2);
        }
    });

    it("turns with the time, a whole turn bringing it back", () => {
        const start = drainSwirl(0, false)[0][0];
        const quarter = drainSwirl(DRAIN_TURN_MS / 4, false)[0][0];
        expect(Math.hypot(quarter.x - start.x, quarter.y - start.y)).toBeGreaterThan(0.5);
        const turn = drainSwirl(DRAIN_TURN_MS, false)[0][0];
        expect(turn.x).toBeCloseTo(start.x);
        expect(turn.y).toBeCloseTo(start.y);
    });

    it("stays still for who asked for less motion", () => {
        expect(drainSwirl(DRAIN_TURN_MS / 4, true)).toEqual(drainSwirl(0, true));
    });
});

describe("drainStreaks", () => {
    const far = (point: { x: number; y: number }): number => Math.hypot(point.x, point.y);

    it("draws as many streaks of water as asked, all within the disc, each with a tail behind it", () => {
        const streaks = drainStreaks(700, 24, false);
        expect(streaks).toHaveLength(24);
        for (const streak of streaks) {
            expect(far(streak)).toBeLessThanOrEqual(1.0001);
            expect(far({ x: streak.tailX, y: streak.tailY })).toBeLessThanOrEqual(1.0001);
            // The tail is where the water was: further from the middle than its head.
            expect(far({ x: streak.tailX, y: streak.tailY })).toBeGreaterThanOrEqual(far(streak) - 1e-9);
            expect(streak.alpha).toBeGreaterThanOrEqual(0);
            expect(streak.alpha).toBeLessThanOrEqual(1);
        }
    });

    it("falls towards the middle while it turns, then is born again at the rim", () => {
        // The first streak starts at the rim.
        const born = drainStreaks(0, 8, false)[0];
        const later = drainStreaks(600, 8, false)[0];
        const latest = drainStreaks(1200, 8, false)[0];
        expect(far(born)).toBeGreaterThan(0.95);
        expect(far(later)).toBeLessThan(far(born));
        expect(far(latest)).toBeLessThan(far(later));
        // It turned around the middle on its way.
        expect(Math.atan2(later.y, later.x)).not.toBeCloseTo(Math.atan2(born.y, born.x));
        const again = drainStreaks(1800, 8, false)[0];
        expect(far(again)).toBeGreaterThan(0.95);
    });

    it("turns faster near the middle than at the rim", () => {
        const angle = (ms: number, index: number): number => {
            const streak = drainStreaks(ms, 8, false)[index];
            return Math.atan2(streak.y, streak.x);
        };
        const turned = (from: number, to: number): number => {
            const gone = Math.abs(angle(to, 0) - angle(from, 0));
            return Math.min(gone, 2 * Math.PI - gone);
        };
        expect(turned(1500, 1560)).toBeGreaterThan(turned(60, 120));
    });

    it("stays still for who asked for less motion", () => {
        expect(drainStreaks(900, 12, true)).toEqual(drainStreaks(0, 12, true));
    });
});

describe("drainRings", () => {
    it("darkens towards the middle: rings from the rim to the eye", () => {
        const rings = drainRings();
        expect(rings.length).toBeGreaterThanOrEqual(4);
        expect(rings[0].radius).toBe(1);
        for (let index = 1; index < rings.length; index++) {
            expect(rings[index].radius).toBeLessThan(rings[index - 1].radius);
            expect(rings[index].alpha).toBeGreaterThan(rings[index - 1].alpha);
        }
    });
});

describe("drainRim", () => {
    it("is a ragged circle of foam around the disc, moving with the time and still in reduced motion", () => {
        const rim = drainRim(0, 48, false);
        expect(rim).toHaveLength(48);
        for (const radius of rim) {
            expect(radius).toBeGreaterThan(0.9);
            expect(radius).toBeLessThan(1.1);
        }
        expect(new Set(rim.map((radius) => radius.toFixed(3))).size).toBeGreaterThan(4);
        expect(drainRim(400, 48, false)).not.toEqual(rim);
        expect(drainRim(400, 48, true)).toEqual(drainRim(0, 48, true));
    });
});
