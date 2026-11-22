import { describe, expect, it } from "vitest";
import { FAST_WATER_TIMES, roomWaterOf, stepInputOf, waterTimesOf } from "../src/Terrain/WaterInputs";
import { DEFAULT_WATER_SETTINGS } from "../src/types";

describe("the fast water of a room", () => {
    it("goes sixty times faster than reality", () => {
        expect(FAST_WATER_TIMES).toBe(60);
    });

    it("gives the water of the room the fast speed while it is on, and the speed of the map otherwise", () => {
        expect(waterTimesOf(roomWaterOf(undefined, undefined))).toBe(1);
        expect(waterTimesOf(roomWaterOf(undefined, FAST_WATER_TIMES))).toBe(60);
        expect(waterTimesOf(roomWaterOf({ ...DEFAULT_WATER_SETTINGS, speed: 4 }, FAST_WATER_TIMES))).toBe(60);
        // A map already faster keeps its own speed: the fast water never slows it down.
        expect(waterTimesOf(roomWaterOf({ ...DEFAULT_WATER_SETTINGS, speed: 300 }, FAST_WATER_TIMES))).toBe(300);
        expect(waterTimesOf(roomWaterOf({ ...DEFAULT_WATER_SETTINGS, speed: 4 }, 0))).toBe(4);
    });

    it("leaves the settings of the map as they are", () => {
        const water = { ...DEFAULT_WATER_SETTINGS, speed: 4 };
        roomWaterOf(water, FAST_WATER_TIMES);
        expect(water.speed).toBe(4);
        expect(roomWaterOf(water, undefined)).toBe(water);
    });

    it("pours sixty times what the source gives in the same second", () => {
        const source = [{ cellX: 0, cellY: 0, litresPerMinute: 60, radiusCells: 0 }];
        const real = stepInputOf(undefined, 0, source, 1).flows[0].px;
        expect(stepInputOf(roomWaterOf(undefined, FAST_WATER_TIMES), 0, source, 1).flows[0].px).toBeCloseTo(
            60 * real,
            9,
        );
    });
});
