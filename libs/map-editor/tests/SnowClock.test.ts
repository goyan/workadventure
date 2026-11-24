import { describe, expect, it } from "vitest";
import { ICE_BEARS_MM } from "../src/Terrain/Ice";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import { snowMeltMmPerHour } from "../src/Terrain/Snow";
import type { SnowWeather } from "../src/Terrain/Snow";
import { stepInputOf, waterTimesOf } from "../src/Terrain/WaterInputs";
import { Season } from "../src/types";

const night: MeadowStepInput = {
    seconds: MEADOW_STEP_SECONDS,
    rainMmPerHour: 0,
    daylight: false,
    season: Season.Summer,
    waterAt: () => 0,
    random: () => 1,
};
const size = { width: 21, height: 21 };
const mild: SnowWeather = { temperature: 10, humidity: 50, windSpeed: 0 };
const cold: SnowWeather = { temperature: -10, humidity: 100, windSpeed: 0 };

describe("one clock for the water, the snow and the ice", () => {
    it("is the speed of the water of the map: reality when it says nothing", () => {
        expect(waterTimesOf(undefined)).toBe(1);
        expect(waterTimesOf({ speed: 60 })).toBe(60);
        expect(waterTimesOf({ speed: Number.NaN })).toBe(1);
        // The same factor the water takes: a source pours 60 times more in the same second at 60.
        const source = [{ cellX: 0, cellY: 0, litresPerMinute: 60, radiusCells: 0 }];
        expect(
            stepInputOf(
                { speed: 60, runoff: 0, evaporation: 0, absorption: 0, current: 1, maxSurface: 256, indoorDrain: 0 },
                0,
                source,
                1,
            ).flows[0].px,
        ).toBeCloseTo(stepInputOf(undefined, 0, source, 60).flows[0].px, 9);
    });

    it("melts the snow in real time when the meadow is told no other clock", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 20);
        meadow.step({ ...night, weather: mild });
        const melt = (snowMeltMmPerHour(mild) * MEADOW_STEP_SECONDS) / 3600;
        expect(meadow.snowAt(10, 10)).toBeCloseTo(20 - melt, 5);
        // Sixty times faster on a map whose water goes sixty times faster.
        const fast = new Meadow(size, undefined, undefined);
        fast.snowOn(10, 10, 0, 20);
        fast.step({ ...night, weather: mild, snowTimes: 60 });
        expect(fast.snowAt(10, 10)).toBeCloseTo(20 - 60 * melt, 5);
    });

    it("takes the ice in real time too: no ice that bears a walker after a minute at -10 °C", () => {
        const deep = () => 64;
        const meadow = new Meadow(size, undefined, undefined);
        for (let step = 0; step < 30; step++) meadow.step({ ...night, weather: cold, waterAt: deep });
        expect(meadow.iceAt(10, 10)).toBeLessThan(ICE_BEARS_MM);
        const fast = new Meadow(size, undefined, undefined);
        for (let step = 0; step < 30; step++) fast.step({ ...night, weather: cold, waterAt: deep, snowTimes: 600 });
        expect(fast.iceAt(10, 10)).toBeGreaterThan(ICE_BEARS_MM);
    });
});
