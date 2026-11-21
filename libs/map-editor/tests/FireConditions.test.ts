import { describe, expect, it } from "vitest";
import {
    boundedFireConditions,
    boundedFireThresholds,
    DEFAULT_FIRE_THRESHOLDS,
    fireDanger,
    fireDangerLevel,
    NEUTRAL_FIRE_CONDITIONS,
} from "../src/Weather/FireConditions";

const at = (temperature: number, humidity: number, windSpeed: number) => ({
    temperature,
    humidity,
    windSpeed,
    windFrom: 0,
});

describe("fireDanger", () => {
    it("is 1 at 30 degrees, 30 % of humidity and 30 km/h of wind", () => {
        expect(fireDanger(at(30, 30, 30), DEFAULT_FIRE_THRESHOLDS)).toBe(1);
    });

    it("is half of it without wind", () => {
        expect(fireDanger(at(30, 30, 0), DEFAULT_FIRE_THRESHOLDS)).toBe(0.5);
    });

    it("is nothing when it is cold or damp", () => {
        expect(fireDanger(at(15, 30, 30), DEFAULT_FIRE_THRESHOLDS)).toBe(0);
        expect(fireDanger(at(30, 60, 30), DEFAULT_FIRE_THRESHOLDS)).toBe(0);
    });

    it("rises with the heat over the 15 degrees under the threshold, and with the dryness over 30 points", () => {
        expect(fireDanger(at(22.5, 30, 30), DEFAULT_FIRE_THRESHOLDS)).toBeCloseTo(0.5, 6);
        expect(fireDanger(at(30, 45, 30), DEFAULT_FIRE_THRESHOLDS)).toBeCloseTo(0.5, 6);
    });

    it("never goes over 1, however hot, dry and windy", () => {
        expect(fireDanger(at(45, 5, 90), DEFAULT_FIRE_THRESHOLDS)).toBe(1);
    });

    it("goes by the thresholds of the room", () => {
        const thresholds = { temperature: 40, humidity: 20, windSpeed: 50 };
        expect(fireDanger(at(30, 30, 30), thresholds)).toBeCloseTo((5 / 15) * (0.5 + 0.5 * 0.6), 6);
    });
});

describe("fireDangerLevel", () => {
    it("is low, moderate, high then extreme", () => {
        expect([0, 0.24, 0.25, 0.49, 0.5, 0.99, 1].map(fireDangerLevel)).toEqual([0, 0, 1, 1, 2, 2, 3]);
    });
});

describe("the bounds of the conditions", () => {
    it("keeps each value within what it may be, and what is not a number as it was", () => {
        expect(
            boundedFireConditions(
                { temperature: 999, humidity: -5, windSpeed: Number.NaN, windFrom: 725 },
                NEUTRAL_FIRE_CONDITIONS,
            ),
        ).toEqual({ temperature: 50, humidity: 0, windSpeed: 10, windFrom: 5 });
        expect(boundedFireConditions({ temperature: Number.POSITIVE_INFINITY }, NEUTRAL_FIRE_CONDITIONS)).toEqual(
            NEUTRAL_FIRE_CONDITIONS,
        );
        expect(boundedFireConditions({ windFrom: -90 }, NEUTRAL_FIRE_CONDITIONS).windFrom).toBe(270);
    });

    it("lets the cold go down to -30 °C, to freeze a lake", () => {
        expect(boundedFireConditions({ temperature: -25 }, NEUTRAL_FIRE_CONDITIONS).temperature).toBe(-25);
        expect(boundedFireConditions({ temperature: -40 }, NEUTRAL_FIRE_CONDITIONS).temperature).toBe(-30);
    });

    it("keeps the thresholds within theirs", () => {
        expect(
            boundedFireThresholds({ temperature: -40, humidity: 0, windSpeed: 9999 }, DEFAULT_FIRE_THRESHOLDS),
        ).toEqual({ temperature: 0, humidity: 5, windSpeed: 120 });
        expect(boundedFireThresholds({ humidity: Number.NaN }, DEFAULT_FIRE_THRESHOLDS)).toEqual(
            DEFAULT_FIRE_THRESHOLDS,
        );
    });

    it("has neutral conditions that light no fire", () => {
        expect(NEUTRAL_FIRE_CONDITIONS).toEqual({ temperature: 20, humidity: 60, windSpeed: 10, windFrom: 315 });
        expect(fireDanger(NEUTRAL_FIRE_CONDITIONS, DEFAULT_FIRE_THRESHOLDS)).toBe(0);
    });
});
