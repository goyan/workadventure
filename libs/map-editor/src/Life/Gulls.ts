import { TERRAIN_CELL } from "../types";
import type { Animal } from "./Animal";
import type { LifeTally, Population, SpeciesTally } from "./Population";
import { SPECIES } from "./Species";
import type { SpeciesId } from "./Species";
import { cellAt } from "./Swim";
import { FISH_DEPTH_PX } from "./WaterBodies";
import type { Places, WaterBodies } from "./WaterBodies";

/** Gulls come over a body of water once this many fish live in it. */
export const GULL_NEEDS_FISH = 15;
/** A gull that has just landed does not watch around it for this long: when a lion may catch it. */
export const GULL_SETTLE_MS = 3000;
/** Landed and settled, it takes off from an avatar this close (three tiles), and from a lion this close (two). */
export const GULL_AVATAR_PX = 96;
export const GULL_LION_PX = 64;
/** Frightened off its shore, it stays in the air this long before it lands again. */
const GULL_WARY_MS = 10_000;
/** A fish is caught, a shore is reached, a mate is joined within this distance, in map pixels. */
const REACH_PX = TERRAIN_CELL;
/** It circles this many cells around the middle of its water at most. */
const CIRCLE_CELLS = 8;
/** It flies around at this share of its fastest. */
const GLIDE_SHARE = 0.4;

/** What the gulls read from the step of the life they are part of (see stepPopulation). */
export interface GullContext {
    population: Population;
    bodies: WaterBodies;
    /** The outdoor land, for its shores; undefined on a map whose size is not known: the gulls never land. */
    land: Places | undefined;
    now: number;
    dtMs: number;
    random: () => number;
    /** The avatars on the ground, in map pixels. */
    threats: readonly { x: number; y: number }[];
    /** The speed of the map, in map pixels a second. */
    maxSpeed: number;
    times: { breedDelayMs: number; huntIntervalMs: number };
    lionHuntIntervalMs: number;
    /** How many gulls a body of water holds; 0 for one too small. */
    capOf: (body: number) => number;
    make: (sex: "male" | "female", x: number, y: number) => Animal;
    of: (species: SpeciesId) => SpeciesTally;
    tally: LifeTally;
}

const far = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (cell: number): number => cell * TERRAIN_CELL + TERRAIN_CELL / 2;
const landed = (gull: Animal): boolean => gull.perchedAt !== undefined;

/** Flies straight towards a point: nothing stops a gull. True once there. */
function fly(gull: Animal, x: number, y: number, speed: number, dtMs: number): boolean {
    const left = Math.hypot(x - gull.x, y - gull.y);
    const step = (speed * dtMs) / 1000;
    if (left <= step) {
        gull.x = x;
        gull.y = y;
        return true;
    }
    gull.x += ((x - gull.x) / left) * step;
    gull.y += ((y - gull.y) / left) * step;
    return false;
}

/**
 * The gulls of a room for one step: they live in the air, over a body of water that is their home. Hungry, a gull
 * flies to the nearest fish of that water and takes it; fed, it lands on a shore and waits there, where a hungry
 * lion beside it catches it before it has settled. A fed couple landed together has young. They die of age and of
 * hunger. Nothing here stops them: no wall, no depth.
 */
export function stepGulls(context: GullContext): void {
    const { population, bodies, land, now, dtMs, random, threats, maxSpeed, times, of, tally } = context;
    const gulls = population.animals.filter((animal) => animal.kind === "gull");
    if (gulls.length === 0) return;
    const species = SPECIES.gull;
    const fast = maxSpeed * species.speedFactor;
    const gone = new Set<Animal>();
    let gullsGone = 0;
    const born: Animal[] = [];
    const lions = population.animals.filter((animal) => animal.kind === "lion" && animal.tamedBy === undefined);
    const homeBody = (gull: Animal): number =>
        gull.homeX === undefined || gull.homeY === undefined
            ? 0
            : bodies.bodyAt(cellAt(gull.homeX), cellAt(gull.homeY));
    const fishOf = new Map<number, Animal[]>();
    const fishIn = (body: number): Animal[] => {
        let list = fishOf.get(body);
        if (!list) {
            list = population.animals.filter(
                (animal) => animal.kind === "fish" && bodies.bodyAt(cellAt(animal.x), cellAt(animal.y)) === body,
            );
            fishOf.set(body, list);
        }
        return list;
    };
    const canBreed = (gull: Animal): boolean =>
        landed(gull) && !gone.has(gull) && now >= (gull.mateAt ?? 0) && (gull.meals ?? 0) >= species.mealsForYoung;
    const circle = (gull: Animal): void => {
        const reached =
            gull.targetX !== undefined &&
            gull.targetY !== undefined &&
            far(gull, { x: gull.targetX, y: gull.targetY }) < 1;
        if (gull.targetX === undefined || gull.targetY === undefined || reached) {
            const around = { x: gull.homeX ?? gull.x, y: gull.homeY ?? gull.y };
            gull.targetX = around.x + (random() * 2 - 1) * CIRCLE_CELLS * TERRAIN_CELL;
            gull.targetY = around.y + (random() * 2 - 1) * CIRCLE_CELLS * TERRAIN_CELL;
        }
        fly(gull, gull.targetX, gull.targetY, fast * GLIDE_SHARE, dtMs);
    };
    const takeOff = (gull: Animal, wary: boolean): void => {
        gull.perchedAt = undefined;
        gull.targetX = gull.targetY = undefined;
        if (wary) gull.wanderUntil = now + GULL_WARY_MS;
    };

    for (const gull of gulls) {
        const old = now - gull.bornAt >= gull.lifespanMs;
        const starved =
            species.starveHunts !== undefined &&
            now - (gull.ateAt ?? gull.bornAt) >= species.starveHunts * times.huntIntervalMs;
        if (old || starved) {
            gone.add(gull);
            gullsGone++;
            if (old) of("gull").diedOfAge++;
            else of("gull").starved++;
            tally.predatorDeaths++;
            continue;
        }
        let body = homeBody(gull);
        if (body === 0 || context.capOf(body) === 0) {
            // Its water is gone: another one of the map, if there is any.
            const others: number[] = [];
            for (let other = 1; other < bodies.sizes.length; other++) if (context.capOf(other) > 0) others.push(other);
            const next =
                others.length > 0 ? others[Math.min(others.length - 1, Math.floor(random() * others.length))] : 0;
            const cell = next === 0 ? undefined : bodies.anyCell(next, FISH_DEPTH_PX, random);
            gull.homeX = cell ? middle(cell.cellX) : undefined;
            gull.homeY = cell ? middle(cell.cellY) : undefined;
            body = cell ? next : 0;
            if (landed(gull)) takeOff(gull, false);
        }
        const hungry = now >= gull.readyAt;
        if (gull.perchedAt !== undefined) {
            const hunter = lions.find((lion) => now >= lion.readyAt && far(lion, gull) < REACH_PX);
            if (hunter) {
                gone.add(gull);
                gullsGone++;
                of("gull").eaten++;
                tally.eaten++;
                const meals = of("lion").meals;
                meals.gull = (meals.gull ?? 0) + 1;
                hunter.ateAt = now;
                hunter.meals = (hunter.meals ?? 0) + 1;
                hunter.huntSince = undefined;
                hunter.readyAt = now + context.lionHuntIntervalMs;
                continue;
            }
            const settled = now - gull.perchedAt >= GULL_SETTLE_MS;
            const scared =
                settled &&
                (threats.some((threat) => far(threat, gull) < GULL_AVATAR_PX) ||
                    lions.some((lion) => far(lion, gull) < GULL_LION_PX));
            if (scared) {
                takeOff(gull, true);
                continue;
            }
            if (hungry || land?.atShore?.(cellAt(gull.x), cellAt(gull.y)) !== true) {
                takeOff(gull, false);
                continue;
            }
            if (gull.sex !== "male" || !canBreed(gull)) continue;
            const mate = gulls.find(
                (other) => other.sex === "female" && canBreed(other) && far(other, gull) <= 2 * REACH_PX,
            );
            if (!mate) continue;
            const inBody = gulls.filter((other) => !gone.has(other) && homeBody(other) === body).length + born.length;
            const room = Math.min(
                context.capOf(body) - inBody,
                species.roomCap - (gulls.length - gullsGone) - born.length,
            );
            const [smallest, largest] = species.litter;
            const litter = Math.min(room, smallest + Math.floor(random() * (largest - smallest + 1)));
            for (let index = 0; index < litter; index++) {
                born.push({
                    ...context.make(random() < 0.5 ? "male" : "female", gull.x, gull.y),
                    homeX: gull.homeX,
                    homeY: gull.homeY,
                    mateAt: now + times.breedDelayMs,
                });
            }
            if (litter > 0) {
                of("gull").births += litter;
                tally.predatorBirths += litter;
            }
            // With or without young (a full water), both wait a whole delay again.
            gull.mateAt = mate.mateAt = now + times.breedDelayMs;
            gull.meals = mate.meals = 0;
            continue;
        }
        if (hungry) {
            let prey: Animal | undefined;
            for (const fish of body === 0 ? [] : fishIn(body)) {
                if (!gone.has(fish) && (!prey || far(fish, gull) < far(prey, gull))) prey = fish;
            }
            if (!prey) {
                circle(gull);
                continue;
            }
            fly(gull, prey.x, prey.y, fast, dtMs);
            if (far(prey, gull) < REACH_PX) {
                gone.add(prey);
                tally.eaten++;
                of("fish").eaten++;
                const meals = of("gull").meals;
                meals.fish = (meals.fish ?? 0) + 1;
                gull.ateAt = now;
                gull.meals = (gull.meals ?? 0) + 1;
                gull.readyAt = now + times.huntIntervalMs;
                gull.targetX = gull.targetY = undefined;
            }
            continue;
        }
        if ((gull.wanderUntil ?? 0) > now) {
            circle(gull);
            continue;
        }
        // Fed: to its mate when both may have young, else to the nearest shore.
        const ready = now >= (gull.mateAt ?? 0) && (gull.meals ?? 0) >= species.mealsForYoung;
        const mate =
            ready && gull.sex === "male"
                ? gulls.find((other) => other.sex === "female" && canBreed(other) && homeBody(other) === body)
                : undefined;
        const shore = mate ? undefined : land?.shoreNear?.(-1, cellAt(gull.x), cellAt(gull.y), 1);
        const perch = mate
            ? { x: mate.x, y: mate.y }
            : shore
              ? { x: middle(shore.cellX), y: middle(shore.cellY) }
              : undefined;
        if (!perch) {
            circle(gull);
            continue;
        }
        if (fly(gull, perch.x, perch.y, fast * GLIDE_SHARE, dtMs)) {
            gull.perchedAt = now;
            gull.targetX = gull.targetY = undefined;
        }
    }
    if (gone.size > 0 || born.length > 0) {
        population.animals = population.animals.filter((animal) => !gone.has(animal)).concat(born);
    }
}

/**
 * The gulls that come by themselves: a couple over each body of water big enough that has none and holds enough
 * fish, at once the first time, later after about a breeding delay.
 */
export function spawnGulls(context: GullContext): void {
    const { population, bodies, random, dtMs, times } = context;
    const first = population.gullsSeeded !== true;
    const chance = dtMs / times.breedDelayMs;
    const gullsOf = new Map<number, number>();
    const fishOf = new Map<number, number>();
    let gulls = 0;
    for (const animal of population.animals) {
        if (animal.kind === "fish") {
            const body = bodies.bodyAt(cellAt(animal.x), cellAt(animal.y));
            fishOf.set(body, (fishOf.get(body) ?? 0) + 1);
        } else if (animal.kind === "gull") {
            gulls++;
            if (animal.homeX === undefined || animal.homeY === undefined) continue;
            const body = bodies.bodyAt(cellAt(animal.homeX), cellAt(animal.homeY));
            gullsOf.set(body, (gullsOf.get(body) ?? 0) + 1);
        }
    }
    for (let body = 1; body < bodies.sizes.length; body++) {
        if (context.capOf(body) < 2 || (gullsOf.get(body) ?? 0) > 0) continue;
        if ((fishOf.get(body) ?? 0) < GULL_NEEDS_FISH || gulls + 2 > SPECIES.gull.roomCap) continue;
        if (!first && random() >= chance) continue;
        const home = bodies.anyCell(body, FISH_DEPTH_PX, random);
        if (!home) continue;
        for (const sex of ["male", "female"] as const) {
            const cell = bodies.anyCell(body, FISH_DEPTH_PX, random) ?? home;
            population.animals.push({
                ...context.make(sex, middle(cell.cellX), middle(cell.cellY)),
                homeX: middle(home.cellX),
                homeY: middle(home.cellY),
            });
            gulls++;
        }
        population.gullsSeeded = true;
    }
}
