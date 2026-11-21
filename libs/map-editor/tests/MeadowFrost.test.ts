import { describe, expect, it } from "vitest";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import { liquidRainRate } from "../src/Weather/Precipitation";
import { SOIL_FROZEN_UNDER, SOIL_THAWED_FROM, soilFrost, soilFrostOf } from "../src/Weather/SoilFrost";
import { Season } from "../src/types";

/** A dry spring day: the grass would grow on a moist soil, and dies of thirst on a dry one. */
const day: MeadowStepInput = {
    seconds: MEADOW_STEP_SECONDS,
    rainMmPerHour: 0,
    daylight: true,
    season: Season.Spring,
    waterAt: () => 0,
    random: () => 1,
};
const size = { width: 9, height: 7 };
const run = (meadow: Meadow, seconds: number, input: MeadowStepInput): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += MEADOW_STEP_SECONDS) meadow.step(input);
};
/** A meadow all alike. */
const meadowOf = (moisture: number, grass: number, dryness = 0): Meadow => {
    const meadow = new Meadow(size, undefined, undefined);
    for (let y = 0; y < size.height; y++)
        for (let x = 0; x < size.width; x++) meadow.set(x, y, moisture, grass, dryness);
    return meadow;
};
const at = (temperature: number): MeadowStepInput => ({ ...day, soilFrost: soilFrost(temperature) });

describe("the frost of the soil", () => {
    it("freezes the soil gradually around 0 °C, and not while the air is not known", () => {
        expect(SOIL_FROZEN_UNDER).toBe(-1);
        expect(SOIL_THAWED_FROM).toBe(1);
        expect(soilFrost(-5)).toBe(1);
        expect(soilFrost(-1)).toBe(1);
        expect(soilFrost(-0.5)).toBeCloseTo(0.75);
        expect(soilFrost(0)).toBeCloseTo(0.5);
        expect(soilFrost(0.5)).toBeCloseTo(0.25);
        expect(soilFrost(1)).toBe(0);
        expect(soilFrost(15)).toBe(0);
        expect(soilFrost(undefined)).toBe(0);
        expect(soilFrost(Number.NaN)).toBe(0);
        expect(soilFrostOf(undefined)).toBe(0);
        expect(soilFrostOf({ temperature: -3, humidity: 80 })).toBe(1);
    });

    it("keeps the water of a frozen soil: it neither dries nor spreads", () => {
        const meadow = meadowOf(0.5, 0.5);
        meadow.set(4, 3, 0.9, 0.5);
        const wet = meadow.moistureAt(4, 3);
        run(meadow, 1800, at(-5));
        expect(meadow.moistureAt(0, 0)).toBe(0.5);
        expect(meadow.moistureAt(4, 3)).toBe(wet);
        expect(meadow.moistureAt(3, 3)).toBe(0.5);
    });

    it("keeps the grass dormant: it neither grows nor dies of thirst", () => {
        const moist = meadowOf(0.5, 0.5);
        run(moist, 1800, at(-5));
        expect(moist.grassAt(4, 3)).toBe(0.5);
        const parched = meadowOf(0.02, 1);
        run(parched, 1800, at(-5));
        expect(parched.grassAt(4, 3)).toBe(1);
        // The same dry soil in a mild air: the grass is dead of thirst within the half hour.
        const mild = meadowOf(0.02, 1);
        run(mild, 1800, at(5));
        expect(mild.grassAt(4, 3)).toBe(0);
    });

    it("keeps the grass alive under a snowfall, which brings no water", () => {
        const air = { temperature: -5, humidity: 85 };
        const meadow = meadowOf(0.05, 1);
        run(meadow, 1800, { ...day, rainMmPerHour: liquidRainRate(3, air), soilFrost: soilFrostOf(air) });
        expect(meadow.grassAt(4, 3)).toBe(1);
    });

    it("neither yellows nor greens the grass of a frozen soil", () => {
        const straw = meadowOf(0.5, 1, 0.6);
        const yellow = straw.drynessAt(4, 3);
        run(straw, 600, at(-5));
        expect(straw.drynessAt(4, 3)).toBe(yellow);
        // Thawed, on a moist soil and without danger, it greens again.
        const thawed = meadowOf(0.5, 1, 0.6);
        run(thawed, 600, at(5));
        expect(thawed.drynessAt(4, 3)).toBeLessThan(0.01);
    });

    it("changes nothing above the thaw, as when the air is not known", () => {
        const known = meadowOf(0.6, 0.4, 0.3);
        const unknown = meadowOf(0.6, 0.4, 0.3);
        known.set(2, 2, 0.1, 0.9, 0);
        unknown.set(2, 2, 0.1, 0.9, 0);
        run(known, 600, at(5));
        run(unknown, 600, day);
        for (let y = 0; y < size.height; y++) {
            for (let x = 0; x < size.width; x++) {
                expect(known.moistureAt(x, y)).toBe(unknown.moistureAt(x, y));
                expect(known.grassAt(x, y)).toBe(unknown.grassAt(x, y));
                expect(known.drynessAt(x, y)).toBe(unknown.drynessAt(x, y));
            }
        }
    });

    it("dries a soil the less the more frozen it is, between the two thresholds", () => {
        const after = (temperature: number): number => {
            const meadow = meadowOf(0.6, 0.5);
            const before = meadow.moistureAt(4, 3);
            run(meadow, 600, at(temperature));
            return before - meadow.moistureAt(4, 3);
        };
        const losses = [-1, -0.5, 0, 0.5, 1].map(after);
        expect(losses[0]).toBe(0);
        for (let i = 1; i < losses.length; i++) expect(losses[i]).toBeGreaterThan(losses[i - 1]);
    });

    it("dries again at the thaw", () => {
        const meadow = meadowOf(0.6, 0.5);
        const before = meadow.moistureAt(4, 3);
        run(meadow, 600, at(-5));
        expect(meadow.moistureAt(4, 3)).toBe(before);
        run(meadow, 600, at(5));
        expect(meadow.moistureAt(4, 3)).toBeLessThan(0.55);
    });

    it("holds the grass back after a fire until the thaw", () => {
        const meadow = meadowOf(0.1, 1, 1);
        meadow.ignite(4, 3, 0);
        run(meadow, 40, { ...day, daylight: false });
        expect(meadow.ashAt(4, 3)).toBe(1);
        run(meadow, 600, { ...at(-5), daylight: false });
        expect(meadow.ashAt(4, 3)).toBe(1);
        expect(meadow.grassAt(4, 3)).toBe(0);
        // Thawed, it comes back within the usual five minutes.
        run(meadow, 300, { ...at(5), daylight: false });
        expect(meadow.ashAt(4, 3)).toBe(0);
        // Back, then as thirsty as its dry soil makes it.
        expect(meadow.grassAt(4, 3)).toBeGreaterThan(0.95);
    });
});
