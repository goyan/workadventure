import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { FIRE_FEAR_PX, lifeFireOf } from "../src/Life/FireFear";
import type { LifeFire } from "../src/Life/FireFear";
import { GULL_SETTLE_MS } from "../src/Life/Gulls";
import { landPlacesOf } from "../src/Life/LandPlaces";
import { LIFE_STEP_MS, stepPopulation } from "../src/Life/Population";
import type { LifeTally, Population } from "../src/Life/Population";
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
    gullsEnabled: true,
};
const rows = (row: string, count: number): string[] => Array.from({ length: count }, () => row);
/** A plain of 40 × 25 dry cells of 16 px: 20 × 12 tiles of 32 px. */
const plain = (): string[] => rows(".".repeat(40), 25);
/** A lake on the left of a plain, as in the tests of the gulls: its shore is at the cells 29 and 30. */
const lake = (): string[] => rows("d".repeat(30) + ".".repeat(30), 30);
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
    ...more,
});
const seeded = (animals: Animal[]): Population => ({
    animals,
    nextId: 100,
    seeded: true,
    dolphinsSeeded: true,
    landSeeded: true,
    gullsSeeded: true,
});
const byId = (population: Population, id: number): Animal => {
    const found = population.animals.find((one) => one.id === id);
    if (!found) throw new Error(`animal ${id} is gone`);
    return found;
};
/** A fire on these tiles of 32 px, and on these trees. */
const fireOn = (tiles: [number, number][], trees: { x: number; y: number }[] = []): LifeFire => {
    const burning = new Set(tiles.map(([x, y]) => `${x},${y}`));
    return lifeFireOf({ fireAt: (x, y) => (burning.has(`${x},${y}`) ? 1 : 0) }, () => trees);
};
const block = (
    fromX: number,
    toX: number,
    fromY: number,
    toY: number,
    but: [number, number][] = [],
): [number, number][] => {
    const tiles: [number, number][] = [];
    for (let y = fromY; y <= toY; y++)
        for (let x = fromX; x <= toX; x++) if (!but.some(([bx, by]) => bx === x && by === y)) tiles.push([x, y]);
    return tiles;
};

function world(map: string[], population: Population, fire: LifeFire | undefined) {
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
    const step = (count = 1, threats: { x: number; y: number }[] = []): LifeTally => {
        let last: LifeTally | undefined;
        for (let index = 0; index < count; index++) {
            now += LIFE_STEP_MS;
            last = stepPopulation(
                population,
                grid,
                bodies,
                settings,
                LIFE_STEP_MS,
                now,
                random,
                threats,
                {},
                land,
                fire,
            );
        }
        if (!last) throw new Error("no step");
        return last;
    };
    return { step };
}

describe("the fire the animals see", () => {
    it("is the nearest burning tile within five tiles, by its middle", () => {
        const fire = fireOn([
            [7, 5],
            [2, 5],
        ]);
        expect(FIRE_FEAR_PX).toBe(160);
        // From (168, 168): the tile 7,5 has its middle at (240, 176), 72 px away; the tile 2,5 at (80, 176), 88 px.
        expect(fire.near(168, 168)).toEqual({ x: 240, y: 176 });
        expect(fire.near(100, 168)).toEqual({ x: 80, y: 176 });
        // 161 px west of the middle of the tile 2,5 and further: nothing.
        expect(fireOn([[7, 5]]).near(240 - 161, 176)).toBeUndefined();
        expect(fireOn([[7, 5]]).near(240 - 159, 176)).toEqual({ x: 240, y: 176 });
        expect(fireOn([]).near(168, 168)).toBeUndefined();
    });

    it("looks as far as it is asked to", () => {
        const fire = fireOn([[7, 5]]);
        // 200 px west of the middle of the tile: out of the usual reach, within one of 224 px.
        expect(fire.near(40, 176)).toBeUndefined();
        expect(fire.near(40, 176, 224)).toEqual({ x: 240, y: 176 });
        expect(fire.near(10, 176, 224)).toBeUndefined();
    });

    it("is a burning tree too, when it is nearer", () => {
        const fire = fireOn([[7, 5]], [{ x: 150, y: 168 }]);
        expect(fire.near(168, 168)).toEqual({ x: 150, y: 168 });
        expect(fire.near(260, 176)).toEqual({ x: 240, y: 176 });
    });

    it("tells whether a point burns: its tile is on fire", () => {
        const fire = fireOn([[7, 5]]);
        expect(fire.burning(224, 160)).toBe(true);
        expect(fire.burning(255, 191)).toBe(true);
        expect(fire.burning(223, 176)).toBe(false);
        expect(fire.burning(240, 192)).toBe(false);
    });
});

describe("the animals of the land and the fire", () => {
    it("makes an antelope run away from a fire five tiles away or less, and not mate meanwhile", () => {
        const population = seeded([animal(1, "antelope", "male", 10, 10), animal(2, "antelope", "female", 10, 10)]);
        const tally = world(plain(), population, fireOn([[7, 5]])).step();
        expect(tally.births).toBe(0);
        // The fire is on its east: it goes west.
        expect(byId(population, 1).x).toBeLessThan(middle(10));
        expect(byId(population, 2).x).toBeLessThan(middle(10));
    });

    it("leaves it alone when the fire is further", () => {
        const population = seeded([animal(1, "antelope", "male", 10, 10), animal(2, "antelope", "female", 10, 10)]);
        // The tile 12,5 has its middle 232 px east of them.
        const tally = world(plain(), population, fireOn([[12, 5]])).step();
        expect(tally.births).toBeGreaterThan(0);
    });

    it("makes a fed lion run too, though it lets the avatars come", () => {
        const fed = { readyAt: 1e12, ateAt: 0 };
        const calm = seeded([animal(1, "lion", "male", 10, 10, fed)]);
        world(plain(), calm, undefined).step(1, [{ x: middle(10) + 40, y: middle(10) }]);
        const scared = seeded([animal(1, "lion", "male", 10, 10, fed)]);
        world(plain(), scared, fireOn([[7, 5]])).step();
        expect(byId(scared, 1).x).toBeLessThan(middle(10));
        expect(byId(scared, 1).targetX).toBeLessThan(middle(10));
        // The avatar alone gave it no way to run to the west.
        expect(byId(calm, 1).targetX === undefined || byId(calm, 1).targetX !== byId(scared, 1).targetX).toBe(true);
    });

    it("puts the fire before an avatar that stands nearer", () => {
        const population = seeded([animal(1, "antelope", "male", 10, 10)]);
        // The avatar is 40 px west, the fire 72 px east: alone, the avatar would send it east.
        world(plain(), population, fireOn([[7, 5]])).step(1, [{ x: middle(10) - 40, y: middle(10) }]);
        expect(byId(population, 1).x).toBeLessThan(middle(10));
    });

    it("never sends it to a tile on fire", () => {
        // A fire on its east, and another where the straight way out to the west ends.
        const fire = fireOn([
            [7, 5],
            [3, 5],
            [3, 4],
            [3, 6],
        ]);
        const population = seeded([animal(1, "antelope", "male", 10, 10)]);
        const { step } = world(plain(), population, fire);
        for (let index = 0; index < 12; index++) {
            step();
            const { x, y, targetX, targetY } = byId(population, 1);
            if (targetX !== undefined && targetY !== undefined) expect(fire.burning(targetX, targetY)).toBe(false);
            expect(fire.burning(x, y)).toBe(false);
        }
    });

    it("stays where it is when the fire is all around its tile", () => {
        // Everything burns six tiles around, but its own tile 5,5.
        const fire = fireOn(block(0, 11, 0, 11, [[5, 5]]));
        const population = seeded([animal(1, "antelope", "male", 10, 10)]);
        const { step } = world(plain(), population, fire);
        for (let index = 0; index < 10; index++) {
            step();
            const { x, y } = byId(population, 1);
            expect([Math.floor(x / 32), Math.floor(y / 32)]).toEqual([5, 5]);
        }
    });

    it("runs through the flames to the nearest ground that does not burn when its own tile is on fire", () => {
        // The tiles 0 to 9 burn, its own included: the nearest that does not is the tile 10, ten cells on its east,
        // further than the places it looks at to run from an avatar.
        const fire = fireOn(block(0, 9, 0, 12));
        const population = seeded([animal(1, "antelope", "male", 10, 10)]);
        const { step } = world(plain(), population, fire);
        expect(fire.burning(middle(10), middle(10))).toBe(true);
        step();
        // Straight to the east, where the fire stops.
        expect(byId(population, 1).targetX).toBe(middle(20));
        expect(byId(population, 1).targetY).toBe(middle(10));
        step(40);
        const { x, y } = byId(population, 1);
        expect(fire.burning(x, y)).toBe(false);
        // It did not die of it.
        expect(population.animals).toHaveLength(1);
    });

    it("lets no couple arrive on a land that burns", () => {
        const burnt: Population = { animals: [], nextId: 1, seeded: true };
        world(plain(), burnt, fireOn(block(0, 19, 0, 12))).step();
        expect(burnt.animals.filter((one) => one.kind === "antelope")).toHaveLength(0);
        const green: Population = { animals: [], nextId: 1, seeded: true };
        world(plain(), green, fireOn([])).step();
        expect(green.animals.filter((one) => one.kind === "antelope")).toHaveLength(2);
    });

    it("leaves the fish alone: the water does not burn", () => {
        const population = seeded([animal(1, "fish", "male", 10, 10)]);
        const same = seeded([animal(1, "fish", "male", 10, 10)]);
        world(lake(), population, fireOn([[7, 5]])).step();
        world(lake(), same, undefined).step();
        expect(byId(population, 1)).toEqual(byId(same, 1));
    });
});

describe("the gulls and the fire", () => {
    const home = { homeX: middle(15), homeY: middle(15) };
    const perched = { ...home, perchedAt: -GULL_SETTLE_MS, readyAt: 1e12, ateAt: 0 };

    it("takes off from a fire three tiles away, not from one further", () => {
        // The gull stands at (488, 248). The tile 17,7 has its middle 72 px away, the tile 19,7 136 px away.
        const near = seeded([animal(1, "gull", "male", 30, 15, perched)]);
        world(lake(), near, fireOn([[17, 7]])).step();
        expect(byId(near, 1).perchedAt).toBeUndefined();
        const far = seeded([animal(1, "gull", "male", 30, 15, perched)]);
        world(lake(), far, fireOn([[19, 7]])).step();
        expect(byId(far, 1).perchedAt).toBeDefined();
    });

    it("does not land on a shore that close to a fire", () => {
        // A fed gull over the water, beside the shore: it lands, unless the shore burns.
        const flying = { ...home, readyAt: 1e12, ateAt: 0 };
        const everLanded = (fire: LifeFire | undefined): boolean => {
            const population = seeded([animal(1, "gull", "male", 28, 15, flying)]);
            const { step } = world(lake(), population, fire);
            let landed = false;
            for (let index = 0; index < 20; index++) {
                step();
                landed ||= byId(population, 1).perchedAt !== undefined;
            }
            return landed;
        };
        expect(everLanded(undefined)).toBe(true);
        // Every tile of the shore and around burns.
        expect(everLanded(fireOn(block(13, 18, 0, 14)))).toBe(false);
    });
});
