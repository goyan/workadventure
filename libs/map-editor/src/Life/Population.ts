import type { WaterGrid } from "../Terrain/WaterGrid";
import { TERRAIN_CELL } from "../types";
import type { LifeSettings } from "../types";
import type { Animal } from "./Animal";
import { cellAt, swim } from "./Swim";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX } from "./WaterBodies";
import type { WaterBodies } from "./WaterBodies";

/** The life is stepped twice a second. */
export const LIFE_STEP_MS = 500;
/** The most animals a room holds, dolphins included. */
export const MAX_ANIMALS = 300;
export const MAX_DOLPHINS = 12;
/** The smallest body of water that gets fish, in cells. */
export const MIN_BODY_CELLS = 40;
/** A body gets a dolphin with this many cells deep enough for it. */
export const MIN_DOLPHIN_DEEP_CELLS = 300;
/** A body holds a fish for this many cells (two fish at least). */
export const CELLS_PER_FISH = 8;
/** A dolphin that caught nothing for this long stops hunting until its next interval. */
export const HUNT_GIVE_UP_MS = 20_000;
/** A hunting dolphin swims this many times faster than the fastest fish. */
export const DOLPHIN_SPEED_FACTOR = 1.5;
/** A mate or a prey is reached within this distance, in map pixels. */
const REACH_PX = TERRAIN_CELL;
/** After failing to go straight to a mate or a prey, an animal wanders this long before it tries again. */
const DETOUR_MS = 3000;
/** A tile is 32 map pixels: speeds are set in tiles a second. */
const TILE_PX = 32;
const SMALLEST_LITTER = 2;
const LARGEST_LITTER = 4;
/** A fish lives between this share of the longest life and the longest life, so that a litter does not die at once. */
const SHORTEST_LIFE_SHARE = 0.7;

export interface Population {
    animals: Animal[];
    nextId: number;
    /** Whether the room ever got fish: the first ones come at once, later ones after about a breeding delay. */
    seeded: boolean;
}

/** What happened to the animals of a room during a step (or summed over many). */
export interface LifeTally {
    /** Fish and dolphins that came by themselves into an empty water. */
    arrivals: number;
    births: number;
    diedOfAge: number;
    eaten: number;
    /** Left without water. */
    diedDry: number;
}
export const emptyLifeTally = (): LifeTally => ({ arrivals: 0, births: 0, diedOfAge: 0, eaten: 0, diedDry: 0 });

/** The waters of a room as the life sees them. */
export interface LifeCensus {
    /** Bodies of water big enough for fish. */
    habitableBodies: number;
    /** Those where fish live now. */
    populatedBodies: number;
    /** How many fish the habitable bodies can hold together (never more than the room holds). */
    capacity: number;
}

const fishCapOf = (cells: number): number => Math.max(2, Math.floor(cells / CELLS_PER_FISH));

export function lifeCensus(population: Population, bodies: WaterBodies): LifeCensus {
    const populated = new Set<number>();
    for (const animal of population.animals) {
        if (animal.kind === "fish") populated.add(bodyOf(animal, bodies));
    }
    const census: LifeCensus = { habitableBodies: 0, populatedBodies: 0, capacity: 0 };
    for (let body = 1; body < bodies.sizes.length; body++) {
        if (bodies.sizes[body].cells < MIN_BODY_CELLS) continue;
        census.habitableBodies++;
        if (populated.has(body)) census.populatedBodies++;
        census.capacity += fishCapOf(bodies.sizes[body].cells);
    }
    census.capacity = Math.min(census.capacity, MAX_ANIMALS);
    return census;
}

export const emptyPopulation = (): Population => ({ animals: [], nextId: 1, seeded: false });

const bodyOf = (animal: Animal, bodies: WaterBodies): number => bodies.bodyAt(cellAt(animal.x), cellAt(animal.y));
const distance = (a: Animal, b: Animal): number => Math.hypot(a.x - b.x, a.y - b.y);

function nearest(from: Animal, candidates: readonly Animal[]): Animal | undefined {
    let best: Animal | undefined;
    for (const candidate of candidates) {
        if (!best || distance(from, candidate) < distance(from, best)) best = candidate;
    }
    return best;
}

/**
 * One step of the life of the water of a room: the old die, dolphins hunt, fish mate, everyone swims (those left
 * without water die), and the bodies of water big enough get their first fish and their dolphin. The same inputs
 * (random included) give the same life: the server alone runs it.
 */
export function stepPopulation(
    population: Population,
    grid: WaterGrid,
    bodies: WaterBodies,
    settings: LifeSettings,
    dtMs: number,
    now: number,
    random: () => number,
): LifeTally {
    const tally = emptyLifeTally();
    const maxSpeed = settings.maxSpeed * TILE_PX;
    const delayMs = settings.reproductionDelay * 1000;
    const dead = new Set<Animal>();
    for (const animal of population.animals) {
        if (animal.kind === "fish" && now - animal.bornAt >= animal.lifespanMs) {
            dead.add(animal);
            tally.diedOfAge++;
        }
    }

    // Who lives in which body, to look for a mate or a prey among neighbours only.
    const fishByBody = new Map<number, Animal[]>();
    for (const animal of population.animals) {
        if (animal.kind !== "fish" || dead.has(animal)) continue;
        const body = bodyOf(animal, bodies);
        const list = fishByBody.get(body);
        if (list) list.push(animal);
        else fishByBody.set(body, [animal]);
    }
    const pursuing = new Set<Animal>();
    const pursue = (animal: Animal, target: Animal, speed: number): void => {
        animal.targetX = target.x;
        animal.targetY = target.y;
        animal.speed = speed;
        pursuing.add(animal);
    };
    const detouring = (animal: Animal): boolean => (animal.wanderUntil ?? 0) > now;

    for (const dolphin of population.animals) {
        if (dolphin.kind !== "dolphin" || now < dolphin.readyAt) continue;
        dolphin.huntSince ??= now;
        if (now - dolphin.huntSince >= HUNT_GIVE_UP_MS) {
            dolphin.huntSince = undefined;
            dolphin.readyAt = now + settings.huntInterval * 1000;
            continue;
        }
        if (detouring(dolphin)) continue;
        const body = bodyOf(dolphin, bodies);
        // Shallow water is a refuge: a fish is a prey only where the dolphin itself can swim.
        const prey =
            body === 0
                ? undefined
                : nearest(
                      dolphin,
                      (fishByBody.get(body) ?? []).filter(
                          (fish) =>
                              !dead.has(fish) && bodies.swimmable(cellAt(fish.x), cellAt(fish.y), DOLPHIN_DEPTH_PX),
                      ),
                  );
        if (!prey) continue;
        if (distance(dolphin, prey) < REACH_PX) {
            dead.add(prey);
            tally.eaten++;
            dolphin.huntSince = undefined;
            dolphin.readyAt = now + settings.huntInterval * 1000;
            dolphin.targetX = dolphin.targetY = undefined;
        } else {
            pursue(dolphin, prey, maxSpeed * DOLPHIN_SPEED_FACTOR);
        }
    }

    const born: Animal[] = [];
    for (const [body, list] of fishByBody) {
        if (body === 0) continue;
        const cap = fishCapOf(bodies.sizes[body].cells);
        let living = list.filter((fish) => !dead.has(fish)).length;
        for (const male of list) {
            if (male.sex !== "male" || dead.has(male) || now < male.readyAt || detouring(male)) continue;
            const female = nearest(
                male,
                list.filter((fish) => fish.sex === "female" && !dead.has(fish) && now >= fish.readyAt),
            );
            if (!female) continue;
            if (distance(male, female) >= REACH_PX) {
                pursue(male, female, maxSpeed);
                continue;
            }
            const wanted = SMALLEST_LITTER + Math.floor(random() * (LARGEST_LITTER - SMALLEST_LITTER + 1));
            const room = MAX_ANIMALS - (population.animals.length - dead.size + born.length);
            const litter = Math.max(0, Math.min(wanted, LARGEST_LITTER, cap - living, room));
            for (let index = 0; index < litter; index++) {
                born.push(
                    newFish(population, random() < 0.5 ? "male" : "female", female.x, female.y, now, settings, random),
                );
            }
            living += litter;
            tally.births += litter;
            // With or without young (a full body), both wait a whole delay again; so do the young.
            male.readyAt = female.readyAt = now + delayMs;
            for (const young of born.slice(born.length - litter)) young.readyAt = now + delayMs;
            male.targetX = male.targetY = undefined;
        }
    }

    for (const animal of population.animals) {
        if (dead.has(animal)) continue;
        if (!swim(animal, bodies, grid, maxSpeed, dtMs, now, random)) {
            dead.add(animal);
            tally.diedDry++;
        } else if (pursuing.has(animal) && animal.targetX === undefined) {
            // Stopped on its straight way to its mate or its prey: it goes round by wandering a while.
            animal.wanderUntil = now + DETOUR_MS;
        }
    }
    population.animals = population.animals.filter((animal) => !dead.has(animal)).concat(born);

    const before = population.animals.length;
    spawn(population, bodies, settings, dtMs, now, random);
    tally.arrivals = population.animals.length - before;
    return tally;
}

function newFish(
    population: Population,
    sex: "male" | "female",
    x: number,
    y: number,
    now: number,
    settings: LifeSettings,
    random: () => number,
): Animal {
    return {
        id: population.nextId++,
        kind: "fish",
        sex,
        x,
        y,
        bornAt: now,
        lifespanMs: settings.maxLifespan * 1000 * (SHORTEST_LIFE_SHARE + (1 - SHORTEST_LIFE_SHARE) * random()),
        readyAt: now,
    };
}

/** The first fish of the bodies big enough, and their dolphin. */
function spawn(
    population: Population,
    bodies: WaterBodies,
    settings: LifeSettings,
    dtMs: number,
    now: number,
    random: () => number,
): void {
    const fishIn = new Set<number>();
    const dolphinIn = new Set<number>();
    let dolphins = 0;
    for (const animal of population.animals) {
        const body = bodyOf(animal, bodies);
        if (animal.kind === "fish") fishIn.add(body);
        else {
            dolphinIn.add(body);
            dolphins++;
        }
    }
    const middle = (cell: number): number => cell * TERRAIN_CELL + TERRAIN_CELL / 2;
    // An empty body waits about a breeding delay for its fish; none remembers since when, as bodies merge and split.
    const chance = dtMs / (settings.reproductionDelay * 1000);
    const first = !population.seeded;
    for (let body = 1; body < bodies.sizes.length; body++) {
        const size = bodies.sizes[body];
        if (
            size.cells >= MIN_BODY_CELLS &&
            !fishIn.has(body) &&
            population.animals.length + 2 <= MAX_ANIMALS &&
            (first || random() < chance)
        ) {
            for (const sex of ["male", "female"] as const) {
                const cell = bodies.anyCell(body, FISH_DEPTH_PX, random);
                if (!cell) continue;
                population.animals.push(
                    newFish(population, sex, middle(cell.cellX), middle(cell.cellY), now, settings, random),
                );
                population.seeded = true;
            }
        }
        if (
            size.deep >= MIN_DOLPHIN_DEEP_CELLS &&
            !dolphinIn.has(body) &&
            dolphins < MAX_DOLPHINS &&
            population.animals.length < MAX_ANIMALS
        ) {
            const cell = bodies.anyCell(body, DOLPHIN_DEPTH_PX, random);
            if (!cell) continue;
            dolphins++;
            population.animals.push({
                id: population.nextId++,
                kind: "dolphin",
                x: middle(cell.cellX),
                y: middle(cell.cellY),
                bornAt: now,
                lifespanMs: Number.MAX_SAFE_INTEGER,
                readyAt: now + settings.huntInterval * 1000,
            });
        }
    }
}
