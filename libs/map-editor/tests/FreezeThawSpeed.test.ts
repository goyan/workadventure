import { describe, expect, it } from "vitest";
import { UpdateWAMSettingCommand } from "../src/Commands/WAM/UpdateWAMSettingCommand";
import { ICE_BEARS_MM } from "../src/Terrain/Ice";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import type { SnowWeather } from "../src/Terrain/Snow";
import { freezeThawSpeedOf, freezeThawTimesOf, PX_PER_MM, waterTimesOf } from "../src/Terrain/WaterInputs";
import { FREEZE_THAW_SPEED_STEPS, MAX_FREEZE_THAW_SPEED, Season } from "../src/types";
import type { WAMFileFormat } from "../src/types";

const night: MeadowStepInput = {
    seconds: MEADOW_STEP_SECONDS,
    rainMmPerHour: 0,
    daylight: false,
    season: Season.Summer,
    waterAt: () => 64,
    random: () => 1,
};
const size = { width: 5, height: 5 };
const cold: SnowWeather = { temperature: -10, humidity: 100, windSpeed: 0 };
const deepCold: SnowWeather = { temperature: -30, humidity: 100, windSpeed: 30 };

describe("the speed of the freeze and the thaw of a map", () => {
    it("is 1 on a map that says nothing, within its bounds otherwise", () => {
        expect(freezeThawSpeedOf(undefined)).toBe(1);
        expect(freezeThawSpeedOf({})).toBe(1);
        expect(freezeThawSpeedOf({ freezeThawSpeed: 60 })).toBe(60);
        expect(freezeThawSpeedOf({ freezeThawSpeed: 1e6 })).toBe(MAX_FREEZE_THAW_SPEED);
        expect(freezeThawSpeedOf({ freezeThawSpeed: 0.2 })).toBe(1);
        expect(freezeThawSpeedOf({ freezeThawSpeed: Number.NaN })).toBe(1);
        expect(FREEZE_THAW_SPEED_STEPS).toEqual([1, 10, 60, 600]);
    });

    it("goes over the speed of the water: the clock of the cold is the clock of the water times it", () => {
        expect(freezeThawTimesOf(undefined)).toBe(1);
        expect(freezeThawTimesOf({ speed: 1, freezeThawSpeed: 60 })).toBe(60);
        expect(freezeThawTimesOf({ speed: 10, freezeThawSpeed: 60 })).toBe(600);
        // The water itself keeps its own clock.
        const water = { speed: 1, freezeThawSpeed: 60 };
        expect(waterTimesOf(water)).toBe(1);
    });

    it("is kept in the map within its bounds, as the map had it when a client says nothing of it", async () => {
        const wam: WAMFileFormat = {
            version: "1.0.0",
            mapUrl: "map.tmj",
            entities: {},
            areas: [],
            entityCollections: [],
            settings: {},
        };
        const send = (sent: Record<string, number>): Promise<unknown> =>
            new UpdateWAMSettingCommand(wam, {
                message: {
                    $case: "updateWaterSettingMessage",
                    updateWaterSettingMessage: { runoff: 4, evaporation: 0.5, ...sent },
                },
            }).execute();
        await send({});
        expect(wam.settings?.water).not.toHaveProperty("freezeThawSpeed");
        await send({ freezeThawSpeed: 60 });
        expect(wam.settings?.water?.freezeThawSpeed).toBe(60);
        await send({});
        expect(wam.settings?.water?.freezeThawSpeed).toBe(60);
        await send({ freezeThawSpeed: 99999 });
        expect(wam.settings?.water?.freezeThawSpeed).toBe(MAX_FREEZE_THAW_SPEED);
        await send({ freezeThawSpeed: 0 });
        expect(wam.settings?.water?.freezeThawSpeed).toBe(1);
        await send({ freezeThawSpeed: Number.NaN });
        expect(wam.settings?.water?.freezeThawSpeed).toBe(1);
    });
});

describe("the ice on a fast clock", () => {
    /** The ice of a tile after `steps` steps of the meadow on a clock `times` faster than reality. */
    const iceAfter = (weather: SnowWeather, times: number, steps: number): number => {
        const meadow = new Meadow(size, undefined, undefined);
        for (let step = 0; step < steps; step++) meadow.step({ ...night, weather, snowTimes: times });
        return meadow.iceAt(2, 2);
    };

    it("takes as much in a few long steps as in many short ones: the growth of a step is not overshot", () => {
        // Ten hours at -30 °C in a wind: as ten hours lived by steps of two minutes (×60).
        const fine = iceAfter(deepCold, 60, 300);
        // Ten hours in five steps of two hours (×3600).
        const coarse = iceAfter(deepCold, 3600, 5);
        expect(coarse).toBeGreaterThan(ICE_BEARS_MM);
        expect(Math.abs(coarse - fine) / fine).toBeLessThan(0.02);
    });

    it("at ×600 over the water at ×600: an hour of frost in each step stays the ice of that many hours", () => {
        // A day at -10 °C, lived in 12 steps of two hours (×3600) or in 720 steps of two minutes (×60).
        const fine = iceAfter(cold, 60, 720);
        const coarse = iceAfter(cold, 3600, 12);
        expect(Math.abs(coarse - fine) / fine).toBeLessThan(0.02);
        // Eight days in one step: a thick ice, never more than the water under it, never a number that is not one.
        const firstStep = iceAfter(cold, 360_000, 1);
        expect(Number.isFinite(firstStep)).toBe(true);
        expect(firstStep).toBeGreaterThan(ICE_BEARS_MM);
        expect(firstStep).toBeLessThanOrEqual(64 / PX_PER_MM + 1e-6);
    });

    it("lives as before on the clocks of today, to the bit (a step of under an hour)", () => {
        const before = new Meadow(size, undefined, undefined);
        const again = new Meadow(size, undefined, undefined);
        for (let step = 0; step < 20; step++) {
            before.step({ ...night, weather: cold, snowTimes: 600 });
            again.step({ ...night, weather: cold, snowTimes: 600 });
        }
        expect(again.iceAt(2, 2)).toBe(before.iceAt(2, 2));
        // 600 × 2 s is 20 minutes: the step of today. A thousand times: 33 minutes, still under the hour.
        expect(iceAfter(cold, 1000, 3)).toBeGreaterThan(0);
    });
});
