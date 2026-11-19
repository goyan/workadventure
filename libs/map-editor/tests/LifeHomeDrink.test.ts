import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { landPlacesOf } from "../src/Life/LandPlaces";
import {
    DRINK_MS,
    PREY_DRINK_MS,
    SCARCE_PREY_SHARE,
    DRINK_WATCH_PX,
    HOME_REACH_PX,
    LIFE_STEP_MS,
    stepPopulation,
    THIRST_GIVE_UP_MS,
} from "../src/Life/Population";
import type { Population } from "../src/Life/Population";
import { waterBodiesOf } from "../src/Life/WaterBodies";
import { landTreesOf } from "../src/Terrain/LandTrees";
import type { LifeSettings, WAMFileFormat } from "../src/types";
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
/** 60 × 40 dry cells. */
const plain = (): string[] => rows(".".repeat(60), 40);
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

function world(map: string[], population: Population, trees: { x: number; y: number }[] = []) {
    const grid = gridOf(map);
    const bodies = waterBodiesOf(grid);
    const land = landPlacesOf({
        width: map[0].length,
        height: map.length,
        walls: { east: new Set(), south: new Set() },
        depthAt: (x, y) => grid.depthAt(x, y),
        trees,
    });
    let now = 0;
    const random = scripted();
    const step = (count = 1, threats: { x: number; y: number }[] = []): void => {
        for (let index = 0; index < count; index++) {
            now += LIFE_STEP_MS;
            stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, now, random, threats, {}, land);
        }
    };
    return { step, land, time: () => now };
}

describe("the trees of the land", () => {
    it("reads the trees of the nature catalogue placed on the ground of a map", () => {
        const prefab = (id: string) => ({ collectionName: "Nature", id });
        const wam = {
            entities: {
                a: { x: 320, y: 160, prefabRef: prefab("Nature:tree-oak:Default:Down") },
                b: { x: 0, y: 0, prefabRef: prefab("Nature:rock-1:Default:Down") },
                c: { x: 640, y: 640, elevation: 64, prefabRef: prefab("Nature:tree-oak:Default:Down") },
            },
        } as unknown as Pick<WAMFileFormat, "entities">;
        const trees = landTreesOf(wam);
        expect(trees).toHaveLength(1);
        // About the foot of the tree: under the top left corner of its image.
        expect(trees[0].x).toBeGreaterThanOrEqual(320);
        expect(trees[0].y).toBeGreaterThan(160);
        expect(landTreesOf(undefined)).toEqual([]);
    });

    it("keeps as homes the trees that stand on the outdoor land, with their piece of land", () => {
        const { land } = world(shore(), seeded([]), [
            { x: middle(10), y: middle(10) },
            // In the water.
            { x: middle(50), y: middle(10) },
        ]);
        expect(land.homes).toEqual([{ x: middle(10), y: middle(10), body: land.bodyAt(10, 10) }]);
    });
});

describe("a lion and its tree", () => {
    it("comes with its mate beside a tree of the land, which is their home", () => {
        const antelopes = Array.from({ length: 8 }, (_, index) =>
            animal(10 + index, "antelope", "male", 5 + index, 30),
        );
        const population = seeded(antelopes);
        const tree = { x: middle(50), y: middle(8) };
        const { step } = world(plain(), population, [tree]);
        // Until they come: twenty minutes at most.
        for (let index = 0; index < 2400 && !population.animals.some((one) => one.kind === "lion"); index++) step();
        const lions = population.animals.filter((one) => one.kind === "lion");
        expect(lions.length).toBeGreaterThanOrEqual(2);
        for (const lion of lions) expect(lion).toMatchObject({ homeX: tree.x, homeY: tree.y });
    });

    it("stays around its tree while it is fed", () => {
        const home = { homeX: middle(30), homeY: middle(20) };
        const population = seeded([animal(1, "lion", "male", 30, 20, home)]);
        const { step } = world(plain(), population);
        let furthest = 0;
        for (let index = 0; index < 600; index++) {
            step();
            const lion = byId(population, 1);
            furthest = Math.max(furthest, Math.hypot(lion.x - home.homeX, lion.y - home.homeY));
        }
        // Five tiles on each axis.
        expect(furthest).toBeLessThanOrEqual(HOME_REACH_PX * Math.SQRT2 + 16);
        // And it does move.
        expect(furthest).toBeGreaterThan(32);
    });

    it("walks back to its tree from far away", () => {
        const home = { homeX: middle(50), homeY: middle(20) };
        const population = seeded([animal(1, "lion", "male", 5, 20, home)]);
        const { step } = world(plain(), population);
        step(240);
        const lion = byId(population, 1);
        expect(Math.hypot(lion.x - home.homeX, lion.y - home.homeY)).toBeLessThanOrEqual(
            HOME_REACH_PX * Math.SQRT2 + 16,
        );
    });

    it("gives its home to its young", () => {
        const wide = rows(".".repeat(80), 60);
        const fed = { meals: 5, mateAt: 0, homeX: middle(10), homeY: middle(10) };
        const population = seeded([animal(1, "lion", "male", 10, 10, fed), animal(2, "lion", "female", 10, 10, fed)]);
        world(wide, population).step();
        const young = population.animals.find((one) => one.id >= 100);
        expect(young).toMatchObject({ kind: "lion", homeX: middle(10), homeY: middle(10) });
    });

    it("an antelope has no home: it wanders as before", () => {
        const population = seeded([animal(1, "antelope", "male", 30, 20)]);
        const { step } = world(plain(), population, [{ x: middle(30), y: middle(20) }]);
        step(10);
        expect(byId(population, 1).homeX).toBeUndefined();
    });
});

describe("drinking", () => {
    it("goes to the nearest shore when it is thirsty, drinks there for a while, then waits a whole interval", () => {
        const population = seeded([animal(1, "antelope", "male", 30, 20, { drinkAt: 0 })]);
        const { step, time } = world(shore(), population);
        let arrivedAt: number | undefined;
        for (let index = 0; index < 240 && arrivedAt === undefined; index++) {
            step();
            if (byId(population, 1).drinkUntil !== undefined) arrivedAt = time();
        }
        expect(arrivedAt).toBeDefined();
        const drinker = byId(population, 1);
        // On the land, beside the water (the column 39 is the last dry one).
        expect(Math.floor(drinker.x / 16)).toBe(39);
        expect(Math.abs(drinker.y - middle(20))).toBeLessThan(48);
        const place = { x: drinker.x, y: drinker.y };
        // It stands still while it drinks.
        step(PREY_DRINK_MS / LIFE_STEP_MS - 2);
        expect(byId(population, 1)).toMatchObject({ ...place });
        expect(byId(population, 1).drinkUntil).toBeDefined();
        step(3);
        const after = byId(population, 1);
        expect(after.drinkUntil).toBeUndefined();
        expect(after.drinkAt).toBeGreaterThanOrEqual(
            (arrivedAt ?? 0) + PREY_DRINK_MS + settings.drinkInterval * 1000 - 2000,
        );
    });

    it("a lion drinks too, longer than a prey", () => {
        const population = seeded([animal(1, "lion", "male", 38, 20, { drinkAt: 0 })]);
        const { step, time } = world(shore(), population);
        let from: number | undefined;
        let until: number | undefined;
        for (let index = 0; index < 240 && until === undefined; index++) {
            step();
            const drinking = byId(population, 1).drinkUntil !== undefined;
            if (drinking) from ??= time();
            else if (from !== undefined) until = time();
        }
        expect((until ?? 0) - (from ?? 0)).toBeGreaterThanOrEqual(DRINK_MS - LIFE_STEP_MS);
        expect(DRINK_MS).toBeGreaterThan(PREY_DRINK_MS);
    });

    it("gives up after a while on a land without water, until the next interval", () => {
        const population = seeded([animal(1, "antelope", "male", 30, 20, { drinkAt: 0 })]);
        const { step, time } = world(plain(), population);
        step(THIRST_GIVE_UP_MS / LIFE_STEP_MS + 2);
        const antelope = byId(population, 1);
        expect(antelope.drinkUntil).toBeUndefined();
        expect(antelope.drinkAt).toBeGreaterThan(time());
    });

    it("gives every animal a first thirst within an interval, without drawing a number", () => {
        const population = seeded([animal(1, "antelope", "male", 30, 20, { drinkAt: undefined })]);
        const { step } = world(plain(), population);
        step();
        const first = byId(population, 1).drinkAt ?? -1;
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThanOrEqual(settings.drinkInterval * 1000 + LIFE_STEP_MS);
    });

    it("stops drinking to run from an avatar, and comes back sooner than a whole interval", () => {
        const population = seeded([animal(1, "antelope", "male", 39, 20, { drinkUntil: 1e9 })]);
        const { step, time } = world(shore(), population);
        step(1, [{ x: middle(39) + 8, y: middle(20) + 40 }]);
        const antelope = byId(population, 1);
        expect(antelope.drinkUntil).toBeUndefined();
        expect(antelope.drinkAt).toBeLessThan(time() + settings.drinkInterval * 1000);
        expect(antelope.drinkAt).toBeGreaterThan(time());
    });

    it("a drinking antelope sees a lion only two tiles away", () => {
        const near = DRINK_WATCH_PX + 16;
        const drinking = seeded([
            animal(1, "antelope", "male", 39, 20, { drinkUntil: 1e9 }),
            animal(2, "lion", "male", 39, 20, { x: middle(39), y: middle(20) + near }),
        ]);
        world(shore(), drinking).step();
        expect(byId(drinking, 1).drinkUntil).toBeDefined();
        const watching = seeded([
            animal(1, "antelope", "male", 39, 20),
            animal(2, "lion", "male", 39, 20, { x: middle(39), y: middle(20) + near }),
        ]);
        world(shore(), watching).step();
        // Not drinking, it runs at once.
        expect(byId(watching, 1).y).toBeLessThan(middle(20));
        const close = seeded([
            animal(1, "antelope", "male", 39, 20, { drinkUntil: 1e9 }),
            animal(2, "lion", "male", 39, 20, { x: middle(39), y: middle(20) + DRINK_WATCH_PX - 8 }),
        ]);
        world(shore(), close).step();
        expect(byId(close, 1).drinkUntil).toBeUndefined();
    });

    it("a tamed animal does not go and drink", () => {
        const population = seeded([animal(1, "lion", "male", 30, 20, { drinkAt: 0, tamedBy: 7 })]);
        const { step } = world(shore(), population);
        step(20);
        expect(byId(population, 1)).toMatchObject({ x: middle(30), y: middle(20) });
    });
});

describe("the antelopes that became scarce", () => {
    /** 200 × 100 cells hold 125 antelopes: fewer than 12 are scarce there. */
    const wide = (): string[] => rows(".".repeat(200), 100);
    const herd = (count: number): Animal[] =>
        Array.from({ length: count }, (_, index) => animal(10 + index, "antelope", "male", 20 + index, 50));
    const lion = (): Animal => animal(1, "lion", "male", 20, 50, { readyAt: 0, ateAt: 1e12 });

    it("are left alone by the lions on a land that holds many", () => {
        const scarceUnder = Math.floor(125 * SCARCE_PREY_SHARE);
        const population = seeded([lion(), ...herd(scarceUnder - 1)]);
        world(wide(), population).step(60);
        expect(population.animals.filter((one) => one.kind === "antelope")).toHaveLength(scarceUnder - 1);
    });

    it("are hunted again once enough of them live there", () => {
        const scarceUnder = Math.floor(125 * SCARCE_PREY_SHARE);
        const population = seeded([lion(), ...herd(scarceUnder)]);
        world(wide(), population).step(60);
        expect(population.animals.filter((one) => one.kind === "antelope").length).toBeLessThan(scarceUnder);
    });

    it("a small land has no such refuge: its only antelope is a prey", () => {
        const population = seeded([lion(), animal(10, "antelope", "male", 21, 20)]);
        population.animals[0].x = middle(20);
        population.animals[0].y = middle(20);
        world(plain(), population).step(8);
        expect(population.animals.some((one) => one.id === 10)).toBe(false);
    });
});
