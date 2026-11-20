import { describe, expect, it } from "vitest";
import { liquidRainRate, snowShare, snowShareOf, wetBulbTemperature } from "../src/Weather/Precipitation";

describe("wetBulbTemperature", () => {
    it("gives the worked example of Stull (2011): 20 °C at 50 % is 13.7 °C", () => {
        expect(wetBulbTemperature(20, 50)).toBeCloseTo(13.7, 1);
    });

    it("is the air temperature in saturated air, within the 0.3 °C of the fit, and colder in dry air", () => {
        expect(Math.abs(wetBulbTemperature(0, 99) - 0)).toBeLessThan(0.35);
        expect(Math.abs(wetBulbTemperature(10, 99) - 10)).toBeLessThan(0.35);
        expect(wetBulbTemperature(2, 40)).toBeLessThan(wetBulbTemperature(2, 95));
    });

    it("keeps the humidity within the range of the fit", () => {
        expect(wetBulbTemperature(5, 0)).toBe(wetBulbTemperature(5, 5));
        expect(wetBulbTemperature(5, 100)).toBe(wetBulbTemperature(5, 99));
    });
});

describe("snowShare", () => {
    it("is all snow when it freezes, all rain on a mild day", () => {
        expect(snowShare(-5, 80)).toBe(1);
        expect(snowShare(0, 90)).toBe(1);
        expect(snowShare(20, 60)).toBe(0);
        expect(snowShare(5, 90)).toBe(0);
    });

    it("snows in dry air at a temperature where damp air rains", () => {
        // 2 °C: wet bulb -2.3 °C at 40 %, 1.45 °C at 95 %.
        expect(snowShare(2, 40)).toBe(1);
        expect(snowShare(2, 95)).toBeLessThan(0.1);
    });

    it("mixes rain and snow between a wet bulb of 0.5 and 1.5 °C, half of each at 1 °C", () => {
        // In nearly saturated air the wet bulb is about the air temperature less 0.2 °C.
        expect(snowShare(0.5, 99)).toBe(1);
        expect(snowShare(2, 99)).toBe(0);
        const mixed = snowShare(1.2, 99);
        expect(mixed).toBeGreaterThan(0.4);
        expect(mixed).toBeLessThan(0.6);
    });

    it("never grows with the heat nor with the humidity", () => {
        for (const humidity of [10, 40, 70, 99]) {
            let before = 1;
            for (let temperature = -10; temperature <= 15; temperature += 0.25) {
                const share = snowShare(temperature, humidity);
                expect(share).toBeLessThanOrEqual(before + 1e-9);
                expect(share).toBeGreaterThanOrEqual(0);
                before = share;
            }
        }
        for (const temperature of [0, 1, 2, 3, 4, 5]) {
            let before = 1;
            for (let humidity = 5; humidity <= 100; humidity += 5) {
                const share = snowShare(temperature, humidity);
                expect(share).toBeLessThanOrEqual(before + 1e-9);
                before = share;
            }
        }
    });

    it("never snows from 6 °C of air, however dry", () => {
        expect(snowShare(6, 5)).toBe(0);
        expect(snowShare(10, 5)).toBe(0);
        // Under 4 °C the dry air alone decides.
        expect(snowShare(4, 30)).toBe(1);
    });

    it("rains when the temperature or the humidity is not a number", () => {
        expect(snowShare(Number.NaN, 50)).toBe(0);
        expect(snowShare(0, Number.NaN)).toBe(0);
        expect(snowShare(Number.POSITIVE_INFINITY, 50)).toBe(0);
    });
});

describe("snowShareOf", () => {
    it("rains while the conditions are not known", () => {
        expect(snowShareOf(undefined)).toBe(0);
    });

    it("reads the conditions of the room", () => {
        expect(snowShareOf({ temperature: -2, humidity: 80 })).toBe(1);
        expect(snowShareOf({ temperature: 20, humidity: 60 })).toBe(0);
    });
});

describe("liquidRainRate", () => {
    it("keeps the whole rate in the rain, nothing in the snow, the liquid part in between", () => {
        expect(liquidRainRate(4, { temperature: 20, humidity: 60 })).toBe(4);
        expect(liquidRainRate(4, { temperature: -2, humidity: 80 })).toBe(0);
        expect(liquidRainRate(4, undefined)).toBe(4);
        const mixed = liquidRainRate(4, { temperature: 1.2, humidity: 99 });
        expect(mixed).toBeGreaterThan(1.6);
        expect(mixed).toBeLessThan(2.4);
    });
});
