import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    groundWetness,
    PUDDLE_DRY_MS,
    PUDDLE_FILL_MS,
    puddleRows,
    puddlesIn,
} from "../../../../../src/front/Phaser/Game/Weather/Puddles";

const view = { x: 0, y: 0, width: 1920, height: 1080 };

describe("groundWetness", () => {
    it("fills over the first minutes of a rain, a rain without a date having always fallen", () => {
        expect(groundWetness(WeatherType.Rain, 1000, 1000)).toBe(0);
        expect(groundWetness(WeatherType.Rain, 1000 + PUDDLE_FILL_MS / 2, 1000)).toBeCloseTo(0.5);
        expect(groundWetness(WeatherType.Storm, 1000 + 2 * PUDDLE_FILL_MS, 1000)).toBe(1);
        expect(groundWetness(WeatherType.Rain, 1000)).toBe(1);
    });

    it("stays dry without rain, and dries after a real rain that stopped", () => {
        expect(groundWetness(WeatherType.Clear, 1000)).toBe(0);
        expect(groundWetness(WeatherType.Snow, 1000, 0)).toBe(0);
        expect(groundWetness(WeatherType.Clear, 5000, undefined, undefined, 5000)).toBe(1);
        expect(groundWetness(WeatherType.Clear, 5000 + PUDDLE_DRY_MS / 2, undefined, undefined, 5000)).toBeCloseTo(0.5);
        expect(groundWetness(WeatherType.Fog, 5000 + PUDDLE_DRY_MS, undefined, undefined, 5000)).toBe(0);
    });
});

describe("puddlesIn", () => {
    it("has none on a dry ground, more and bigger ones as it gets wet, at the same places", () => {
        expect(puddlesIn(view, 0)).toEqual([]);
        const few = puddlesIn(view, 0.3);
        const soaked = puddlesIn(view, 1);
        expect(few.length).toBeGreaterThan(0);
        expect(soaked.length).toBeGreaterThan(few.length);
        for (const puddle of few) {
            const later = soaked.find((other) => other.x === puddle.x && other.y === puddle.y);
            expect(later?.radiusX).toBeGreaterThan(puddle.radiusX);
        }
    });

    it("keeps the puddles where they are when the camera moves, bigger with the personal size", () => {
        const here = puddlesIn(view, 1);
        const moved = puddlesIn({ ...view, x: 300 }, 1);
        for (const puddle of moved.filter((other) => other.x > 300 && other.x < 1900))
            expect(here).toContainEqual(puddle);
        expect(puddlesIn(view, 1, 2)[0].radiusX).toBeCloseTo(here[0].radiusX * 2);
    });

    it("draws a puddle as rows of pixels inside its oval, the same each time", () => {
        const puddle = puddlesIn(view, 1)[0];
        const rows = puddleRows(puddle);
        expect(rows.length).toBeGreaterThan(1);
        expect(puddleRows(puddle)).toEqual(rows);
        for (const row of rows) {
            expect(row.x).toBeGreaterThanOrEqual(puddle.x - puddle.radiusX - 4);
            expect(row.x + row.width).toBeLessThanOrEqual(puddle.x + puddle.radiusX + 4);
        }
    });
});
