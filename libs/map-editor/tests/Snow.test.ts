import { describe, expect, it } from "vitest";
import {
    rainMeltMm,
    snowByte,
    snowCoverOf,
    SNOW_HOLDS_WHILE_FALLING_C,
    snowMeltMmPerHour,
    snowMeltTemperature,
    snowMeltWeather,
    snowMmOfByte,
    snowSublimationMmPerHour,
} from "../src/Terrain/Snow";

describe("the snow lying on the ground", () => {
    it("covers the ground in full from 15 mm of water", () => {
        expect(snowCoverOf(0)).toBe(0);
        expect(snowCoverOf(7.5)).toBeCloseTo(0.5);
        expect(snowCoverOf(600)).toBe(1);
        expect(snowCoverOf(Number.NaN)).toBe(0);
    });

    it("melts with the heat, faster in the wind and in damp air", () => {
        // 10 °C, no wind, 50 % of humidity: 10 × 0.2 × 1 × 1 = 2 mm an hour.
        expect(snowMeltMmPerHour({ temperature: 10, humidity: 50, windSpeed: 0 })).toBeCloseTo(2);
        expect(snowMeltMmPerHour({ temperature: 10, humidity: 50, windSpeed: 20 })).toBeCloseTo(4);
        expect(snowMeltMmPerHour({ temperature: 10, humidity: 100, windSpeed: 0 })).toBeCloseTo(3);
    });

    it("does not melt at 0 °C nor under, nor in an air that is not known", () => {
        expect(snowMeltMmPerHour({ temperature: 0, humidity: 50, windSpeed: 30 })).toBe(0);
        expect(snowMeltMmPerHour({ temperature: -5, humidity: 50, windSpeed: 30 })).toBe(0);
        expect(snowMeltMmPerHour({ temperature: Number.NaN, humidity: 50, windSpeed: 0 })).toBe(0);
    });

    it("goes without water in a dry wind, at any temperature", () => {
        expect(snowSublimationMmPerHour({ temperature: -10, humidity: 20, windSpeed: 30 })).toBeCloseTo(0.48);
        expect(snowSublimationMmPerHour({ temperature: 5, humidity: 100, windSpeed: 30 })).toBe(0);
        expect(snowSublimationMmPerHour({ temperature: 5, humidity: Number.NaN, windSpeed: 30 })).toBe(0);
    });

    it("melts under a rain warmer than the ice, a tenth of the rain a degree", () => {
        expect(rainMeltMm(10, 5)).toBeCloseTo(5);
        expect(rainMeltMm(10, -2)).toBe(0);
        expect(rainMeltMm(Number.NaN, 5)).toBe(0);
    });

    it("is told in a byte, finer near no snow", () => {
        expect(snowByte(0)).toBe(0);
        expect(snowByte(600)).toBe(255);
        expect(snowByte(9999)).toBe(255);
        expect(snowMmOfByte(0)).toBe(0);
        expect(snowMmOfByte(snowByte(15))).toBeGreaterThan(14);
        expect(snowMmOfByte(snowByte(15))).toBeLessThan(16);
        // A thin snow is still told.
        expect(snowByte(0.5)).toBeGreaterThan(0);
    });
});

describe("the snow lying on the ground while snow falls on it", () => {
    // The air of Montréal on 2026-11-27 as the user saw it on the map: +1 °C, 96 %, a wind of 18 km/h.
    const montreal = { temperature: 1, humidity: 96, windSpeed: 18 };

    it("holds up to about +2 °C while it snows: it melts by an air 2 °C colder (choice of the user, 2026-11-27)", () => {
        expect(SNOW_HOLDS_WHILE_FALLING_C).toBe(2);
        expect(snowMeltTemperature(1, true)).toBe(-1);
        expect(snowMeltMmPerHour(snowMeltWeather(montreal, true))).toBe(0);
        expect(snowMeltMmPerHour(snowMeltWeather({ ...montreal, temperature: 2 }, true))).toBe(0);
    });

    it("melts weakly just over +2 °C while it snows, as at the degrees over +2 °C", () => {
        const mild = { ...montreal, temperature: 3 };
        expect(snowMeltMmPerHour(snowMeltWeather(mild, true))).toBeCloseTo(snowMeltMmPerHour(montreal), 9);
        expect(snowMeltMmPerHour(snowMeltWeather(mild, true))).toBeLessThan(snowMeltMmPerHour(mild));
    });

    it("melts as usual once the fall stops: the air itself", () => {
        expect(snowMeltTemperature(1, false)).toBe(1);
        expect(snowMeltWeather(montreal, false)).toBe(montreal);
        // T × 0.2 × (1 + 18 / 20) × (0.5 + 0.96) at +1 °C (the rule of the melt, above).
        expect(snowMeltMmPerHour(snowMeltWeather(montreal, false))).toBeCloseTo(1 * 0.2 * 1.9 * 1.46, 9);
    });
});
