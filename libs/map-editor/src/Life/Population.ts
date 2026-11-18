import type { WaterGrid } from "../Terrain/WaterGrid";
import { DEFAULT_LAND_LIFE_SETTINGS, TERRAIN_CELL } from "../types";
import type { LifeSettings } from "../types";
import type { Animal } from "./Animal";
import { MAX_ANIMALS, MAX_ANTELOPES, MAX_DOLPHINS, MAX_LAND_ANIMALS } from "./LifeConstants";
import { cellAt, levelOf, swim, WANDER_REACH_CELLS } from "./Swim";
import { isPredator, SPECIES, SPECIES_IDS } from "./Species";
import type { Species, SpeciesId } from "./Species";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX } from "./WaterBodies";
import type { Places, WaterBodies } from "./WaterBodies";

export { DOLPHIN_SPEED_FACTOR, MAX_ANIMALS, MAX_DOLPHINS, MEALS_FOR_CALF, STARVE_HUNTS } from "./LifeConstants";

/** The life is stepped twice a second. */
export const LIFE_STEP_MS = 500;
/** The smallest body of water that gets fish, in cells. */
export const MIN_BODY_CELLS = 40;
/** A body gets a dolphin with this many cells deep enough for it. */
export const MIN_DOLPHIN_DEEP_CELLS = 300;
/** Dolphins come into a body once this many fish live in it: they would starve, or empty it, before. */
export const FISH_PER_DOLPHIN_COUPLE = 30;
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
/** A hunter aims this far beyond a prey that runs from it, in map pixels. */
const CHASE_LEAD_PX = 3 * TERRAIN_CELL;
/** A mate or a prey is reached within this distance, in map pixels. */
const REACH_PX = TERRAIN_CELL;
/** After failing to go straight to a mate or a prey, an animal wanders this long before it tries again. */
const DETOUR_MS = 3000;
/** A tile is 32 map pixels: speeds are set in tiles a second. */
const TILE_PX = 32;
/** A fish lives between this share of the longest life and the longest life, so that a litter does not die at once. */
const SHORTEST_LIFE_SHARE = 0.7;

export interface Population {
    animals: Animal[];
    nextId: number;
    /** Whether the room ever got fish: the first ones come at once, later ones after about a breeding delay. */
    seeded: boolean;
    /** The same for the dolphins. */
    dolphinsSeeded?: boolean;
    /** The same for the antelopes of the land. */
    landSeeded?: boolean;
}

/** What happened to the animals of one species during a step (or summed over many). */
export interface SpeciesTally {
    /** Those that came by themselves into an empty place. */
    arrivals: number;
    births: number;
    diedOfAge: number;
    eaten: number;
    /** Dead of hunger. */
    starved: number;
    /** Left without water. */
    diedDry: number;
    /** What it ate, by species of prey. */
    meals: Partial<Record<SpeciesId, number>>;
}
/** What happened species by species (and what each ate): `stepPopulation` adds to it. */
export type SpeciesTallies = Partial<Record<SpeciesId, SpeciesTally>>;
export const emptySpeciesTally = (): SpeciesTally => ({
    arrivals: 0,
    births: 0,
    diedOfAge: 0,
    eaten: 0,
    starved: 0,
    diedDry: 0,
    meals: {},
});

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

type BodySize = Places["sizes"][number];

/** The smallest piece of outdoor land that gets antelopes, in cells (200 tiles), and the cells it takes for one. */
export const MIN_LAND_CELLS = 800;
export const CELLS_PER_ANTELOPE = 160;
/** A piece of land gets lions and tigers once this many antelopes live on it; it holds a predator for as many. */
export const ANTELOPES_PER_PREDATOR = 5;
const antelopeCapOf = (cells: number): number => Math.max(2, Math.floor(cells / CELLS_PER_ANTELOPE));
/** Lions and tigers share the land: each species gets half of what the antelopes can feed. */
const landPredatorCapOf = (cells: number): number =>
    Math.max(2, Math.floor(Math.min(antelopeCapOf(cells), MAX_ANTELOPES) / ANTELOPES_PER_PREDATOR / 2));
const landPredatorTimes = (settings: LifeSettings): SpeciesTimes => ({
    breedDelayMs:
        (settings.landPredatorReproductionDelay ?? DEFAULT_LAND_LIFE_SETTINGS.landPredatorReproductionDelay) * 1000,
    maxLifespanMs: (settings.landPredatorMaxLifespan ?? DEFAULT_LAND_LIFE_SETTINGS.landPredatorMaxLifespan) * 1000,
    huntIntervalMs: (settings.landHuntInterval ?? DEFAULT_LAND_LIFE_SETTINGS.landHuntInterval) * 1000,
});

/** What the settings of the map say of a species, in milliseconds. */
interface SpeciesTimes {
    breedDelayMs: number;
    maxLifespanMs: number;
    huntIntervalMs: number;
}

/**
 * What is not in the table of the species because it reads the places and the settings of the map: every species
 * must say it here.
 */
const PLACES: Record<
    SpeciesId,
    {
        /** How many of them a body of their places holds. */
        cap: (size: BodySize) => number;
        /** Whether a body is big enough for them to come into it. */
        habitable: (size: BodySize) => boolean;
        times: (settings: LifeSettings) => SpeciesTimes;
    }
> = {
    fish: {
        cap: (size) => fishCapOf(size.cells),
        habitable: (size) => size.cells >= MIN_BODY_CELLS,
        times: (settings) => ({
            breedDelayMs: settings.reproductionDelay * 1000,
            maxLifespanMs: settings.maxLifespan * 1000,
            huntIntervalMs: settings.huntInterval * 1000,
        }),
    },
    dolphin: {
        cap: (size) => dolphinCapOf(size.deep),
        habitable: (size) => size.deep >= MIN_DOLPHIN_DEEP_CELLS,
        times: (settings) => ({
            breedDelayMs: settings.dolphinReproductionDelay * 1000,
            maxLifespanMs: settings.dolphinMaxLifespan * 1000,
            huntIntervalMs: settings.huntInterval * 1000,
        }),
    },
    antelope: {
        cap: (size) => antelopeCapOf(size.cells),
        habitable: (size) => size.cells >= MIN_LAND_CELLS,
        times: (settings) => ({
            breedDelayMs:
                (settings.antelopeReproductionDelay ?? DEFAULT_LAND_LIFE_SETTINGS.antelopeReproductionDelay) * 1000,
            maxLifespanMs: (settings.antelopeMaxLifespan ?? DEFAULT_LAND_LIFE_SETTINGS.antelopeMaxLifespan) * 1000,
            huntIntervalMs: 0,
        }),
    },
    lion: {
        cap: (size) => landPredatorCapOf(size.cells),
        habitable: (size) => size.cells >= MIN_LAND_CELLS,
        times: landPredatorTimes,
    },
    tiger: {
        cap: (size) => landPredatorCapOf(size.cells),
        habitable: (size) => size.cells >= MIN_LAND_CELLS,
        times: landPredatorTimes,
    },
};
const placeCapOf = (species: SpeciesId, size: BodySize): number => PLACES[species].cap(size);
const habitable = (species: SpeciesId, size: BodySize): boolean => PLACES[species].habitable(size);
const timesOf = (species: SpeciesId, settings: LifeSettings): SpeciesTimes => PLACES[species].times(settings);

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

/** How many of a species live in a room, and how many its places can hold. */
export interface SpeciesCensus {
    species: SpeciesId;
    males: number;
    females: number;
    cap: number;
}

/** The species that live in the room or have room to: in the order of the table. */
export function speciesCensus(population: Population, bodies: WaterBodies, land?: Places): SpeciesCensus[] {
    const census: SpeciesCensus[] = [];
    for (const species of SPECIES_IDS) {
        let males = 0;
        let females = 0;
        for (const animal of population.animals) {
            if (animal.kind !== species) continue;
            if (animal.sex === "female") females++;
            else males++;
        }
        let cap = 0;
        const sizes = (SPECIES[species].habitat === "land" ? land : bodies)?.sizes ?? [];
        for (let body = 1; body < sizes.length; body++) {
            if (habitable(species, sizes[body])) cap += placeCapOf(species, sizes[body]);
        }
        cap = Math.min(cap, SPECIES[species].roomCap);
        if (males + females > 0 || cap > 0) census.push({ species, males, females, cap });
    }
    return census;
}

export const emptyPopulation = (): Population => ({ animals: [], nextId: 1, seeded: false });

const bodyOf = (animal: Animal, bodies: Places): number => bodies.bodyAt(cellAt(animal.x), cellAt(animal.y));
const distance = (a: Animal, b: Animal): number => Math.hypot(a.x - b.x, a.y - b.y);

function nearest(from: Animal, candidates: readonly Animal[]): Animal | undefined {
    let best: Animal | undefined;
    for (const candidate of candidates) {
        if (!best || distance(from, candidate) < distance(from, best)) best = candidate;
    }
    return best;
}

/**
 * One step of the life of a room: the old and the starved die, the predators hunt, each species breeds, everyone
 * swims (those left without water die), and the places big enough get their first animals. What a species is (what
 * it eats, where it lives, how fast it goes) is read in the table of the species. The same inputs (random included)
 * give the same life: the server alone runs it.
 *
 * The animals fear the avatars: `threats` are where the avatars stand, in map pixels. An animal near one swims away
 * at its fastest, and neither mates nor hunts meanwhile.
 *
 * It returns what happened in the room, and adds to `bySpecies` what happened to each species.
 *
 * `land` is the outdoor land of the map, for the species that walk: without it they stay as they are, untouched. A
 * predator hunts in its own places: a lion takes a fish where it can wade, never where one swims.
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
    bySpecies: SpeciesTallies = {},
    land?: Places,
): LifeTally {
    const tally = emptyLifeTally();
    const of = (species: SpeciesId): SpeciesTally => (bySpecies[species] ??= emptySpeciesTally());
    const maxSpeed = settings.maxSpeed * TILE_PX;
    const placesOf = (species: SpeciesId): Places | undefined => (SPECIES[species].habitat === "land" ? land : bodies);
    /** The places of an animal that has some (see `animals`). */
    const where = (animal: Animal): Places => placesOf(animal.kind) ?? bodies;
    // The animals whose places are not given are left as they are.
    const idle = population.animals.filter((animal) => placesOf(animal.kind) === undefined);
    const animals =
        idle.length === 0 ? population.animals : population.animals.filter((animal) => !idle.includes(animal));
    const dead = new Set<Animal>();
    for (const animal of animals) {
        const species = SPECIES[animal.kind];
        const times = timesOf(animal.kind, settings);
        // A predator kept from before predators had a sex.
        if (isPredator(species)) animal.sex ??= random() < 0.5 ? "male" : "female";
        const old = now - animal.bornAt >= animal.lifespanMs;
        const starved =
            species.starveHunts !== undefined &&
            now - (animal.ateAt ?? animal.bornAt) >= species.starveHunts * times.huntIntervalMs;
        if (!old && !starved) continue;
        dead.add(animal);
        if (old) of(animal.kind).diedOfAge++;
        else of(animal.kind).starved++;
        if (isPredator(species)) tally.predatorDeaths++;
        else tally.diedOfAge++;
    }

    // Who is frightened, and by which avatar (the nearest one).
    const frightened = new Map<Animal, { x: number; y: number }>();
    if (threats.length > 0) {
        for (const animal of animals) {
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
    // A prey also runs from the predators it knows, when one comes close: the nearest of all wins.
    const hunters = animals.filter((animal) => isPredator(SPECIES[animal.kind]) && !dead.has(animal));
    if (hunters.length > 0) {
        for (const animal of animals) {
            const species = SPECIES[animal.kind];
            if (species.flees.length === 0 || dead.has(animal)) continue;
            const avatar = frightened.get(animal);
            let least = avatar ? Math.hypot(animal.x - avatar.x, animal.y - avatar.y) : species.fleeRadiusPx;
            for (const hunter of hunters) {
                if (!species.flees.includes(hunter.kind)) continue;
                const far = distance(animal, hunter);
                if (far < least) {
                    least = far;
                    frightened.set(animal, hunter);
                }
            }
        }
    }

    // Who lives in which body, species by species, to look for a mate or a prey among neighbours only.
    const living = new Map<SpeciesId, Map<number, Animal[]>>();
    const count = new Map<SpeciesId, number>();
    for (const species of SPECIES_IDS) {
        living.set(species, new Map());
        count.set(species, 0);
    }
    for (const animal of animals) {
        if (dead.has(animal)) continue;
        count.set(animal.kind, (count.get(animal.kind) ?? 0) + 1);
        const byBody = living.get(animal.kind);
        if (!byBody) continue;
        const body = bodyOf(animal, where(animal));
        const list = byBody.get(body);
        if (list) list.push(animal);
        else byBody.set(body, [animal]);
    }
    const pursuing = new Set<Animal>();
    const pursue = (animal: Animal, target: Animal, speed: number): void => {
        animal.targetX = target.x;
        animal.targetY = target.y;
        animal.speed = speed;
        pursuing.add(animal);
    };
    const detouring = (animal: Animal): boolean => (animal.wanderUntil ?? 0) > now;
    const predators = SPECIES_IDS.map((id) => SPECIES[id]).filter(isPredator);
    const preys = SPECIES_IDS.map((id) => SPECIES[id]).filter((species) => !isPredator(species));

    for (const species of predators) {
        const { huntIntervalMs } = timesOf(species.id, settings);
        for (const hunter of animals) {
            if (hunter.kind !== species.id || dead.has(hunter) || now < hunter.readyAt) continue;
            if (frightened.has(hunter)) continue;
            hunter.huntSince ??= now;
            if (now - hunter.huntSince >= HUNT_GIVE_UP_MS) {
                hunter.huntSince = undefined;
                hunter.readyAt = now + huntIntervalMs;
                continue;
            }
            if (detouring(hunter)) continue;
            const places = where(hunter);
            const level = levelOf(hunter);
            const body = bodyOf(hunter, places);
            // Where the hunter cannot go is a refuge: a prey is one only in the hunter's own body, where it can be.
            const prey =
                body === 0
                    ? undefined
                    : nearest(
                          hunter,
                          animals.filter(
                              (other) =>
                                  species.prey.includes(other.kind) &&
                                  !dead.has(other) &&
                                  bodyOf(other, places) === body &&
                                  places.passable(cellAt(other.x), cellAt(other.y), level),
                          ),
                      );
            if (!prey) continue;
            if (distance(hunter, prey) < REACH_PX) {
                dead.add(prey);
                tally.eaten++;
                count.set(prey.kind, (count.get(prey.kind) ?? 1) - 1);
                of(prey.kind).eaten++;
                const meals = of(species.id).meals;
                meals[prey.kind] = (meals[prey.kind] ?? 0) + 1;
                hunter.ateAt = now;
                hunter.meals = (hunter.meals ?? 0) + 1;
                hunter.huntSince = undefined;
                hunter.readyAt = now + huntIntervalMs;
                hunter.targetX = hunter.targetY = undefined;
            } else {
                pursue(hunter, prey, maxSpeed * species.speedFactor);
                // A prey that runs from its hunter is no longer where it was: the hunter runs on past that point.
                if (SPECIES[prey.kind].flees.includes(species.id)) {
                    const far = distance(hunter, prey);
                    hunter.targetX = prey.x + ((prey.x - hunter.x) / far) * CHASE_LEAD_PX;
                    hunter.targetY = prey.y + ((prey.y - hunter.y) / far) * CHASE_LEAD_PX;
                }
            }
        }
    }

    const born: Animal[] = [];
    // How many animals of each habitat live, the newborn included: the water and the land have each their room.
    const inHabitat = { water: 0, land: 0, air: 0 };
    for (const animal of animals) if (!dead.has(animal)) inHabitat[SPECIES[animal.kind].habitat]++;
    const total = (habitat: Species["habitat"]): number => inHabitat[habitat];
    const roomOf = (habitat: Species["habitat"]): number => (habitat === "land" ? MAX_LAND_ANIMALS : MAX_ANIMALS);
    const litterOf = (species: Species): number => {
        const [smallest, largest] = species.litter;
        return smallest === largest ? smallest : smallest + Math.floor(random() * (largest - smallest + 1));
    };

    // The predators breed: a fed male goes to a fed female of its body, while their place has room for a young.
    for (const species of predators) {
        const { breedDelayMs } = timesOf(species.id, settings);
        const canBreed = (animal: Animal): boolean =>
            !dead.has(animal) && now >= (animal.mateAt ?? 0) && (animal.meals ?? 0) >= species.mealsForYoung;
        let ofSpecies = count.get(species.id) ?? 0;
        const sizes = placesOf(species.id)?.sizes ?? [];
        const room = roomOf(species.habitat);
        for (const [body, list] of living.get(species.id) ?? []) {
            if (body === 0) continue;
            const cap = placeCapOf(species.id, sizes[body]);
            let inBody = list.filter((animal) => !dead.has(animal)).length;
            for (const male of list) {
                // A predator on a hunt does not court.
                if (male.sex !== "male" || !canBreed(male) || pursuing.has(male) || detouring(male)) continue;
                if (frightened.has(male)) continue;
                if (inBody >= cap || ofSpecies >= species.roomCap) break;
                if (total(species.habitat) >= room) break;
                const female = nearest(
                    male,
                    list.filter((other) => other.sex === "female" && canBreed(other) && !frightened.has(other)),
                );
                if (!female) continue;
                if (distance(male, female) >= REACH_PX) {
                    pursue(male, female, maxSpeed);
                    continue;
                }
                const litter = Math.min(
                    litterOf(species),
                    cap - inBody,
                    species.roomCap - ofSpecies,
                    room - total(species.habitat),
                );
                for (let index = 0; index < litter; index++) {
                    inHabitat[species.habitat]++;
                    born.push({
                        ...newAnimal(
                            population,
                            species.id,
                            random() < 0.5 ? "male" : "female",
                            female.x,
                            female.y,
                            now,
                            settings,
                            random,
                        ),
                        mateAt: now + breedDelayMs,
                    });
                }
                inBody += litter;
                ofSpecies += litter;
                tally.predatorBirths += litter;
                of(species.id).births += litter;
                male.mateAt = female.mateAt = now + breedDelayMs;
                male.meals = female.meals = 0;
                male.targetX = male.targetY = undefined;
            }
        }
    }

    // The prey breed: a male that is ready goes to a female that is, while their place has room for young.
    for (const species of preys) {
        const { breedDelayMs } = timesOf(species.id, settings);
        let ofSpecies = count.get(species.id) ?? 0;
        const sizes = placesOf(species.id)?.sizes ?? [];
        const room = roomOf(species.habitat);
        for (const [body, list] of living.get(species.id) ?? []) {
            if (body === 0) continue;
            const cap = placeCapOf(species.id, sizes[body]);
            let inBody = list.filter((animal) => !dead.has(animal)).length;
            for (const male of list) {
                if (male.sex !== "male" || dead.has(male) || now < male.readyAt || detouring(male)) continue;
                if (frightened.has(male)) continue;
                const female = nearest(
                    male,
                    list.filter(
                        (other) =>
                            other.sex === "female" &&
                            !dead.has(other) &&
                            now >= other.readyAt &&
                            !frightened.has(other),
                    ),
                );
                if (!female) continue;
                if (distance(male, female) >= REACH_PX) {
                    pursue(male, female, maxSpeed);
                    continue;
                }
                const litter = Math.max(
                    0,
                    Math.min(
                        litterOf(species),
                        cap - inBody,
                        species.roomCap - ofSpecies,
                        room - total(species.habitat),
                    ),
                );
                for (let index = 0; index < litter; index++) {
                    inHabitat[species.habitat]++;
                    born.push(
                        newAnimal(
                            population,
                            species.id,
                            random() < 0.5 ? "male" : "female",
                            female.x,
                            female.y,
                            now,
                            settings,
                            random,
                        ),
                    );
                }
                inBody += litter;
                ofSpecies += litter;
                tally.births += litter;
                of(species.id).births += litter;
                // With or without young (a full body), both wait a whole delay again; so do the young.
                male.readyAt = female.readyAt = now + breedDelayMs;
                for (const young of born.slice(born.length - litter)) young.readyAt = now + breedDelayMs;
                male.targetX = male.targetY = undefined;
            }
        }
    }

    for (const [animal, threat] of frightened) {
        flee(animal, threat, where(animal), maxSpeed, random);
    }
    for (const animal of animals) {
        if (dead.has(animal)) continue;
        if (!swim(animal, where(animal), grid, maxSpeed, dtMs, now, random)) {
            dead.add(animal);
            tally.diedDry++;
            of(animal.kind).diedDry++;
        } else if (pursuing.has(animal) && animal.targetX === undefined) {
            // Stopped on its straight way to its mate or its prey: it goes round by wandering a while.
            animal.wanderUntil = now + DETOUR_MS;
        }
    }
    population.animals = idle.concat(animals.filter((animal) => !dead.has(animal))).concat(born);

    const before = population.animals.length;
    if (settings.enabled) spawn(population, bodies, settings, dtMs, now, random);
    if (land && settings.landEnabled === true) spawnOnLand(population, land, settings, dtMs, now, random);
    tally.arrivals = population.animals.length - before;
    for (const arrived of population.animals.slice(before)) of(arrived.kind).arrivals++;
    return tally;
}

/**
 * Gives a frightened animal somewhere to swim to, away from the avatar: straight away when the water allows, else
 * the cell of its water furthest from the avatar among a few around it.
 */
function flee(
    animal: Animal,
    threat: { x: number; y: number },
    bodies: Places,
    maxSpeed: number,
    random: () => number,
): void {
    const minDepth = levelOf(animal);
    const cellX = cellAt(animal.x);
    const cellY = cellAt(animal.y);
    const body = bodies.bodyAt(cellX, cellY);
    animal.speed = maxSpeed * SPECIES[animal.kind].speedFactor;
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
    if (body !== 0 && bodies.bodyAt(cellAt(x), cellAt(y)) === body && bodies.passable(cellAt(x), cellAt(y), minDepth)) {
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

/** A newborn, or an animal that comes by itself: a predator has just eaten, and waits before its first hunt. */
function newAnimal(
    population: Population,
    species: SpeciesId,
    sex: "male" | "female",
    x: number,
    y: number,
    now: number,
    settings: LifeSettings,
    random: () => number,
): Animal {
    const times = timesOf(species, settings);
    const animal: Animal = {
        id: population.nextId++,
        kind: species,
        sex,
        x,
        y,
        bornAt: now,
        lifespanMs: times.maxLifespanMs * (SHORTEST_LIFE_SHARE + (1 - SHORTEST_LIFE_SHARE) * random()),
        readyAt: now,
    };
    if (isPredator(SPECIES[species])) {
        animal.readyAt = now + times.huntIntervalMs;
        animal.ateAt = now;
    }
    return animal;
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
    const fishCount = new Map<number, number>();
    let dolphins = 0;
    let inWater = 0;
    for (const animal of population.animals) {
        if (SPECIES[animal.kind].habitat !== "water") continue;
        inWater++;
        const body = bodyOf(animal, bodies);
        if (animal.kind === "fish") {
            fishIn.add(body);
            fishCount.set(body, (fishCount.get(body) ?? 0) + 1);
        } else {
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
            inWater + 2 <= MAX_ANIMALS &&
            (first || random() < chance)
        ) {
            for (const sex of ["male", "female"] as const) {
                const cell = bodies.anyCell(body, FISH_DEPTH_PX, random);
                if (!cell) continue;
                population.animals.push(
                    newAnimal(population, "fish", sex, middle(cell.cellX), middle(cell.cellY), now, settings, random),
                );
                inWater++;
                population.seeded = true;
            }
        }
        // Dolphins come as a couple into deep water that has none: at once the first time, later after about one of
        // their breeding delays (a water whose dolphins starved is not refilled at once).
        if (
            size.deep >= MIN_DOLPHIN_DEEP_CELLS &&
            !dolphinIn.has(body) &&
            (fishCount.get(body) ?? 0) >= FISH_PER_DOLPHIN_COUPLE &&
            dolphins + 2 <= MAX_DOLPHINS &&
            inWater + 2 <= MAX_ANIMALS &&
            (firstDolphins || random() < dolphinChance)
        ) {
            for (const sex of ["male", "female"] as const) {
                const cell = bodies.anyCell(body, DOLPHIN_DEPTH_PX, random);
                if (!cell) continue;
                dolphins++;
                inWater++;
                population.animals.push(
                    newAnimal(
                        population,
                        "dolphin",
                        sex,
                        middle(cell.cellX),
                        middle(cell.cellY),
                        now,
                        settings,
                        random,
                    ),
                );
                population.dolphinsSeeded = true;
            }
        }
    }
}

/**
 * The first animals of the pieces of outdoor land big enough: a couple of antelopes on a land that has none (at once
 * the first time, later after about a breeding delay), and a couple of lions and one of tigers once enough
 * antelopes live there to feed them.
 */
function spawnOnLand(
    population: Population,
    land: Places,
    settings: LifeSettings,
    dtMs: number,
    now: number,
    random: () => number,
): void {
    const inBody = new Map<SpeciesId, Map<number, number>>();
    const ofSpecies = new Map<SpeciesId, number>();
    let onLand = 0;
    for (const animal of population.animals) {
        if (SPECIES[animal.kind].habitat !== "land") continue;
        onLand++;
        ofSpecies.set(animal.kind, (ofSpecies.get(animal.kind) ?? 0) + 1);
        const body = bodyOf(animal, land);
        const counts = inBody.get(animal.kind) ?? new Map<number, number>();
        counts.set(body, (counts.get(body) ?? 0) + 1);
        inBody.set(animal.kind, counts);
    }
    const living = (species: SpeciesId, body: number): number => inBody.get(species)?.get(body) ?? 0;
    const middle = (cell: number): number => cell * TERRAIN_CELL + TERRAIN_CELL / 2;
    const couple = (species: SpeciesId, body: number): boolean => {
        let came = false;
        for (const sex of ["male", "female"] as const) {
            const cell = land.anyCell(body, levelOf({ kind: species } as Animal), random);
            if (!cell) continue;
            population.animals.push(
                newAnimal(population, species, sex, middle(cell.cellX), middle(cell.cellY), now, settings, random),
            );
            onLand++;
            came = true;
        }
        return came;
    };
    const first = !population.landSeeded;
    const chance = dtMs / PLACES.antelope.times(settings).breedDelayMs;
    const predatorChance = dtMs / landPredatorTimes(settings).breedDelayMs;
    for (let body = 1; body < land.sizes.length; body++) {
        if (!habitable("antelope", land.sizes[body])) continue;
        if (
            living("antelope", body) === 0 &&
            (ofSpecies.get("antelope") ?? 0) + 2 <= SPECIES.antelope.roomCap &&
            onLand + 2 <= MAX_LAND_ANIMALS &&
            (first || random() < chance)
        ) {
            if (couple("antelope", body)) population.landSeeded = true;
        }
        for (const species of ["lion", "tiger"] as const) {
            if (
                living("antelope", body) >= ANTELOPES_PER_PREDATOR &&
                living(species, body) === 0 &&
                (ofSpecies.get(species) ?? 0) + 2 <= SPECIES[species].roomCap &&
                onLand + 2 <= MAX_LAND_ANIMALS &&
                random() < predatorChance
            ) {
                couple(species, body);
            }
        }
    }
}
