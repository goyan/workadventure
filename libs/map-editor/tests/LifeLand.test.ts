import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { landPlacesOf } from "../src/Life/LandPlaces";
import {
    ANTELOPES_PER_PREDATOR,
    LIFE_STEP_MS,
    speciesCensus,
    STARVE_HUNTS,
    stepPopulation,
} from "../src/Life/Population";
import type { LifeTally, Population, SpeciesTallies } from "../src/Life/Population";
import { waterBodiesOf } from "../src/Life/WaterBodies";
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
    landEnabled: true,
    antelopeReproductionDelay: 60,
    antelopeMaxLifespan: 600,
    landHuntInterval: 30,
    landPredatorReproductionDelay: 120,
    landPredatorMaxLifespan: 3600,
};
const rows = (row: string, count: number): string[] => Array.from({ length: count }, () => row);
/** A plain of 40 × 25 dry cells: big enough for antelopes. */
const plain = (): string[] => rows(".".repeat(40), 25);
/** The same with a pond in its middle: a shallow rim around deep water. */
const plainWithPond = (): string[] =>
    plain().map((row, y) =>
        y >= 8 && y < 16
            ? row.slice(0, 10) + (y === 8 || y === 15 ? "s".repeat(12) : "ss" + "d".repeat(8) + "ss") + row.slice(22)
            : row,
    );
const animal = (id: number, kind: Animal["kind"], sex: "male" | "female", cellX: number, cellY: number): Animal => ({
    id,
    kind,
    sex,
    x: cellX * 16 + 8,
    y: cellY * 16 + 8,
    bornAt: 0,
    lifespanMs: 1e12,
    readyAt: 0,
});
const hunter = (
    id: number,
    kind: "lion" | "tiger",
    cellX: number,
    cellY: number,
    more: Partial<Animal> = {},
): Animal => ({
    ...animal(id, kind, "male", cellX, cellY),
    ateAt: 0,
    ...more,
});
const seeded = (animals: Animal[]): Population => ({
    animals,
    nextId: 100,
    seeded: true,
    dolphinsSeeded: true,
    landSeeded: true,
});
const ofKind = (population: Population, kind: Animal["kind"]): Animal[] =>
    population.animals.filter((one) => one.kind === kind);

function world(map: string[], population: Population, custom: Partial<LifeSettings> = {}, random = scripted()) {
    const grid = gridOf(map);
    const bodies = waterBodiesOf(grid);
    const land = landPlacesOf({
        width: map[0].length,
        height: map.length,
        walls: { east: new Set(), south: new Set() },
        depthAt: (x, y) => grid.depthAt(x, y),
    });
    const bySpecies: SpeciesTallies = {};
    let now = 0;
    const step = (count = 1, withLand = true): LifeTally => {
        let last: LifeTally | undefined;
        for (let index = 0; index < count; index++) {
            now += LIFE_STEP_MS;
            last = stepPopulation(
                population,
                grid,
                bodies,
                { ...settings, ...custom },
                LIFE_STEP_MS,
                now,
                random,
                [],
                bySpecies,
                withLand ? land : undefined,
            );
        }
        if (!last) throw new Error("no step");
        return last;
    };
    return { step, bySpecies, bodies, land, population, time: () => now };
}

describe("the life of the land", () => {
    it("brings a couple of antelopes to a plain big enough, at once on a map never populated", () => {
        const { step, bySpecies, population } = world(plain(), { animals: [], nextId: 1, seeded: true });
        step();
        expect(ofKind(population, "antelope").map((one) => one.sex)).toEqual(["male", "female"]);
        expect(bySpecies.antelope?.arrivals).toBe(2);
        expect(population.landSeeded).toBe(true);
    });

    it("brings none to a land too small, nor while the land is off, nor without the land", () => {
        const small = world(rows(".".repeat(20), 20), { animals: [], nextId: 1, seeded: true });
        small.step(3);
        expect(small.population.animals).toEqual([]);
        const off = world(plain(), { animals: [], nextId: 1, seeded: true }, { landEnabled: false });
        off.step(3);
        expect(off.population.animals).toEqual([]);
        const without = world(plain(), { animals: [], nextId: 1, seeded: true });
        without.step(3, false);
        expect(without.population.animals).toEqual([]);
    });

    it("leaves the animals of the land as they are when the land is not given", () => {
        const antelope = animal(1, "antelope", "male", 5, 5);
        const { step, population } = world(plain(), seeded([antelope]));
        step(4, false);
        expect(population.animals).toEqual([animal(1, "antelope", "male", 5, 5)]);
    });

    it("lets two ready antelopes have one or two young", () => {
        const { step, bySpecies, population } = world(
            plain(),
            seeded([animal(1, "antelope", "male", 5, 5), animal(2, "antelope", "female", 5, 5)]),
        );
        const tally = step();
        expect(tally.births).toBeGreaterThanOrEqual(1);
        expect(tally.births).toBeLessThanOrEqual(2);
        expect(bySpecies.antelope?.births).toBe(tally.births);
        expect(ofKind(population, "antelope")).toHaveLength(2 + tally.births);
    });

    it("makes an antelope run from a lion that comes close, and not mate meanwhile", () => {
        const { step, population } = world(
            plain(),
            seeded([
                animal(1, "antelope", "male", 10, 10),
                animal(2, "antelope", "female", 10, 10),
                hunter(3, "lion", 14, 10, { readyAt: 1e12 }),
            ]),
        );
        const tally = step();
        expect(tally.births).toBe(0);
        expect(ofKind(population, "antelope")[0].x).toBeLessThan(10 * 16 + 8);
    });

    it("lets a hungry lion eat an antelope it reaches", () => {
        const { step, bySpecies, population } = world(
            plain(),
            seeded([animal(1, "antelope", "male", 10, 10), hunter(2, "lion", 10, 10)]),
        );
        const tally = step();
        expect(tally.eaten).toBe(1);
        expect(ofKind(population, "antelope")).toEqual([]);
        expect(bySpecies.lion?.meals).toEqual({ antelope: 1 });
        expect(bySpecies.antelope?.eaten).toBe(1);
        expect(ofKind(population, "lion")[0].meals).toBe(1);
    });

    it("lets a tiger take a fish in the shallow water, never where one swims", () => {
        // The shallow rim of the pond is at the cells (10..21, 8); its deep water from (12, 9).
        const shallow = world(plainWithPond(), seeded([animal(1, "fish", "male", 11, 8), hunter(2, "tiger", 11, 8)]));
        expect(shallow.step().eaten).toBe(1);
        expect(shallow.bySpecies.tiger?.meals).toEqual({ fish: 1 });

        const deep = world(plainWithPond(), seeded([animal(1, "fish", "male", 15, 11), hunter(2, "tiger", 11, 8)]));
        deep.population.animals[0].targetX = 15 * 16 + 8;
        deep.population.animals[0].targetY = 11 * 16 + 8;
        for (let index = 0; index < 40; index++) {
            const fish = ofKind(deep.population, "fish")[0];
            // The fish stays in the deep water.
            fish.x = fish.targetX = 15 * 16 + 8;
            fish.y = fish.targetY = 11 * 16 + 8;
            deep.step();
            expect(deep.bySpecies.tiger?.meals.fish).toBeUndefined();
        }
        const tiger = ofKind(deep.population, "tiger")[0];
        // It never even went for it.
        expect(tiger.targetX === 15 * 16 + 8 && tiger.targetY === 11 * 16 + 8).toBe(false);
        expect(deep.land.passable(Math.floor(tiger.x / 16), Math.floor(tiger.y / 16), 16)).toBe(true);
    });

    it("does not send a lion after an antelope on the other side of water one swims in", () => {
        // A river of deep water cuts the plain in two.
        const map = plain().map((row) => row.slice(0, 19) + "dd" + row.slice(21));
        const { step, population } = world(
            map,
            seeded([{ ...animal(1, "antelope", "male", 30, 10), readyAt: 1e12 }, hunter(2, "lion", 10, 10)]),
        );
        const antelope = ofKind(population, "antelope")[0];
        for (let index = 0; index < 6; index++) {
            antelope.x = antelope.targetX = 30 * 16 + 8;
            antelope.y = antelope.targetY = 10 * 16 + 8;
            step();
            const lion = ofKind(population, "lion")[0];
            expect(lion.targetX === 30 * 16 + 8 && lion.targetY === 10 * 16 + 8).toBe(false);
        }
    });

    it("makes a fish swim away from a tiger that wades close", () => {
        const { step, population } = world(
            plainWithPond(),
            seeded([animal(1, "fish", "male", 14, 8), hunter(2, "tiger", 17, 8, { readyAt: 1e12 })]),
        );
        step();
        expect(ofKind(population, "fish")[0].x).toBeLessThan(14 * 16 + 8);
    });

    it("brings lions and tigers once enough antelopes live on the land to feed them, not before", () => {
        const herd = (count: number): Animal[] =>
            Array.from({ length: count }, (_, index) => ({
                ...animal(index + 1, "antelope", "male", 3 + index * 2, 3),
                readyAt: 1e12,
            }));
        // A random source that always says "now".
        const few = world(plain(), seeded(herd(ANTELOPES_PER_PREDATOR - 1)), {}, () => 0);
        few.step();
        expect(ofKind(few.population, "lion")).toEqual([]);
        const enough = world(plain(), seeded(herd(ANTELOPES_PER_PREDATOR)), {}, () => 0);
        enough.step();
        expect(ofKind(enough.population, "lion").map((one) => one.sex)).toEqual(["male", "female"]);
        expect(ofKind(enough.population, "tiger")).toHaveLength(2);
        expect(enough.bySpecies.lion?.arrivals).toBe(2);
    });

    it("lets a lion die of hunger after eight hunting intervals without a catch", () => {
        const { step, bySpecies, population } = world(rows(".".repeat(20), 20), seeded([hunter(1, "lion", 5, 5)]));
        // A land too small for antelopes: nothing to eat.
        step((STARVE_HUNTS * 30 * 1000) / LIFE_STEP_MS);
        expect(ofKind(population, "lion")).toEqual([]);
        expect(bySpecies.lion?.starved).toBe(1);
    });

    it("drowns an antelope the water rose on, after five seconds", () => {
        const { step, bySpecies, population } = world(
            rows("d".repeat(40), 25),
            seeded([{ ...animal(1, "antelope", "male", 20, 12), readyAt: 1e12 }]),
        );
        step(9);
        expect(ofKind(population, "antelope")).toHaveLength(1);
        step(2);
        expect(ofKind(population, "antelope")).toEqual([]);
        expect(bySpecies.antelope?.diedDry).toBe(1);
    });

    it("counts the room of the land for its species", () => {
        const { bodies, land } = world(plain(), seeded([]));
        const census = speciesCensus(seeded([animal(1, "antelope", "female", 5, 5)]), bodies, land);
        expect(census).toEqual([
            { species: "antelope", males: 0, females: 1, cap: 6 },
            { species: "lion", males: 0, females: 0, cap: 2 },
            { species: "tiger", males: 0, females: 0, cap: 2 },
        ]);
    });
});
