import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import {
    emptyPopulation,
    FEAR_RADIUS_PX,
    FISH_PER_DOLPHIN_COUPLE,
    lifeCensus,
    HUNT_GIVE_UP_MS,
    LIFE_STEP_MS,
    MAX_ANIMALS,
    stepPopulation,
} from "../src/Life/Population";
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
    dolphinReproductionDelay: 120,
    dolphinMaxLifespan: 3600,
    drinkInterval: 120,
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
const dolphin = (
    id: number,
    sex: "male" | "female",
    cellX: number,
    cellY: number,
    more: Partial<Animal> = {},
): Animal => ({
    ...fish(id, sex, cellX, cellY, 1e12),
    kind: "dolphin",
    ateAt: 0,
    ...more,
});
const seeded = (animals: Animal[]): Population => ({ animals, nextId: 100, seeded: true, dolphinsSeeded: true });
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

    it("puts a male and a female dolphin in a body with three hundred deep cells, and none in a smaller one", () => {
        // Thirty fish that neither breed nor die: enough for dolphins to come.
        const school = (count: number): Population => ({
            animals: Array.from({ length: count }, (_, index) => fish(index + 1, "male", index % 20, 2, 1e12)),
            nextId: 100,
            seeded: true,
        });
        const population = school(FISH_PER_DOLPHIN_COUPLE);
        run(population, lake(), 5000);
        expect(
            dolphinsOf(population)
                .map((animal) => animal.sex)
                .sort(),
        ).toEqual(["female", "male"]);
        for (const animal of dolphinsOf(population)) {
            expect(animal.lifespanMs).toBeGreaterThanOrEqual(0.7 * 3_600_000);
            expect(animal.lifespanMs).toBeLessThanOrEqual(3_600_000);
        }
        const none = school(FISH_PER_DOLPHIN_COUPLE);
        run(none, gridOf(rows("d".repeat(20), 14)), 5000);
        expect(dolphinsOf(none)).toHaveLength(0);
    });

    it("brings dolphins to a water whose fish fill the room", () => {
        // 60 × 50 deep cells hold more fish than a room does.
        const grid = gridOf(rows("d".repeat(60), 50));
        const population: Population = {
            animals: Array.from({ length: MAX_ANIMALS }, (_, index) =>
                fish(index + 1, "male", index % 60, Math.floor(index / 60), 1e12),
            ),
            nextId: 1000,
            seeded: true,
        };
        run(population, grid, 5000);
        expect(dolphinsOf(population)).toHaveLength(2);
    });

    it("brings no dolphin to a water that holds fewer than thirty fish: they would empty it", () => {
        const population: Population = {
            animals: Array.from({ length: FISH_PER_DOLPHIN_COUPLE - 1 }, (_, index) =>
                fish(index + 1, "male", index % 20, 2, 1e12),
            ),
            nextId: 100,
            seeded: true,
        };
        run(population, lake(), 5000);
        expect(dolphinsOf(population)).toHaveLength(0);
    });

    it("lets two fed dolphins have a calf, then wait their own breeding delay", () => {
        // 30 × 15 deep cells: room for three dolphins.
        const grid = gridOf(rows("d".repeat(30), 15));
        const male = dolphin(1, "male", 2, 2, { meals: 1, mateAt: 0 });
        const female = dolphin(2, "female", 20, 10, { meals: 1, mateAt: 0 });
        const population = seeded([male, female, fish(3, "male", 0, 14, 1e12)]);
        const bodies = waterBodiesOf(grid);
        const random = scripted();
        let births = 0;
        let now = 0;
        for (; now < 30_000 && births === 0; now += LIFE_STEP_MS) {
            births += stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, now, random).predatorBirths;
        }
        expect(births).toBe(1);
        const calf = dolphinsOf(population).find((animal) => animal.id >= 100);
        expect(calf?.sex === "male" || calf?.sex === "female").toBe(true);
        expect(male.mateAt).toBe(now - LIFE_STEP_MS + 120_000);
        expect(female.mateAt).toBe(male.mateAt);
        expect(calf?.mateAt).toBe(male.mateAt);
        expect(male.meals).toBe(0);
        // No second calf before the delay.
        run(population, grid, 60_000, now, random);
        expect(dolphinsOf(population)).toHaveLength(3);
    });

    it("gives no calf to dolphins that did not eat, nor to a water that already holds its dolphins", () => {
        const hungry = seeded([
            dolphin(1, "male", 2, 2, { mateAt: 0 }),
            dolphin(2, "female", 3, 2, { mateAt: 0 }),
            fish(3, "male", 0, 14, 1e12),
        ]);
        run(hungry, gridOf(rows("d".repeat(30), 15)), 10_000);
        expect(dolphinsOf(hungry)).toHaveLength(2);
        // 300 deep cells hold two dolphins.
        const full = seeded([
            dolphin(1, "male", 2, 2, { meals: 1, mateAt: 0 }),
            dolphin(2, "female", 3, 2, { meals: 1, mateAt: 0 }),
            fish(3, "male", 0, 14, 1e12),
        ]);
        run(full, lake(), 10_000);
        expect(dolphinsOf(full)).toHaveLength(2);
    });

    it("lets a dolphin die of age, and of hunger after eight hunting intervals without a catch", () => {
        const old = seeded([dolphin(1, "male", 5, 5, { lifespanMs: 5000, readyAt: 1e12 })]);
        const grid = lake();
        const bodies = waterBodiesOf(grid);
        expect(stepPopulation(old, grid, bodies, settings, LIFE_STEP_MS, 4500, scripted()).predatorDeaths).toBe(0);
        expect(stepPopulation(old, grid, bodies, settings, LIFE_STEP_MS, 5000, scripted()).predatorDeaths).toBe(1);
        expect(dolphinsOf(old)).toHaveLength(0);

        const starving = seeded([dolphin(1, "male", 5, 5, { ateAt: 1000, readyAt: 1e12 })]);
        const before = 1000 + 8 * 30_000 - LIFE_STEP_MS;
        expect(stepPopulation(starving, grid, bodies, settings, LIFE_STEP_MS, before, scripted()).predatorDeaths).toBe(
            0,
        );
        expect(
            stepPopulation(starving, grid, bodies, settings, LIFE_STEP_MS, before + LIFE_STEP_MS, scripted())
                .predatorDeaths,
        ).toBe(1);
    });

    it("counts a meal for the dolphin that eats, which keeps it from starving", () => {
        const hunter = dolphin(1, "male", 2, 2, { readyAt: 0, ateAt: 0 });
        const population = seeded([hunter, fish(2, "male", 2, 2, 1e12), fish(3, "male", 15, 10, 1e12)]);
        const grid = lake();
        stepPopulation(population, grid, waterBodiesOf(grid), settings, LIFE_STEP_MS, 7000, scripted());
        expect(hunter.meals).toBe(1);
        expect(hunter.ateAt).toBe(7000);
    });

    it("lets the dolphin eat a fish, then wait a hunting interval", () => {
        const hunter = dolphin(1, "male", 2, 2, { readyAt: 0 });
        const population = seeded([hunter, fish(2, "male", 15, 10, 1e12), fish(3, "male", 16, 10, 1e12)]);
        const grid = lake();
        const now = run(population, grid, 15_000);
        expect(fishOf(population)).toHaveLength(1);
        expect(hunter.readyAt).toBeGreaterThan(now);
        run(population, grid, 30_000, now);
        expect(fishOf(population)).toHaveLength(0);
    });

    it("gives up a hunt after twenty seconds when the fish stay in water too shallow for it", () => {
        const hunter = dolphin(1, "male", 5, 5, { readyAt: 0 });
        // A deep lake with a shallow bay on its east side.
        const grid = gridOf(rows("d".repeat(20) + "s", 15));
        const prey = fish(2, "male", 20, 7, 1e12);
        const population = seeded([hunter, prey]);
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
        expect(hunter.readyAt).toBeGreaterThan(now);
        expect(hunter.huntSince).toBeUndefined();
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

    it("tells what happened during a step: arrivals, births, and deaths by their cause", () => {
        const grid = pond();
        const bodies = waterBodiesOf(grid);
        const arrived = stepPopulation(emptyPopulation(), grid, bodies, settings, LIFE_STEP_MS, 0, scripted());
        expect(arrived).toEqual({
            arrivals: 2,
            births: 0,
            diedOfAge: 0,
            eaten: 0,
            diedDry: 0,
            predatorBirths: 0,
            predatorDeaths: 0,
        });

        const old = seeded([{ ...fish(1, "male", 0, 0, 1e12), lifespanMs: 1000 }, fish(2, "female", 5, 3, 1e12)]);
        expect(stepPopulation(old, grid, bodies, settings, LIFE_STEP_MS, 1000, scripted())).toMatchObject({
            diedOfAge: 1,
            eaten: 0,
            diedDry: 0,
        });

        const couple = seeded([fish(1, "male", 2, 2), fish(2, "female", 2, 2)]);
        const born = stepPopulation(couple, grid, bodies, settings, LIFE_STEP_MS, 0, scripted());
        expect(born.births).toBeGreaterThanOrEqual(2);
        expect(born.births).toBe(couple.animals.length - 2);

        const hunter = dolphin(1, "male", 2, 2, { readyAt: 0 });
        const hunted = seeded([hunter, fish(2, "male", 2, 2, 1e12), fish(3, "male", 15, 10, 1e12)]);
        const deep = lake();
        expect(stepPopulation(hunted, deep, waterBodiesOf(deep), settings, LIFE_STEP_MS, 0, scripted()).eaten).toBe(1);

        const stranded = seeded([{ ...fish(1, "male", 0, 0, 1e12), dryAt: 0 }]);
        const dry = gridOf(rows("........", 5));
        expect(
            stepPopulation(stranded, dry, waterBodiesOf(dry), settings, LIFE_STEP_MS, 5000, scripted()).diedDry,
        ).toBe(1);
    });

    it("counts the waters where fish can live, those where some do, and how many fish they can hold", () => {
        // Two ponds of 40 cells (5 fish each) and a puddle too small for fish.
        const grid = gridOf(rows("ssssssss.ssssssss.sss", 5));
        const population = seeded([fish(1, "male", 0, 0, 1e12), fish(2, "female", 1, 0, 1e12)]);
        expect(lifeCensus(population, waterBodiesOf(grid))).toEqual({
            habitableBodies: 2,
            populatedBodies: 1,
            capacity: 10,
        });
        expect(lifeCensus(emptyPopulation(), waterBodiesOf(gridOf(rows("...", 3))))).toEqual({
            habitableBodies: 0,
            populatedBodies: 0,
            capacity: 0,
        });
    });

    describe("fear of the avatars", () => {
        const wide = (): WaterGrid => gridOf(rows("s".repeat(30), 12));
        const away = (animal: Animal, threat: { x: number; y: number }): number =>
            Math.hypot(animal.x - threat.x, animal.y - threat.y);

        it("makes a fish swim away from an avatar that comes close, and leaves the others alone", () => {
            const grid = wide();
            const bodies = waterBodiesOf(grid);
            const threat = { x: 10 * 16, y: 6 * 16 };
            const near = fish(1, "male", 11, 6, 1e12);
            const far = { ...fish(2, "male", 28, 2, 1e12), targetX: 28 * 16 + 8, targetY: 3 * 16 + 8, speed: 1 };
            const population = seeded([near, far]);
            const random = scripted();
            const before = away(near, threat);
            for (let step = 0; step < 6; step++) {
                stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, step * 500, random, [threat]);
            }
            expect(away(near, threat)).toBeGreaterThan(before + 32);
            expect(away(near, threat)).toBeGreaterThanOrEqual(FEAR_RADIUS_PX);
            // The one far away kept its own slow way.
            expect(far.targetX).toBe(28 * 16 + 8);
            expect(Math.floor(far.x / 16)).toBe(28);
        });

        it("flees at its fastest, without ever leaving the water", () => {
            // A corridor one cell high: the fish is cornered against its dry end.
            const grid = gridOf(["ssssssssss", ".........."]);
            const bodies = waterBodiesOf(grid);
            const cornered = fish(1, "male", 1, 0, 1e12);
            const population = seeded([cornered]);
            const random = scripted();
            for (let step = 0; step < 20; step++) {
                stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, step * 500, random, [
                    { x: 3 * 16, y: 8 },
                ]);
                expect(grid.depthAt(Math.floor(cornered.x / 16), Math.floor(cornered.y / 16))).toBeGreaterThanOrEqual(
                    8,
                );
            }
            expect(population.animals).toHaveLength(1);
        });

        it("keeps frightened fish from mating and a frightened dolphin from hunting", () => {
            const pondGrid = pond();
            const couple = seeded([fish(1, "male", 2, 2), fish(2, "female", 2, 2)]);
            const frightened = stepPopulation(
                couple,
                pondGrid,
                waterBodiesOf(pondGrid),
                settings,
                LIFE_STEP_MS,
                0,
                scripted(),
                [{ x: 2 * 16 + 8, y: 2 * 16 + 8 }],
            );
            expect(frightened.births).toBe(0);

            const deep = lake();
            const hunter = dolphin(1, "male", 2, 2, { readyAt: 0 });
            const hunted = seeded([hunter, fish(2, "male", 2, 2, 1e12)]);
            const tally = stepPopulation(hunted, deep, waterBodiesOf(deep), settings, LIFE_STEP_MS, 0, scripted(), [
                { x: 2 * 16 + 8, y: 2 * 16 + 8 },
            ]);
            expect(tally.eaten).toBe(0);
        });
    });
});

describe("waterBodiesOf", () => {
    it("leaves the excluded cells (the pools) out of the water of the fish, however deep", () => {
        const grid = gridOf(["dddd", "dddd"]);
        const pool = (cellX: number): boolean => cellX >= 2;
        const bodies = waterBodiesOf(grid, (cellX) => pool(cellX));
        expect(bodies.bodyAt(0, 0)).toBeGreaterThan(0);
        expect(bodies.bodyAt(2, 0)).toBe(0);
        expect(bodies.swimmable(3, 1, 8)).toBe(false);
        expect(waterBodiesOf(grid).bodyAt(2, 0)).toBeGreaterThan(0);
    });
});
