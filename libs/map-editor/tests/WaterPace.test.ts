import { describe, expect, it } from "vitest";
import { WATER_PACE_SERVER_BUDGET_MS, WATER_PACE_WORKER_BUDGET_MS, WaterPace } from "../src/Terrain/WaterPace";

/** Steps of the water whose sub-steps cost `msEach`, for `count` steps: the number of sub-steps a step after them. */
function run(pace: WaterPace, asked: number, msEach: number, count: number): number {
    for (let step = 0; step < count; step++) {
        const times = pace.times(asked);
        pace.record(times * msEach, asked);
    }
    return pace.times(asked);
}

describe("how many steps of its time the water of a map lives in a step of the real clock", () => {
    it("takes 15 ms a step on the server, never near where the fineness is lowered; half a core in a worker", () => {
        expect(WATER_PACE_SERVER_BUDGET_MS).toBe(15);
        expect(WATER_PACE_WORKER_BUDGET_MS).toBe(50);
    });

    it("leaves a room whose step at the pace of reality already takes its budget at that pace", () => {
        // 13 ms a step, the map of the entry under water on the server: no faster.
        expect(run(new WaterPace(), 60, 13, 200)).toBe(1);
        // 1 ms a step: fifteen.
        expect(run(new WaterPace(), 60, 1, 200)).toBeLessThanOrEqual(15);
        expect(run(new WaterPace(), 60, 1, 200)).toBeGreaterThanOrEqual(7);
    });

    it("is one for a map at the pace of reality, whatever the machine", () => {
        expect(run(new WaterPace(50), 1, 0.1, 50)).toBe(1);
    });

    it("climbs to what the map asks, a few seconds after it asked, when the machine holds it", () => {
        const pace = new WaterPace(50);
        // Never all at once: the first step of a map sixty times faster is not sixty steps long.
        expect(pace.times(60)).toBe(1);
        // 0.5 ms a step of the water: sixty of them take 30 ms, under the half of 100 ms.
        expect(run(pace, 60, 0.5, 100)).toBe(60);
    });

    it("keeps under the half of the time between two steps when the machine cannot hold what is asked", () => {
        const pace = new WaterPace(50);
        // 5 ms a step of the water: no more than ten in 50 ms.
        const times = run(pace, 60, 5, 200);
        expect(times).toBeLessThanOrEqual(10);
        expect(times).toBeGreaterThanOrEqual(5);
    });

    it("falls at once when the steps grow costly, and never under one", () => {
        const pace = new WaterPace(50);
        expect(run(pace, 60, 0.5, 100)).toBe(60);
        // The water spreads: 20 ms a step now.
        expect(run(pace, 60, 20, 30)).toBeLessThanOrEqual(3);
        expect(run(pace, 60, 200, 30)).toBe(1);
    });

    it("never goes over what is asked", () => {
        const pace = new WaterPace(50);
        expect(run(pace, 4, 0.01, 200)).toBe(4);
        expect(pace.times(2)).toBe(2);
    });
});
