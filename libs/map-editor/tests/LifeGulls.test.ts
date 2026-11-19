import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { GULL_NEEDS_FISH, GULL_SETTLE_MS } from "../src/Life/Gulls";
import { landPlacesOf } from "../src/Life/LandPlaces";
import { LIFE_STEP_MS, speciesCensus, stepPopulation } from "../src/Life/Population";
import type { Population, SpeciesTallies } from "../src/Life/Population";
import { SPECIES, SPECIES_WIRE, wireKindOf } from "../src/Life/Species";
import { waterBodiesOf } from "../src/Life/WaterBodies";
import { LifeSettings } from "../src/types";
import { gridOf, scripted } from "./lifeHelpers";

const settings: LifeSettings = LifeSettings.parse({
    enabled: true,
    reproductionDelay: 3600,
    maxLifespan: 86400,
    maxSpeed: 1.5,
    huntInterval: 3600,
    gullsEnabled: true,
    gullHuntInterval: 30,
    gullReproductionDelay: 60,
    gullMaxLifespan: 3600,
});
const rows = (row: string, count: number): string[] => Array.from({ length: count }, () => row);
/** A lake of 30 × 30 deep cells on the left (a hundred fish and more), dry land on the right. */
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
    readyAt: 1e12,
    ateAt: 1e12,
    drinkAt: 1e12,
    ...more,
});
const gull = (id: number, sex: "male" | "female", cellX: number, cellY: number, more: Partial<Animal> = {}): Animal =>
    animal(id, "gull", sex, cellX, cellY, { homeX: middle(15), homeY: middle(15), ...more });
const fish = (count: number, from = 100): Animal[] =>
    Array.from({ length: count }, (_, index) =>
        animal(from + index, "fish", "male", 2 + (index % 25), 2 + (index % 7)),
    );
const seeded = (animals: Animal[]): Population => ({
    animals,
    nextId: 1000,
    seeded: true,
    dolphinsSeeded: true,
    landSeeded: true,
    gullsSeeded: true,
});
const ofKind = (population: Population, kind: Animal["kind"]): Animal[] =>
    population.animals.filter((one) => one.kind === kind);
const byId = (population: Population, id: number): Animal => {
    const found = population.animals.find((one) => one.id === id);
    if (!found) throw new Error(`animal ${id} is gone`);
    return found;
};

function world(map: string[], population: Population, custom: Partial<LifeSettings> = {}) {
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
    const random = scripted();
    const step = (count = 1, threats: { x: number; y: number }[] = []) => {
        let last;
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
                threats,
                bySpecies,
                land,
            );
        }
        return last;
    };
    return { step, bySpecies, bodies, land, time: () => now };
}

describe("the gull in the table of the species", () => {
    it("lives in the air, eats fish, and is the sixth species on the wire", () => {
        expect(SPECIES.gull).toMatchObject({ habitat: "air", prey: ["fish"], tamable: false });
        expect(SPECIES_WIRE.gull).toBe(5);
        expect(wireKindOf("gull", "female")).toBe(11);
        expect(SPECIES.lion.prey).toContain("gull");
        expect(SPECIES.tiger.prey).not.toContain("gull");
        expect(SPECIES.fish.flees).not.toContain("gull");
    });
});

describe("gulls coming", () => {
    it("come as a couple over a lake with enough fish, at once the first time", () => {
        const population = { ...seeded(fish(GULL_NEEDS_FISH)), gullsSeeded: false };
        const { step, bySpecies } = world(lake(), population);
        step();
        const gulls = ofKind(population, "gull");
        expect(gulls.map((one) => one.sex).sort()).toEqual(["female", "male"]);
        expect(bySpecies.gull?.arrivals).toBe(2);
        expect(population.gullsSeeded).toBe(true);
        // Over their water, which is their home.
        for (const one of gulls) expect(one.x).toBeLessThan(30 * 16);
    });

    it("do not come over a lake with too few fish, nor with the gulls switched off, nor with the water off", () => {
        const few = { ...seeded(fish(GULL_NEEDS_FISH - 1)), gullsSeeded: false };
        world(lake(), few).step(20);
        expect(ofKind(few, "gull")).toHaveLength(0);
        const off = { ...seeded(fish(40)), gullsSeeded: false };
        world(lake(), off, { gullsEnabled: false }).step(20);
        expect(ofKind(off, "gull")).toHaveLength(0);
        const dry = { ...seeded(fish(40)), gullsSeeded: false };
        world(lake(), dry, { enabled: false }).step(20);
        expect(ofKind(dry, "gull")).toHaveLength(0);
    });

    it("are counted with a room for them over the water", () => {
        const population = seeded([gull(1, "male", 10, 10), ...fish(30)]);
        const { bodies, land } = world(lake(), population);
        const census = speciesCensus(population, bodies, land, true).find((one) => one.species === "gull");
        // 900 cells hold 112 fish: a gull for 25 of them.
        expect(census).toMatchObject({ males: 1, females: 0, cap: 4 });
        // No room for them on a map where they are off: they are not listed.
        expect(speciesCensus(seeded(fish(30)), bodies, land).some((one) => one.species === "gull")).toBe(false);
    });
});

describe("a hungry gull", () => {
    it("flies straight to a fish of its lake, over the land if it must, and eats it", () => {
        const population = seeded([
            gull(1, "male", 50, 15, { readyAt: 0, ateAt: 0 }),
            animal(100, "fish", "male", 10, 15),
        ]);
        const { step, bySpecies, time } = world(lake(), population);
        step(60);
        expect(ofKind(population, "fish")).toHaveLength(0);
        expect(bySpecies.fish?.eaten).toBe(1);
        expect(bySpecies.gull?.meals).toEqual({ fish: 1 });
        const fed = byId(population, 1);
        expect(fed.meals).toBe(1);
        expect(fed.readyAt).toBeGreaterThan(time());
    });

    it("does not eat the fish of another lake than its own", () => {
        const twoLakes = rows("d".repeat(20) + ".".repeat(20) + "d".repeat(20), 30);
        const population = seeded([
            gull(1, "male", 5, 15, { readyAt: 0, ateAt: 0, homeX: middle(5), homeY: middle(15) }),
            animal(100, "fish", "male", 50, 15),
        ]);
        world(twoLakes, population).step(120);
        expect(ofKind(population, "fish")).toHaveLength(1);
    });

    it("starves after too many hunts without a catch, and dies of age", () => {
        const starving = seeded([gull(1, "male", 10, 10, { readyAt: 0, ateAt: 0 })]);
        const starved = world(lake(), starving);
        starved.step(((SPECIES.gull.starveHunts ?? 0) * 30_000) / LIFE_STEP_MS + 2);
        expect(ofKind(starving, "gull")).toHaveLength(0);
        expect(starved.bySpecies.gull?.starved).toBe(1);
        const old = seeded([gull(1, "male", 10, 10, { lifespanMs: 5000 })]);
        const aged = world(lake(), old);
        aged.step(12);
        expect(ofKind(old, "gull")).toHaveLength(0);
        expect(aged.bySpecies.gull?.diedOfAge).toBe(1);
    });
});

describe("a fed gull", () => {
    it("goes and lands on the shore of its lake", () => {
        const population = seeded([gull(1, "male", 10, 15)]);
        const { step } = world(lake(), population);
        step(120);
        const landed = byId(population, 1);
        expect(landed.perchedAt).toBeDefined();
        // The first dry column beside the lake.
        expect(Math.floor(landed.x / 16)).toBe(30);
    });

    it("takes off from an avatar three tiles away, not from one further", () => {
        const perched = { perchedAt: -GULL_SETTLE_MS };
        const far = seeded([gull(1, "male", 30, 15, perched)]);
        world(lake(), far).step(1, [{ x: middle(30) + 100, y: middle(15) }]);
        expect(byId(far, 1).perchedAt).toBeDefined();
        const near = seeded([gull(1, "male", 30, 15, perched)]);
        world(lake(), near).step(1, [{ x: middle(30) + 90, y: middle(15) }]);
        expect(byId(near, 1).perchedAt).toBeUndefined();
    });

    it("takes off when the hunger comes back", () => {
        const population = seeded([gull(1, "male", 30, 15, { perchedAt: 0, readyAt: 1000, ateAt: 0 }), ...fish(3)]);
        world(lake(), population).step(4);
        expect(byId(population, 1).perchedAt).toBeUndefined();
    });

    it("has one or two young with a fed mate landed beside it, then both wait", () => {
        const fed = { perchedAt: -GULL_SETTLE_MS, meals: 3, mateAt: 0 };
        const population = seeded([gull(1, "male", 30, 15, fed), gull(2, "female", 30, 15, fed), ...fish(40)]);
        const { step, bySpecies } = world(lake(), population);
        step();
        const young = ofKind(population, "gull").filter((one) => one.id >= 1000);
        expect(young.length).toBeGreaterThanOrEqual(1);
        expect(young.length).toBeLessThanOrEqual(2);
        expect(bySpecies.gull?.births).toBe(young.length);
        expect(byId(population, 1).meals).toBe(0);
        expect(young[0]).toMatchObject({ homeX: middle(15), homeY: middle(15) });
        step(20);
        expect(ofKind(population, "gull")).toHaveLength(2 + young.length);
    });

    it("has no young once the room holds as many gulls as it may, whatever the fish eaten meanwhile", () => {
        // A sea big enough for more than sixteen gulls.
        const sea = rows("d".repeat(80) + ".".repeat(10), 80);
        const fed = { perchedAt: -GULL_SETTLE_MS, meals: 3, mateAt: 0 };
        const hungry = { readyAt: 0, ateAt: 0 };
        const others = Array.from({ length: SPECIES.gull.roomCap - 2 }, (_, index) =>
            gull(10 + index, "male", 10 + index, 10, { ...hungry, homeX: middle(40), homeY: middle(40) }),
        );
        const preys = Array.from({ length: 14 }, (_, index) => animal(200 + index, "fish", "male", 10 + index, 10));
        const home = { homeX: middle(40), homeY: middle(40) };
        const population = seeded([
            ...others,
            ...preys,
            gull(1, "male", 80, 40, { ...fed, ...home }),
            gull(2, "female", 80, 40, { ...fed, ...home }),
        ]);
        world(sea, population).step();
        expect(ofKind(population, "gull")).toHaveLength(SPECIES.gull.roomCap);
    });

    it("has no young once its lake holds as many gulls as it can", () => {
        const fed = { perchedAt: -GULL_SETTLE_MS, meals: 3, mateAt: 0 };
        const population = seeded([
            gull(1, "male", 30, 15, fed),
            gull(2, "female", 30, 15, fed),
            gull(3, "male", 5, 5),
            gull(4, "male", 6, 5),
            ...fish(40),
        ]);
        world(lake(), population).step();
        expect(ofKind(population, "gull")).toHaveLength(4);
    });
});

describe("the lion and the gull", () => {
    const hungryLion = (cellX: number, more: Partial<Animal> = {}): Animal =>
        animal(50, "lion", "male", cellX, 15, { readyAt: 0, ateAt: 0, ...more });

    it("catches a gull that has just landed beside it", () => {
        const population = seeded([gull(1, "male", 30, 15, { perchedAt: 0 }), hungryLion(30)]);
        const { step, bySpecies } = world(lake(), population);
        step();
        expect(ofKind(population, "gull")).toHaveLength(0);
        expect(bySpecies.gull?.eaten).toBe(1);
        expect(bySpecies.lion?.meals).toEqual({ gull: 1 });
        expect(byId(population, 50).meals).toBe(1);
    });

    it("does not catch one in flight, and a gull that has settled flies away from a lion two tiles away", () => {
        const flying = seeded([gull(1, "male", 30, 15), hungryLion(30)]);
        world(lake(), flying).step();
        expect(ofKind(flying, "gull")).toHaveLength(1);
        const settled = seeded([gull(1, "male", 30, 15, { perchedAt: -GULL_SETTLE_MS }), hungryLion(33)]);
        world(lake(), settled).step();
        expect(byId(settled, 1).perchedAt).toBeUndefined();
    });

    it("a tiger, a fed lion and a tamed lion leave it alone", () => {
        for (const other of [
            animal(50, "tiger", "male", 30, 15, { readyAt: 0, ateAt: 0 }),
            hungryLion(30, { readyAt: 1e12 }),
            hungryLion(30, { tamedBy: 7 }),
        ]) {
            const population = seeded([gull(1, "male", 30, 15, { perchedAt: 0 }), other]);
            world(lake(), population).step();
            expect(ofKind(population, "gull"), other.kind).toHaveLength(1);
        }
    });
});

describe("a gull whose lake is gone", () => {
    it("takes another lake of the map as its home", () => {
        const twoLakes = rows("d".repeat(20) + ".".repeat(20) + "d".repeat(20), 30);
        // Its home is on the land between both.
        const population = seeded([gull(1, "male", 30, 15, { homeX: middle(30), homeY: middle(15) })]);
        const { step, bodies } = world(twoLakes, population);
        step();
        const moved = byId(population, 1);
        expect(bodies.bodyAt(Math.floor((moved.homeX ?? 0) / 16), Math.floor((moved.homeY ?? 0) / 16))).not.toBe(0);
    });
});
