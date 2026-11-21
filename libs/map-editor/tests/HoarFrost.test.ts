import { describe, expect, it } from "vitest";
import {
    frostPoint,
    hoarFrost,
    iceSaturationPressure,
    surfaceTemperature,
    waterSaturationPressure,
} from "../src/Weather/HoarFrost";

describe("saturation pressures (WMO-No. 8, Annex 4.B)", () => {
    it("are 6.112 hPa at 0 °C over water and over ice, lower over ice below zero", () => {
        expect(waterSaturationPressure(0)).toBeCloseTo(6.112, 3);
        expect(iceSaturationPressure(0)).toBeCloseTo(6.112, 3);
        expect(waterSaturationPressure(-10)).toBeCloseTo(2.87, 2);
        expect(iceSaturationPressure(-10)).toBeCloseTo(2.6, 2);
    });

    it("give the frost point of an air: its temperature when saturated over ice, colder in drier air", () => {
        // 95 % over water at -2 °C is about 97 % over ice: the frost point is a little under the air.
        expect(frostPoint(-2, 95)).toBeLessThan(-2);
        expect(frostPoint(-2, 95)).toBeGreaterThan(-2.5);
        expect(frostPoint(-2, 40)).toBeLessThan(-10);
        expect(iceSaturationPressure(frostPoint(-5, 80))).toBeCloseTo(0.8 * waterSaturationPressure(-5), 6);
    });
});

describe("surfaceTemperature", () => {
    it("is under the air in a calm, and the air itself in a wind that stirs it", () => {
        expect(surfaceTemperature(-2, 0)).toBeLessThan(-2);
        expect(surfaceTemperature(-2, undefined)).toBe(surfaceTemperature(-2, 0));
        expect(surfaceTemperature(-2, 40)).toBe(-2);
        expect(surfaceTemperature(-2, 12)).toBeGreaterThan(surfaceTemperature(-2, 0));
        expect(surfaceTemperature(-2, 12)).toBeLessThan(-2);
    });
});

describe("hoarFrost", () => {
    it("is none over a surface above zero", () => {
        expect(hoarFrost({ temperature: 1, humidity: 100 })).toBe(0);
        expect(hoarFrost({ temperature: 5, humidity: 100 })).toBe(0);
    });

    it("whitens the ground in damp air just under zero", () => {
        expect(hoarFrost({ temperature: -2, humidity: 95 })).toBeGreaterThan(0.5);
    });

    it("is none in dry air, however cold: a black frost", () => {
        expect(hoarFrost({ temperature: -2, humidity: 40 })).toBe(0);
        expect(hoarFrost({ temperature: -15, humidity: 70 })).toBe(0);
        expect(hoarFrost({ temperature: -25, humidity: 50 })).toBe(0);
    });

    it("is less in a great cold, whose air holds little vapour", () => {
        expect(hoarFrost({ temperature: -15, humidity: 70 })).toBeLessThan(
            hoarFrost({ temperature: -2, humidity: 95 }),
        );
        expect(hoarFrost({ temperature: -30, humidity: 95 })).toBeLessThan(
            hoarFrost({ temperature: -2, humidity: 95 }),
        );
    });

    it("is held back by the wind", () => {
        const calm = hoarFrost({ temperature: -2, humidity: 95, windSpeed: 0 });
        expect(hoarFrost({ temperature: -2, humidity: 95, windSpeed: 12 })).toBeLessThan(calm);
        expect(hoarFrost({ temperature: -2, humidity: 95, windSpeed: 40 })).toBe(0);
    });

    it("grows with the humidity", () => {
        let last = 0;
        for (let humidity = 0; humidity <= 100; humidity += 5) {
            const frost = hoarFrost({ temperature: -4, humidity });
            expect(frost).toBeGreaterThanOrEqual(last);
            last = frost;
        }
        expect(last).toBeGreaterThan(0);
    });

    it("is none while the air is not known", () => {
        expect(hoarFrost(undefined)).toBe(0);
        expect(hoarFrost({ temperature: Number.NaN, humidity: 95 })).toBe(0);
        expect(hoarFrost({ temperature: -2, humidity: Number.NaN })).toBe(0);
    });

    it("stays between 0 and 1", () => {
        for (const temperature of [-40, -20, -10, -5, -1, 0, 3]) {
            for (const humidity of [0, 50, 90, 100]) {
                const frost = hoarFrost({ temperature, humidity });
                expect(frost).toBeGreaterThanOrEqual(0);
                expect(frost).toBeLessThanOrEqual(1);
            }
        }
    });
});
