import { describe, expect, it } from "vitest";
import { DRAIN_TURN_MS, drainSwirl } from "../../../../../src/front/Phaser/Game/Catastrophe/DrainSwirl";

describe("drainSwirl", () => {
    it("draws three arms that wind from the rim to the middle, within the circle of the square", () => {
        const arms = drainSwirl(0, false);
        expect(arms).toHaveLength(3);
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
