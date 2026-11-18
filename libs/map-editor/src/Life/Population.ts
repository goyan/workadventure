import type { WaterGrid } from "../Terrain/WaterGrid";
import { TERRAIN_CELL } from "../types";
import type { LifeSettings } from "../types";
import type { Animal } from "./Animal";
import { DOLPHIN_SPEED_FACTOR, MAX_ANIMALS, MAX_DOLPHINS, MEALS_FOR_CALF, STARVE_HUNTS } from "./LifeConstants";
import { cellAt, minDepthOf, swim, WANDER_REACH_CELLS } from "./Swim";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX } from "./WaterBodies";
import type { WaterBodies } from "./WaterBodies";

export { DOLPHIN_SPEED_FACTOR, MAX_ANIMALS, MAX_DOLPHINS, MEALS_FOR_CALF, STARVE_HUNTS } from "./LifeConstants";

/** The life is stepped twice a second. */
export const LIFE_STEP_MS = 500;
/** The smallest body of water that gets fish, in cells. */
export const MIN_BODY_CELLS = 40;
/** A body gets a dolphin with this many cells deep enough for it. */
export const MIN_DOLPHIN_DEEP_CELLS = 300;
/** A body holds a fish for this many cells (two fish at least). */
export const CELLS_PER_FISH = 8;
/** A body holds a dolphin for this many cells deep enough for it (so the smallest one that gets dolphins holds two). */
export const DEEP_CELLS_PER_DOLPHIN = 150;
/** An animal flees an avatar that comes this close (three tiles), in map pixels. */
export const FEAR_RADIUS_PX = 96;
/** It flees towards a point this far from where it is. */
const FLEE_REACH_PX = 3 * TERRAIN_CELL;
/** When it cannot swim straight away, it tries this many cells around and takes the one furthest from the avatar. */
const FLEE_DRAWS = 6;
/** A dolphin that caught nothing for this long stops hunting until its next interval. */
export const HUNT_GIVE_UP_MS = 20_000;
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
    /** The same for the dolphins. */
    dolphinsSeeded?: boolean;
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
    /** The dolphins: calves born, and deaths of age or of hunger. */
    predatorBirths: number;
    predatorDeaths: number;
}
export const emptyLifeTally = (): LifeTally => ({
    arrivals: 0,
    births: 0,
    diedOfAge: 0,
    eaten: 0,
    diedDry: 0,
    predatorBirths: 0,
    predatorDeaths: 0,
});

/** The waters of a room as the life sees them. */
export interface LifeCensus {
    /** Bodies of water big enough for fish. */
    habitableBodies: number;
    /** Those where fish live now. */
    populatedBodies: number;
    /** How many fish the habitable bodies can hold together (never more than the room holds). */
    capacity: number;
}

const dolphinCapOf = (deepCells: number): number => Math.floor(deepCells / DEEP_CELLS_PER_DOLPHIN);
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
 *
 * The animals fear the avatars: `threats` are where the avatars stand, in map pixels. An animal near one swims away
 * at its fastest, and neither mates nor hunts meanwhile.
 */
export function stepPopulation(
    population: Population,
    grid: WaterGrid,
    bodies: WaterBodies,
    settings: LifeSettings,
    dtMs: number,
    now: number,
    random: () => number,
    threats: readonly { x: number; y: number }[] = [],
): LifeTally {
    const tally = emptyLifeTally();
    const maxSpeed = settings.maxSpeed * TILE_PX;
    const delayMs = settings.reproductionDelay * 1000;
    const starveMs = STARVE_HUNTS * settings.huntInterval * 1000;
    const dead = new Set<Animal>();
    for (const animal of population.animals) {
        if (animal.kind === "fish") {
            if (now - animal.bornAt >= animal.lifespanMs) {
                dead.add(animal);
                tally.diedOfAge++;
            }
            continue;
        }
        // A dolphin kept from before dolphins had a sex.
        animal.sex ??= random() < 0.5 ? "male" : "female";
        if (now - animal.bornAt >= animal.lifespanMs || now - (animal.ateAt ?? animal.bornAt) >= starveMs) {
            dead.add(animal);
            tally.predatorDeaths++;
        }
    }

    // Who is frightened, and by which avatar (the nearest one).
    const frightened = new Map<Animal, { x: number; y: number }>();
    if (threats.length > 0) {
        for (const animal of population.animals) {
            if (dead.has(animal)) continue;
            let nearestThreat: { x: number; y: number } | undefined;
            let least = FEAR_RADIUS_PX;
            for (const threat of threats) {
                const far = Math.hypot(animal.x - threat.x, animal.y - threat.y);
                if (far < least) {
                    least = far;
                    nearestThreat = threat;
                }
            }
            if (nearestThreat) frightened.set(animal, nearestThreat);
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
        if (dolphin.kind !== "dolphin" || dead.has(dolphin) || now < dolphin.readyAt) continue;
        if (frightened.has(dolphin)) continue;
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
            dolphin.ateAt = now;
            dolphin.meals = (dolphin.meals ?? 0) + 1;
            dolphin.huntSince = undefined;
            dolphin.readyAt = now + settings.huntInterval * 1000;
            dolphin.targetX = dolphin.targetY = undefined;
        } else {
            pursue(dolphin, prey, maxSpeed * DOLPHIN_SPEED_FACTOR);
        }
    }

    const born: Animal[] = [];

    // The dolphins breed too: a fed male goes to a fed female of its body, while their water has room for a calf.
    const dolphinsByBody = new Map<number, Animal[]>();
    let dolphins = 0;
    for (const animal of population.animals) {
        if (animal.kind !== "dolphin" || dead.has(animal)) continue;
        dolphins++;
        const body = bodyOf(animal, bodies);
        const list = dolphinsByBody.get(body);
        if (list) list.push(animal);
        else dolphinsByBody.set(body, [animal]);
    }
    const canBreed = (dolphin: Animal): boolean =>
        now >= (dolphin.mateAt ?? 0) && (dolphin.meals ?? 0) >= MEALS_FOR_CALF;
    const calfDelayMs = settings.dolphinReproductionDelay * 1000;
    for (const [body, list] of dolphinsByBody) {
        if (body === 0) continue;
        const cap = dolphinCapOf(bodies.sizes[body].deep);
        let living = list.length;
        for (const male of list) {
            // A dolphin on a hunt does not court.
            if (male.sex !== "male" || !canBreed(male) || pursuing.has(male) || detouring(male)) continue;
            if (frightened.has(male)) continue;
            if (living >= cap || dolphins >= MAX_DOLPHINS) break;
            if (population.animals.length - dead.size + born.length >= MAX_ANIMALS) break;
            const female = nearest(
                male,
                list.filter((other) => other.sex === "female" && canBreed(other) && !frightened.has(other)),
            );
            if (!female) continue;
            if (distance(male, female) >= REACH_PX) {
                pursue(male, female, maxSpeed);
                continue;
            }
            born.push({
                ...newDolphin(
                    population,
                    random() < 0.5 ? "male" : "female",
                    female.x,
                    female.y,
                    now,
                    settings,
                    random,
                ),
                mateAt: now + calfDelayMs,
            });
            living++;
            dolphins++;
            tally.predatorBirths++;
            male.mateAt = female.mateAt = now + calfDelayMs;
            male.meals = female.meals = 0;
            male.targetX = male.targetY = undefined;
        }
    }

    for (const [body, list] of fishByBody) {
        if (body === 0) continue;
        const cap = fishCapOf(bodies.sizes[body].cells);
        let living = list.filter((fish) => !dead.has(fish)).length;
        for (const male of list) {
            if (male.sex !== "male" || dead.has(male) || now < male.readyAt || detouring(male)) continue;
            if (frightened.has(male)) continue;
            const female = nearest(
                male,
                list.filter(
                    (fish) => fish.sex === "female" && !dead.has(fish) && now >= fish.readyAt && !frightened.has(fish),
                ),
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

    for (const [animal, threat] of frightened) {
        flee(animal, threat, bodies, maxSpeed, random);
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

/**
 * Gives a frightened animal somewhere to swim to, away from the avatar: straight away when the water allows, else
 * the cell of its water furthest from the avatar among a few around it.
 */
function flee(
    animal: Animal,
    threat: { x: number; y: number },
    bodies: WaterBodies,
    maxSpeed: number,
    random: () => number,
): void {
    const minDepth = minDepthOf(animal);
    const cellX = cellAt(animal.x);
    const cellY = cellAt(animal.y);
    const body = bodies.bodyAt(cellX, cellY);
    animal.speed = animal.kind === "dolphin" ? maxSpeed * DOLPHIN_SPEED_FACTOR : maxSpeed;
    let dx = animal.x - threat.x;
    let dy = animal.y - threat.y;
    const far = Math.hypot(dx, dy);
    if (far < 1) {
        // Right under the avatar: any way out.
        const angle = random() * 2 * Math.PI;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
    } else {
        dx /= far;
        dy /= far;
    }
    const x = animal.x + dx * FLEE_REACH_PX;
    const y = animal.y + dy * FLEE_REACH_PX;
    if (
        body !== 0 &&
        bodies.bodyAt(cellAt(x), cellAt(y)) === body &&
        bodies.swimmable(cellAt(x), cellAt(y), minDepth)
    ) {
        animal.targetX = x;
        animal.targetY = y;
        return;
    }
    let best: { x: number; y: number; far: number } | undefined;
    for (let draw = 0; draw < FLEE_DRAWS; draw++) {
        const cell = bodies.randomCell(body, { cellX, cellY }, WANDER_REACH_CELLS, minDepth, random);
        if (!cell) break;
        const middleX = cell.cellX * TERRAIN_CELL + TERRAIN_CELL / 2;
        const middleY = cell.cellY * TERRAIN_CELL + TERRAIN_CELL / 2;
        const distanceToThreat = Math.hypot(middleX - threat.x, middleY - threat.y);
        if (!best || distanceToThreat > best.far) best = { x: middleX, y: middleY, far: distanceToThreat };
    }
    if (best) {
        animal.targetX = best.x;
        animal.targetY = best.y;
    }
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

function newDolphin(
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
        kind: "dolphin",
        sex,
        x,
        y,
        bornAt: now,
        lifespanMs: settings.dolphinMaxLifespan * 1000 * (SHORTEST_LIFE_SHARE + (1 - SHORTEST_LIFE_SHARE) * random()),
        readyAt: now + settings.huntInterval * 1000,
        ateAt: now,
    };
}

/** The first fish of the bodies big enough, and their dolphins. */
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
    const dolphinChance = dtMs / (settings.dolphinReproductionDelay * 1000);
    const firstDolphins = !population.dolphinsSeeded;
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
        // Dolphins come as a couple into deep water that has none: at once the first time, later after about one of
        // their breeding delays (a water whose dolphins starved is not refilled at once).
        if (
            size.deep >= MIN_DOLPHIN_DEEP_CELLS &&
            !dolphinIn.has(body) &&
            dolphins + 2 <= MAX_DOLPHINS &&
            population.animals.length + 2 <= MAX_ANIMALS &&
            (firstDolphins || random() < dolphinChance)
        ) {
            for (const sex of ["male", "female"] as const) {
                const cell = bodies.anyCell(body, DOLPHIN_DEPTH_PX, random);
                if (!cell) continue;
                dolphins++;
                population.animals.push(
                    newDolphin(population, sex, middle(cell.cellX), middle(cell.cellY), now, settings, random),
                );
                population.dolphinsSeeded = true;
            }
        }
    }
}
