import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { GROUP_REACH_PX, HERD_SIZE, leaderOf, leadersOf, PRIDE_SHARE_PX } from "../src/Life/Groups";
import { landPlacesOf } from "../src/Life/LandPlaces";
import { LIFE_STEP_MS, REST_MIN_MS, stepPopulation } from "../src/Life/Population";
import type { Population, SpeciesTallies } from "../src/Life/Population";
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
/** 100 × 80 dry cells: a land that holds several lions. */
const plain = (): string[] => rows(".".repeat(100), 80);
/** The same with deep water from the column 40 on: a shore along the column 39. */
const shore = (): string[] => rows(".".repeat(40) + "d".repeat(20), 40);
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
    // Not ready to breed nor to hunt.
    readyAt: 1e12,
    // Never hungry during a test.
    ateAt: 1e12,
    // Not thirsty unless the test says so.
    drinkAt: 1e12,
    ...more,
});
const seeded = (animals: Animal[]): Population => ({
    animals,
    nextId: 100,
    seeded: true,
    dolphinsSeeded: true,
    landSeeded: true,
});
const byId = (population: Population, id: number): Animal => {
    const found = population.animals.find((one) => one.id === id);
    if (!found) throw new Error(`animal ${id} is gone`);
    return found;
};
const apart = (a: Animal, b: Animal): number => Math.hypot(a.x - b.x, a.y - b.y);

function world(map: string[], population: Population) {
    const grid = gridOf(map);
    const bodies = waterBodiesOf(grid);
    const land = landPlacesOf({
        width: map[0].length,
        height: map.length,
        walls: { east: new Set(), south: new Set() },
        depthAt: (x, y) => grid.depthAt(x, y),
    });
    let now = 0;
    const random = scripted();
    const bySpecies: SpeciesTallies = {};
    const step = (count = 1): void => {
        for (let index = 0; index < count; index++) {
            now += LIFE_STEP_MS;
            stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, now, random, [], bySpecies, land);
        }
    };
    return { step, time: () => now, bySpecies };
}

describe("who leads a group", () => {
    it("gives a herd its oldest female, and one more for each herd's worth of animals", () => {
        const herd = [
            animal(1, "antelope", "male", 1, 1, { bornAt: -900 }),
            animal(2, "antelope", "female", 2, 1, { bornAt: -100 }),
            animal(3, "antelope", "female", 3, 1, { bornAt: -500 }),
        ];
        expect(leadersOf("herd", herd).map((one) => one.id)).toEqual([3]);
        const more = Array.from({ length: HERD_SIZE }, (_, index) => animal(10 + index, "antelope", "male", 5, 5));
        expect(leadersOf("herd", [...herd, ...more]).map((one) => one.id)).toEqual([3, 2]);
        expect(leadersOf("herd", [herd[0]])).toEqual([]);
    });

    it("gives a pride its oldest male, alone", () => {
        const pride = [
            animal(1, "lion", "female", 1, 1, { bornAt: -900 }),
            animal(2, "lion", "male", 2, 1, { bornAt: -100 }),
            animal(3, "lion", "male", 3, 1, { bornAt: -500 }),
            animal(4, "lion", "male", 4, 1, { bornAt: -500 }),
        ];
        // Born together: the one that came first.
        expect(leadersOf("pride", pride).map((one) => one.id)).toEqual([3]);
    });

    it("makes an animal follow the nearest leader, and a leader nobody", () => {
        const near = animal(1, "antelope", "female", 10, 10);
        const far = animal(2, "antelope", "female", 30, 10);
        expect(leaderOf(animal(3, "antelope", "male", 12, 10), [far, near])).toBe(near);
        expect(leaderOf(near, [far, near])).toBeUndefined();
        expect(leaderOf(animal(3, "antelope", "male", 12, 10), [])).toBeUndefined();
    });
});

describe("a herd of antelopes", () => {
    it("stays around its matriarch", () => {
        const population = seeded([
            animal(1, "antelope", "female", 10, 20, { bornAt: -1000, targetX: middle(10), targetY: middle(20) }),
            animal(2, "antelope", "male", 50, 20),
            animal(3, "antelope", "female", 45, 5),
        ]);
        const { step } = world(plain(), population);
        let near = 0;
        const steps = 400;
        for (let index = 0; index < steps; index++) {
            step();
            // The second half of the time: they had the first one to come.
            if (index < steps / 2) continue;
            for (const id of [2, 3]) {
                if (apart(byId(population, id), byId(population, 1)) <= 2 * GROUP_REACH_PX) near++;
            }
        }
        expect(near / steps).toBeGreaterThan(0.8);
    });

    it("goes to the water when its matriarch does", () => {
        const population = seeded([
            animal(1, "antelope", "female", 30, 20, { bornAt: -1000, drinkAt: 0 }),
            animal(2, "antelope", "male", 31, 21),
        ]);
        const { step, time } = world(shore(), population);
        step(2);
        const follower = byId(population, 2);
        expect(follower.drinkAt).toBeLessThanOrEqual(time());
        step(120);
        // It drank, and waits a whole interval like her.
        expect(byId(population, 2).drinkAt).toBeLessThan(1e12);
        expect(byId(population, 2).drinkAt).toBeGreaterThan(time());
    });

    it("grazes: it stands a while where it stopped, then walks a few steps at a calm pace", () => {
        const population = seeded([animal(1, "antelope", "female", 30, 20, { bornAt: -1000 })]);
        const { step, time } = world(plain(), population);
        step();
        const matriarch = byId(population, 1);
        const from = { x: matriarch.x, y: matriarch.y };
        expect(matriarch.restUntil).toBeGreaterThanOrEqual(time() + REST_MIN_MS - LIFE_STEP_MS);
        // Still, whatever its rest lasts.
        step(REST_MIN_MS / LIFE_STEP_MS - 1);
        expect({ x: matriarch.x, y: matriarch.y }).toEqual(from);
        // Then it sets out, slower than the map allows, and not far.
        step(20);
        expect(apart(matriarch, { ...matriarch, ...from })).toBeGreaterThan(0);
        expect(apart(matriarch, { ...matriarch, ...from })).toBeLessThan(5 * 16);
        let walked = 0;
        let stood = 0;
        for (let index = 0; index < 240; index++) {
            const before = { x: matriarch.x, y: matriarch.y };
            step();
            const moved = Math.hypot(matriarch.x - before.x, matriarch.y - before.y);
            if (moved === 0) stood++;
            else walked++;
            expect(moved).toBeLessThanOrEqual((settings.maxSpeed * 32 * LIFE_STEP_MS) / 1000 / 2 + 1e-9);
        }
        // Mostly grazing: a few steps between long stops.
        expect(stood).toBeGreaterThan(walked);
        expect(walked).toBeGreaterThan(0);
    });

    it("stops grazing to run from a lion", () => {
        const population = seeded([
            animal(1, "antelope", "female", 30, 20, { bornAt: -1000, restUntil: 1e12 }),
            animal(2, "lion", "male", 33, 20),
        ]);
        const { step } = world(plain(), population);
        step();
        const antelope = byId(population, 1);
        expect(antelope.restUntil).toBeUndefined();
        expect(antelope.x).toBeLessThan(middle(30));
    });

    it("leaves its rest to catch up with its matriarch once she is too far", () => {
        const population = seeded([
            animal(1, "antelope", "female", 10, 20, { bornAt: -1000, restUntil: 1e12 }),
            animal(2, "antelope", "male", 30, 20, { restUntil: 1e12 }),
        ]);
        const { step } = world(plain(), population);
        step();
        const follower = byId(population, 2);
        expect(follower.restUntil).toBeUndefined();
        expect(follower.x).toBeLessThan(middle(30));
    });
});

describe("a pride of lions", () => {
    const fed = { readyAt: 1e12, mateAt: 0, meals: 2 };

    it("lets its oldest male alone have young", () => {
        const population = seeded([
            animal(1, "lion", "male", 50, 30, { ...fed, bornAt: -1000, targetX: middle(50), targetY: middle(30) }),
            animal(2, "lion", "male", 10, 10, fed),
            animal(3, "lion", "female", 10, 10, fed),
        ]);
        const { step, bySpecies } = world(plain(), population);
        step();
        expect(bySpecies.lion?.births ?? 0).toBe(0);
        expect(population.animals).toHaveLength(3);
    });

    it("has young when its oldest male is the one beside the female", () => {
        const population = seeded([
            animal(1, "lion", "male", 10, 10, { ...fed, bornAt: -1000 }),
            animal(2, "lion", "male", 50, 30, fed),
            animal(3, "lion", "female", 10, 10, fed),
        ]);
        const { step, bySpecies } = world(plain(), population);
        step();
        expect(bySpecies.lion?.births).toBe(1);
    });

    it("leaves a tamed male out: the next oldest one leads", () => {
        const population = seeded([
            animal(1, "lion", "male", 50, 30, { ...fed, bornAt: -1000, tamedBy: 7 }),
            animal(2, "lion", "male", 10, 10, fed),
            animal(3, "lion", "female", 10, 10, fed),
        ]);
        const { step, bySpecies } = world(plain(), population);
        step();
        expect(bySpecies.lion?.births).toBe(1);
    });

    it("hunts one prey together", () => {
        const hungry = { readyAt: 0, ateAt: 0 };
        const population = seeded([
            animal(1, "lion", "male", 10, 10, hungry),
            animal(2, "lion", "female", 50, 30, hungry),
            animal(11, "antelope", "male", 14, 10),
            animal(12, "antelope", "male", 52, 30),
            ...Array.from({ length: 8 }, (_, index) => animal(20 + index, "antelope", "male", 30, 2 + index)),
        ]);
        const { step } = world(plain(), population);
        step();
        const second = byId(population, 2);
        // Towards the prey of the first one, at the other end of the land, and not the one beside it.
        expect(second.targetX).toBeLessThan(middle(40));
    });

    it("shares a catch with the hungry lions beside it, as one meal", () => {
        const hungry = { readyAt: 0, ateAt: 0 };
        const population = seeded([
            animal(1, "lion", "male", 10, 10, hungry),
            animal(2, "lion", "female", 12, 10, hungry),
            animal(3, "lion", "female", 10 + Math.ceil(PRIDE_SHARE_PX / 16) + 6, 10, hungry),
            animal(11, "antelope", "male", 10, 10),
            ...Array.from({ length: 8 }, (_, index) => animal(20 + index, "antelope", "male", 50, 20 + index)),
        ]);
        const { step, time, bySpecies } = world(plain(), population);
        step();
        expect(bySpecies.lion?.meals.antelope).toBe(1);
        expect(bySpecies.antelope?.eaten).toBe(1);
        const [catcher, beside, away] = [1, 2, 3].map((id) => byId(population, id));
        expect(catcher.meals).toBe(1);
        expect(beside.ateAt).toBe(time());
        expect(beside.readyAt).toBeGreaterThan(time());
        // Fed, but the catch counts towards a young for the one that made it only.
        expect(beside.meals ?? 0).toBe(0);
        expect(away.ateAt).toBe(0);
        expect(away.readyAt).toBe(0);
    });
});

describe("a tiger", () => {
    it("lives on its own: a young male has young too", () => {
        const fed = { readyAt: 1e12, mateAt: 0, meals: 2 };
        const population = seeded([
            animal(1, "tiger", "male", 50, 30, { ...fed, bornAt: -1000, targetX: middle(50), targetY: middle(30) }),
            animal(2, "tiger", "male", 10, 10, fed),
            animal(3, "tiger", "female", 10, 10, fed),
        ]);
        const { step, bySpecies } = world(plain(), population);
        step();
        expect(bySpecies.tiger?.births).toBe(1);
    });
});
