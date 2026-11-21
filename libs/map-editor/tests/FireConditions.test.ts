import { describe, expect, it } from "vitest";
import {
    boundedFireConditions,
    boundedFireThresholds,
    DEFAULT_FIRE_THRESHOLDS,
    FIRE_CONDITION_BOUNDS,
    FIRE_THRESHOLD_BOUNDS,
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

    it("holds at the extremes of the conditions: none in a great cold, the highest in a dry heat and a storm", () => {
        for (const windSpeed of [0, 100, 180, 250]) {
            expect(fireDanger(at(-80, 5, windSpeed), DEFAULT_FIRE_THRESHOLDS)).toBe(0);
            expect(fireDanger(at(-40, 0, windSpeed), DEFAULT_FIRE_THRESHOLDS)).toBe(0);
            expect(fireDanger(at(80, 100, windSpeed), DEFAULT_FIRE_THRESHOLDS)).toBe(0);
        }
        expect(fireDanger(at(80, 0, 250), DEFAULT_FIRE_THRESHOLDS)).toBe(1);
        expect(fireDanger(at(60, 5, 0), DEFAULT_FIRE_THRESHOLDS)).toBe(0.5);
        expect(fireDangerLevel(fireDanger(at(80, 0, 250), DEFAULT_FIRE_THRESHOLDS))).toBe(3);
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
        ).toEqual({ temperature: 80, humidity: 0, windSpeed: 10, windFrom: 5 });
        expect(boundedFireConditions({ temperature: Number.POSITIVE_INFINITY }, NEUTRAL_FIRE_CONDITIONS)).toEqual(
            NEUTRAL_FIRE_CONDITIONS,
        );
        expect(boundedFireConditions({ windFrom: -90 }, NEUTRAL_FIRE_CONDITIONS).windFrom).toBe(270);
    });

    it("takes a cold of -80 to a heat of +80 degrees and a wind of up to 250 km/h, and brings back what is beyond", () => {
        expect(FIRE_CONDITION_BOUNDS).toEqual({ temperature: [-80, 80], humidity: [0, 100], windSpeed: [0, 250] });
        const kept = (temperature: number, windSpeed: number) =>
            boundedFireConditions({ temperature, windSpeed }, NEUTRAL_FIRE_CONDITIONS);
        expect(kept(-80, 250)).toMatchObject({ temperature: -80, windSpeed: 250 });
        expect(kept(80, 0)).toMatchObject({ temperature: 80, windSpeed: 0 });
        expect(kept(-81, 251)).toMatchObject({ temperature: -80, windSpeed: 250 });
        expect(kept(81, -1)).toMatchObject({ temperature: 80, windSpeed: 0 });
    });

    it("keeps the thresholds within theirs, each still reached by the conditions", () => {
        for (const key of ["temperature", "humidity", "windSpeed"] as const) {
            expect(FIRE_THRESHOLD_BOUNDS[key][0]).toBeGreaterThanOrEqual(FIRE_CONDITION_BOUNDS[key][0]);
            expect(FIRE_THRESHOLD_BOUNDS[key][1]).toBeLessThanOrEqual(FIRE_CONDITION_BOUNDS[key][1]);
        }
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
