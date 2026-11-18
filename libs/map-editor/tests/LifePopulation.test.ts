import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { emptyPopulation, HUNT_GIVE_UP_MS, LIFE_STEP_MS, MAX_ANIMALS, stepPopulation } from "../src/Life/Population";
import type { Population } from "../src/Life/Population";
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
};
const rows = (row: string, count: number): string[] => Array.from({ length: count }, () => row);
/** A pond of 8 × 5 shallow cells: the smallest that gets fish. */
const pond = (): WaterGrid => gridOf(rows("ssssssss", 5));
/** A lake of 20 × 15 deep cells: the smallest that gets a dolphin. */
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
const seeded = (animals: Animal[]): Population => ({ animals, nextId: 100, seeded: true });
const fishOf = (population: Population): Animal[] => population.animals.filter((animal) => animal.kind === "fish");
const dolphinsOf = (population: Population): Animal[] =>
    population.animals.filter((animal) => animal.kind === "dolphin");

/** Runs the life for that long, from `from`, half a second at a time. Returns the time reached. */
function run(
    population: Population,
    grid: WaterGrid,
    ms: number,
    from = 0,
    random = scripted(),
    with_ = settings,
): number {
    const bodies = waterBodiesOf(grid);
    let now = from;
    for (; now < from + ms; now += LIFE_STEP_MS) {
        stepPopulation(population, grid, bodies, with_, LIFE_STEP_MS, now, random);
    }
    return now;
}

describe("stepPopulation", () => {
    it("puts a male and a female in a pond big enough, at once on a map never populated", () => {
        const population = emptyPopulation();
        run(population, pond(), LIFE_STEP_MS);
        expect(
            fishOf(population)
                .map((animal) => animal.sex)
                .sort(),
        ).toEqual(["female", "male"]);
        expect(population.seeded).toBe(true);
    });

    it("puts nothing in a pond under forty cells", () => {
        const population = emptyPopulation();
        run(population, gridOf(rows("sssssss", 5)), 10_000);
        expect(population.animals).toEqual([]);
    });

    it("brings fish back to a pond that lost them, after about a breeding delay, not at once", () => {
        const population = seeded([]);
        const grid = pond();
        run(population, grid, 2000);
        expect(population.animals).toEqual([]);
        run(population, grid, 20 * 60_000, 2000);
        expect(fishOf(population).length).toBeGreaterThanOrEqual(2);
    });

    it("lets a ready male find a ready female and gives them two to four young of random sex", () => {
        const population = seeded([fish(1, "male", 0, 0), fish(2, "female", 7, 4)]);
        const now = run(population, pond(), 30_000);
        const young = fishOf(population).filter((animal) => animal.id >= 100);
        expect(young.length).toBeGreaterThanOrEqual(2);
        expect(young.length).toBeLessThanOrEqual(4);
        for (const animal of population.animals) {
            expect(animal.readyAt).toBeGreaterThan(now);
            expect(animal.readyAt).toBeLessThanOrEqual(now + 60_000);
        }
    });

    it("does not let fish breed before their delay", () => {
        const population = seeded([fish(1, "male", 0, 0, 50_000), fish(2, "female", 1, 0, 50_000)]);
        run(population, pond(), 49_000);
        expect(population.animals).toHaveLength(2);
    });

    it("gives a female one litter a delay", () => {
        const population = seeded([
            fish(1, "male", 0, 0),
            fish(2, "male", 1, 0),
            fish(3, "male", 2, 0),
            fish(4, "female", 1, 1),
        ]);
        run(population, gridOf(rows("s".repeat(20), 10)), 50_000);
        const young = population.animals.filter((animal) => animal.id >= 100);
        expect(young.length).toBeGreaterThanOrEqual(2);
        expect(young.length).toBeLessThanOrEqual(4);
    });

    it("never holds more than a fish for eight cells of a body", () => {
        const population = seeded([fish(1, "male", 0, 0), fish(2, "female", 1, 0)]);
        const quick = { ...settings, reproductionDelay: 10 };
        // 40 cells: five fish at most.
        run(population, pond(), 10 * 60_000, 0, scripted(), quick);
        expect(fishOf(population).length).toBeLessThanOrEqual(5);
        expect(fishOf(population).length).toBeGreaterThan(2);
    });

    it("never holds more than three hundred animals in a room", () => {
        const many: Animal[] = [];
        for (let id = 1; id <= MAX_ANIMALS - 1; id++) many.push(fish(id, id % 2 ? "male" : "female", id % 60, id % 50));
        const population: Population = { animals: many, nextId: 1000, seeded: true };
        run(population, gridOf(rows("s".repeat(60), 50)), 5000);
        expect(population.animals.length).toBe(MAX_ANIMALS);
    });

    it("lets a fish die of age at the life it was given, between 70 % and 100 % of the longest", () => {
        const population = seeded([{ ...fish(1, "male", 0, 0, 1e12), lifespanMs: 5000 }]);
        const grid = pond();
        run(population, grid, 4500);
        expect(population.animals).toHaveLength(1);
        run(population, grid, 1000, 4500);
        expect(population.animals).toHaveLength(0);

        const born = emptyPopulation();
        run(born, grid, LIFE_STEP_MS);
        for (const animal of born.animals) {
            expect(animal.lifespanMs).toBeGreaterThanOrEqual(0.7 * 600_000);
            expect(animal.lifespanMs).toBeLessThanOrEqual(600_000);
        }
    });

    it("puts one dolphin, and only one, in a body with three hundred deep cells", () => {
        const population = emptyPopulation();
        run(population, lake(), 5000);
        expect(dolphinsOf(population)).toHaveLength(1);
        const none = emptyPopulation();
        run(none, gridOf(rows("d".repeat(20), 14)), 5000);
        expect(dolphinsOf(none)).toHaveLength(0);
    });

    it("lets the dolphin eat a fish, then wait a hunting interval", () => {
        const dolphin: Animal = { ...fish(1, "male", 2, 2), kind: "dolphin", sex: undefined };
        const population = seeded([dolphin, fish(2, "male", 15, 10, 1e12), fish(3, "male", 16, 10, 1e12)]);
        const grid = lake();
        const now = run(population, grid, 15_000);
        expect(fishOf(population)).toHaveLength(1);
        expect(dolphin.readyAt).toBeGreaterThan(now);
        run(population, grid, 30_000, now);
        expect(fishOf(population)).toHaveLength(0);
    });

    it("gives up a hunt after twenty seconds when the fish stay in water too shallow for it", () => {
        const dolphin: Animal = { ...fish(1, "male", 5, 5), kind: "dolphin", sex: undefined };
        // A deep lake with a shallow bay on its east side.
        const grid = gridOf(rows("d".repeat(20) + "s", 15));
        const prey = fish(2, "male", 20, 7, 1e12);
        const population = seeded([dolphin, prey]);
        // The fish stays in its bay: it is put back there after each step.
        const bodies = waterBodiesOf(grid);
        const random = scripted();
        let now = 0;
        for (; now < HUNT_GIVE_UP_MS + 1000; now += LIFE_STEP_MS) {
            stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, now, random);
            prey.x = 20 * 16 + 8;
            prey.targetX = prey.targetY = undefined;
        }
        expect(fishOf(population)).toHaveLength(1);
        expect(dolphin.readyAt).toBeGreaterThan(now);
        expect(dolphin.huntSince).toBeUndefined();
    });

    it("adds no couple when two populated bodies merge, and caps the merged body", () => {
        const population = seeded([
            fish(1, "male", 0, 0, 1e12),
            fish(2, "female", 1, 0, 1e12),
            fish(3, "male", 10, 0, 1e12),
            fish(4, "female", 11, 0, 1e12),
        ]);
        run(population, gridOf(rows("ssssssss.ssssssss", 5)), 5000);
        expect(population.animals).toHaveLength(4);
        run(population, gridOf(rows("sssssssssssssssss", 5)), 60_000, 5000);
        expect(population.animals).toHaveLength(4);
    });

    it("leaves the empty half of a body that split to wait like any empty pond", () => {
        const population = seeded([fish(1, "male", 0, 0, 1e12), fish(2, "female", 1, 0, 1e12)]);
        run(population, gridOf(rows("ssssssss.ssssssss", 5)), 2000);
        expect(population.animals).toHaveLength(2);
    });
});
