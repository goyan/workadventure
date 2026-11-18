import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { emptyPopulation, LIFE_STEP_MS, speciesCensus, STARVE_HUNTS, stepPopulation } from "../src/Life/Population";
import type { LifeTally, Population, SpeciesTallies } from "../src/Life/Population";
import { waterBodiesOf } from "../src/Life/WaterBodies";
import type { WaterGrid } from "../src/Terrain/WaterGrid";
import type { LifeSettings } from "../src/types";
import { gridOf, scripted } from "./lifeHelpers";

const settings: LifeSettings = {
    enabled: true,
    reproductionDelay: 60,
    maxLifespan: 600,
    maxSpeed: 1.5,
    huntInterval: 30,
    dolphinReproductionDelay: 120,
    dolphinMaxLifespan: 3600,
    drinkInterval: 120,
};
const rows = (row: string, count: number): string[] => Array.from({ length: count }, () => row);
const pond = (): WaterGrid => gridOf(rows("ssssssss", 5));
const lake = (): WaterGrid => gridOf(rows("d".repeat(20), 15));
const fish = (id: number, sex: "male" | "female", cellX: number, cellY: number, readyAt = 0): Animal => ({
    id,
    kind: "fish",
    sex,
    x: cellX * 16 + 8,
    y: cellY * 16 + 8,
    bornAt: 0,
    lifespanMs: 1e12,
    readyAt,
});
const dolphin = (
    id: number,
    sex: "male" | "female",
    cellX: number,
    cellY: number,
    more: Partial<Animal> = {},
): Animal => ({ ...fish(id, sex, cellX, cellY, 1e12), kind: "dolphin", ateAt: 0, ...more });
const seeded = (animals: Animal[]): Population => ({ animals, nextId: 100, seeded: true, dolphinsSeeded: true });
const step = (
    population: Population,
    grid: WaterGrid,
    now: number,
    bySpecies: SpeciesTallies = {},
): LifeTally & { bySpecies: SpeciesTallies } => ({
    ...stepPopulation(population, grid, waterBodiesOf(grid), settings, LIFE_STEP_MS, now, scripted(), [], bySpecies),
    bySpecies,
});

describe("what happens to each species", () => {
    it("counts a fish eaten, and the meal of the dolphin that ate it", () => {
        const population = seeded([fish(1, "male", 5, 5, 1e12), dolphin(2, "male", 5, 5, { readyAt: 0, ateAt: 0 })]);
        const tally = step(population, lake(), 1000);
        expect(tally.eaten).toBe(1);
        expect(tally.bySpecies.fish?.eaten).toBe(1);
        expect(tally.bySpecies.dolphin?.meals).toEqual({ fish: 1 });
    });

    it("tells a dolphin dead of hunger from one dead of age", () => {
        const starveMs = STARVE_HUNTS * settings.huntInterval * 1000;
        const starving = seeded([dolphin(1, "male", 5, 5, { ateAt: 0 })]);
        const hungry = step(starving, lake(), starveMs);
        expect(hungry.predatorDeaths).toBe(1);
        expect(hungry.bySpecies.dolphin?.starved).toBe(1);
        expect(hungry.bySpecies.dolphin?.diedOfAge).toBe(0);

        const old = seeded([dolphin(1, "male", 5, 5, { ateAt: 1000, lifespanMs: 1000 })]);
        const aged = step(old, lake(), 1000);
        expect(aged.predatorDeaths).toBe(1);
        expect(aged.bySpecies.dolphin?.diedOfAge).toBe(1);
        expect(aged.bySpecies.dolphin?.starved).toBe(0);
    });

    it("counts the young of the fish and of the dolphins", () => {
        const fishes = seeded([fish(1, "male", 2, 2), fish(2, "female", 2, 2)]);
        const spawned = step(fishes, pond(), 1000);
        expect(spawned.births).toBeGreaterThan(0);
        expect(spawned.bySpecies.fish?.births).toBe(spawned.births);

        const dolphins = seeded([
            dolphin(1, "male", 5, 5, { meals: 1, ateAt: 1000 }),
            dolphin(2, "female", 5, 5, { meals: 1, ateAt: 1000 }),
        ]);
        const calved = step(dolphins, gridOf(rows("d".repeat(30), 20)), 1000);
        expect(calved.predatorBirths).toBe(1);
        expect(calved.bySpecies.dolphin?.births).toBe(1);
    });

    it("counts the first couple that comes into an empty water", () => {
        const tally = step(emptyPopulation(), pond(), 0);
        expect(tally.arrivals).toBe(2);
        expect(tally.bySpecies.fish?.arrivals).toBe(2);
    });

    it("adds to the tallies it is given, step after step", () => {
        const bySpecies: SpeciesTallies = {};
        const animals = (): Animal[] => [fish(1, "male", 5, 5, 1e12), dolphin(2, "male", 5, 5, { readyAt: 0 })];
        step(seeded(animals()), lake(), 1000, bySpecies);
        step(seeded(animals()), lake(), 1000, bySpecies);
        expect(bySpecies.fish?.eaten).toBe(2);
        expect(bySpecies.dolphin?.meals).toEqual({ fish: 2 });
    });
});

describe("the census of the species", () => {
    it("counts the males and the females, and the room their waters have", () => {
        const grid = gridOf(rows("ssssssssss", 10));
        const population = seeded([
            fish(1, "male", 1, 1),
            fish(2, "male", 2, 1),
            fish(3, "male", 3, 1),
            fish(4, "female", 4, 1),
            fish(5, "female", 5, 1),
        ]);
        expect(speciesCensus(population, waterBodiesOf(grid))).toEqual([
            { species: "fish", males: 3, females: 2, cap: 12 },
        ]);
    });

    it("lists the dolphins where the water is deep enough for them", () => {
        const census = speciesCensus(seeded([]), waterBodiesOf(lake()));
        expect(census.map((entry) => entry.species)).toEqual(["fish", "dolphin"]);
        expect(census[1]).toEqual({ species: "dolphin", males: 0, females: 0, cap: 2 });
    });
});
