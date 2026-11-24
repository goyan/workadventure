import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { landPlacesOf } from "../src/Life/LandPlaces";
import { LIFE_STEP_MS, stepPopulation } from "../src/Life/Population";
import type { Population } from "../src/Life/Population";
import { SPECIES } from "../src/Life/Species";
import { leadTamed, MAX_TAMED, releaseAnimals, TAME_REACH_PX, tameAnimal } from "../src/Life/Taming";
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
/** A plain of 40 × 25 dry cells. */
const plain = (): string[] => rows(".".repeat(40), 25);
/** The same with deep water over its eastern half. */
const shore = (): string[] => rows(".".repeat(20) + "d".repeat(20), 25);
const middle = (cell: number): number => cell * 16 + 8;
const animal = (
    id: number,
    kind: Animal["kind"],
    sex: "male" | "female",
    cellX: number,
    cellY: number,
    more: Partial<Animal> = {},
): Animal => ({
    id,
    kind,
    sex,
    x: middle(cellX),
    y: middle(cellY),
    bornAt: 0,
    lifespanMs: 1e12,
    readyAt: 0,
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
const byId = (population: Population, id: number): Animal | undefined =>
    population.animals.find((one) => one.id === id);

function world(map: string[], population: Population, start = 0) {
    const grid = gridOf(map);
    const bodies = waterBodiesOf(grid);
    const land = landPlacesOf({
        width: map[0].length,
        height: map.length,
        walls: { east: new Set(), south: new Set() },
        depthAt: (x, y) => grid.depthAt(x, y),
    });
    let now = start;
    const random = scripted();
    const step = (count = 1, threats: { x: number; y: number }[] = []): void => {
        for (let index = 0; index < count; index++) {
            now += LIFE_STEP_MS;
            stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, now, random, threats, {}, land);
        }
    };
    return { step, land, time: () => now };
}

describe("taming an animal of the land", () => {
    it("lions and tigers alone can be tamed", () => {
        expect(SPECIES.lion.tamable).toBe(true);
        expect(SPECIES.tiger.tamable).toBe(true);
        expect(SPECIES.antelope.tamable).toBe(false);
        expect(SPECIES.fish.tamable).toBe(false);
        expect(SPECIES.dolphin.tamable).toBe(false);
    });

    it("gives a lion within reach to the player who asks", () => {
        const population = seeded([animal(1, "lion", "male", 10, 10)]);
        expect(tameAnimal(population, 1, { id: 7, x: middle(10) + TAME_REACH_PX, y: middle(10) })).toBeUndefined();
        expect(byId(population, 1)?.tamedBy).toBe(7);
    });

    it("refuses an animal too far, an antelope, an animal of someone else and an unknown one", () => {
        const population = seeded([
            animal(1, "lion", "male", 10, 10),
            animal(2, "antelope", "male", 10, 10),
            animal(3, "tiger", "male", 10, 10, { tamedBy: 9 }),
        ]);
        const master = { id: 7, x: middle(10), y: middle(10) };
        expect(tameAnimal(population, 1, { ...master, x: master.x + TAME_REACH_PX + 1 })).toBe("far");
        expect(tameAnimal(population, 2, master)).toBe("species");
        expect(tameAnimal(population, 3, master)).toBe("taken");
        expect(tameAnimal(population, 99, master)).toBe("unknown");
        expect(population.animals.map((one) => one.tamedBy)).toEqual([undefined, undefined, 9]);
    });

    it("refuses one more than a player may have", () => {
        const lions = Array.from({ length: MAX_TAMED + 1 }, (_, index) => animal(index + 1, "lion", "male", 10, 10));
        const population = seeded(lions);
        const master = { id: 7, x: middle(10), y: middle(10) };
        for (let id = 1; id <= MAX_TAMED; id++) expect(tameAnimal(population, id, master)).toBeUndefined();
        expect(tameAnimal(population, MAX_TAMED + 1, master)).toBe("full");
    });

    it("lets go one animal of a player, or all of them, never those of another", () => {
        const population = seeded([
            animal(1, "lion", "male", 10, 10, { tamedBy: 7 }),
            animal(2, "tiger", "male", 10, 10, { tamedBy: 7 }),
            animal(3, "tiger", "male", 10, 10, { tamedBy: 9 }),
        ]);
        expect(releaseAnimals(population, 7, 3)).toBe(0);
        expect(releaseAnimals(population, 7, 1)).toBe(1);
        expect(population.animals.map((one) => one.tamedBy)).toEqual([undefined, 7, 9]);
        expect(releaseAnimals(population, 7)).toBe(1);
        expect(population.animals.map((one) => one.tamedBy)).toEqual([undefined, undefined, 9]);
    });
});

describe("a tamed animal and its master", () => {
    it("is where its master stands on the land", () => {
        const population = seeded([animal(1, "lion", "male", 10, 10, { tamedBy: 7 })]);
        const { land } = world(plain(), population);
        leadTamed(population, () => ({ x: middle(30), y: middle(5), ground: true }), land);
        expect(byId(population, 1)).toMatchObject({ x: middle(30), y: middle(5), tamedBy: 7 });
    });

    it("waits where it last could be while its master is in deep water or on a raised floor", () => {
        const population = seeded([animal(1, "lion", "male", 10, 10, { tamedBy: 7 })]);
        const { land } = world(shore(), population);
        leadTamed(population, () => ({ x: middle(30), y: middle(5), ground: true }), land);
        expect(byId(population, 1)).toMatchObject({ x: middle(10), y: middle(10), tamedBy: 7 });
        leadTamed(population, () => ({ x: middle(5), y: middle(5), ground: false }), land);
        expect(byId(population, 1)).toMatchObject({ x: middle(10), y: middle(10), tamedBy: 7 });
    });

    it("is let go when its master is gone", () => {
        const population = seeded([
            animal(1, "lion", "male", 10, 10, { tamedBy: 7 }),
            animal(2, "lion", "male", 10, 10, { tamedBy: 9 }),
        ]);
        const { land } = world(plain(), population);
        const released = leadTamed(
            population,
            (userId) => (userId === 9 ? { x: 0, y: 0, ground: true } : undefined),
            land,
        );
        expect(released).toBe(1);
        expect(population.animals.map((one) => one.tamedBy)).toEqual([undefined, 9]);
    });

    it("is let go when the land is switched off", () => {
        const population = seeded([animal(1, "lion", "male", 10, 10, { tamedBy: 7 })]);
        expect(leadTamed(population, () => ({ x: 0, y: 0, ground: true }), undefined)).toBe(1);
        expect(byId(population, 1)?.tamedBy).toBeUndefined();
    });
});

describe("a tamed animal out of the life", () => {
    it("neither starves nor dies of age while tamed, nor at the step after it is let go five minutes later", () => {
        const lion = animal(1, "lion", "male", 10, 10, { tamedBy: 7, lifespanMs: 100_000, bornAt: 0, ateAt: 0 });
        const population = seeded([lion]);
        const { step } = world(plain(), population);
        // Five minutes: more than its life, and than the hunts it may miss (2 × 30 s).
        step(600);
        expect(byId(population, 1)).toBeDefined();
        releaseAnimals(population, 7);
        step(2);
        expect(byId(population, 1)).toBeDefined();
    });

    it("grows old and hungry again from where it was once let go", () => {
        const lion = animal(1, "lion", "male", 10, 10, { tamedBy: 7, lifespanMs: 100_000 });
        const population = seeded([lion]);
        const { step } = world(plain(), population, 50_000);
        step(600);
        releaseAnimals(population, 7);
        // It had 50 s left to live.
        step(98);
        expect(byId(population, 1)).toBeDefined();
        step(4);
        expect(byId(population, 1)).toBeUndefined();
    });

    it("does not hunt, and does not move by itself", () => {
        const population = seeded([
            animal(1, "lion", "male", 10, 10, { tamedBy: 7 }),
            animal(2, "antelope", "male", 10, 10),
        ]);
        const { step } = world(plain(), population);
        step(4);
        expect(byId(population, 2)).toBeDefined();
        expect(byId(population, 1)).toMatchObject({ x: middle(10), y: middle(10) });
    });

    it("is not run from: an antelope beside a tamed lion stays calm", () => {
        const population = seeded([
            animal(1, "lion", "male", 10, 10, { tamedBy: 7 }),
            animal(2, "antelope", "male", 12, 10, { readyAt: 1e12 }),
        ]);
        const { step } = world(plain(), population);
        step();
        // A frightened antelope runs at 1.2 times the speed of the map; a calm one wanders at most at that speed.
        expect(byId(population, 2)?.speed ?? 0).toBeLessThan(settings.maxSpeed * 32 * SPECIES.antelope.speedFactor);
    });

    it("has no young", () => {
        const fed = { meals: 5, mateAt: 0, readyAt: 1e12 };
        const population = seeded([
            animal(1, "lion", "male", 10, 10, { ...fed, tamedBy: 7 }),
            animal(2, "lion", "female", 10, 10, fed),
            ...Array.from({ length: 12 }, (_, index) => animal(10 + index, "antelope", "male", 30, 20)),
        ]);
        const { step } = world(plain(), population);
        step(4);
        expect(population.animals.filter((one) => one.kind === "lion")).toHaveLength(2);
    });

    it("still takes a place: a fed couple has no young on a land its tamed kin fill", () => {
        // 80 × 60 cells feed thirty antelopes: three lions.
        const wide = rows(".".repeat(80), 60);
        const fed = { meals: 5, mateAt: 0, readyAt: 1e12 };
        const couple = (): Animal[] => [
            animal(1, "lion", "male", 10, 10, fed),
            animal(2, "lion", "female", 10, 10, fed),
        ];
        const alone = seeded(couple());
        world(wide, alone).step();
        expect(alone.animals.filter((one) => one.kind === "lion")).toHaveLength(3);
        const full = seeded([...couple(), animal(3, "lion", "male", 40, 40, { tamedBy: 7 })]);
        world(wide, full).step();
        expect(full.animals.filter((one) => one.kind === "lion")).toHaveLength(3);
    });

    it("still takes a place: tamed lions keep others from coming", () => {
        // Enough antelopes for lions to come, and both lions of the plain tamed.
        const antelopes = Array.from({ length: 8 }, (_, index) =>
            animal(10 + index, "antelope", "male", 5 + index, 20, { readyAt: 1e12 }),
        );
        const population = seeded([
            animal(1, "lion", "male", 10, 10, { tamedBy: 7 }),
            animal(2, "lion", "female", 11, 10, { tamedBy: 7 }),
            animal(3, "tiger", "male", 30, 5, { readyAt: 1e12 }),
            ...antelopes,
        ]);
        const { step } = world(plain(), population);
        // Twenty minutes: ten breeding delays of the predators.
        step(2400);
        expect(population.animals.filter((one) => one.kind === "lion")).toHaveLength(2);
    });
});

describe("a lion and the avatars", () => {
    const ran = (lion: Animal | undefined): boolean =>
        lion !== undefined && Math.hypot(lion.x - middle(10), lion.y - middle(10)) > 4;

    it("lets an avatar come close while it is fed", () => {
        const population = seeded([animal(1, "lion", "male", 10, 10, { readyAt: 1e12 })]);
        const { step } = world(plain(), population);
        step(1, [{ x: middle(10) + 40, y: middle(10) }]);
        const lion = byId(population, 1);
        // It may wander, but not at the speed of a flight, and not away for sure.
        expect(lion?.speed ?? 0).toBeLessThan(settings.maxSpeed * 32 * SPECIES.lion.speedFactor);
    });

    it("keeps away from an avatar while it hunts", () => {
        const population = seeded([animal(1, "lion", "male", 10, 10, { readyAt: 0 })]);
        const { step } = world(plain(), population);
        step(2, [{ x: middle(10) + 40, y: middle(10) }]);
        const lion = byId(population, 1);
        expect(ran(lion)).toBe(true);
        expect(lion?.x ?? 0).toBeLessThan(middle(10));
    });

    it("an antelope still runs from an avatar", () => {
        const population = seeded([animal(1, "antelope", "male", 10, 10, { readyAt: 1e12 })]);
        const { step } = world(plain(), population);
        step(2, [{ x: middle(10) + 40, y: middle(10) }]);
        expect(byId(population, 1)?.x ?? 0).toBeLessThan(middle(10));
    });
});
