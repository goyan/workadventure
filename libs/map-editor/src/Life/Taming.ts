import type { Animal } from "./Animal";
import type { Population } from "./Population";
import { SPECIES } from "./Species";
import { cellAt, levelOf } from "./Swim";
import type { Places } from "./WaterBodies";

/** How many animals of the life a player may have tamed at once. */
export const MAX_TAMED = 5;
/**
 * A player tames an animal this close to their feet, in map pixels: five tiles. The browser offers it within a
 * tile and a half of where it shows the animal, which is where the server had it up to a second ago: an animal at
 * its fastest has gone some three tiles since.
 */
export const TAME_REACH_PX = 160;

/** Why an animal was not tamed. */
export type TameRefusal = "unknown" | "species" | "taken" | "far" | "full";

/**
 * Gives an animal to a player (`master.id` is their user id, their feet at x, y in map pixels). From then on it is
 * out of the life (see stepPopulation) until it is let go. Returns why not, or undefined when it is done.
 */
export function tameAnimal(
    population: Population,
    animalId: number,
    master: { id: number; x: number; y: number },
): TameRefusal | undefined {
    const animal = population.animals.find((one) => one.id === animalId);
    if (!animal) return "unknown";
    if (!SPECIES[animal.kind].tamable) return "species";
    if (animal.tamedBy !== undefined) return "taken";
    if (Math.hypot(animal.x - master.x, animal.y - master.y) > TAME_REACH_PX) return "far";
    if (population.animals.filter((one) => one.tamedBy === master.id).length >= MAX_TAMED) return "full";
    animal.tamedBy = master.id;
    stop(animal);
    return undefined;
}

/** Lets go one animal of a player, or all of them: back into the life where they are. Returns how many. */
export function releaseAnimals(population: Population, userId: number, animalId?: number): number {
    let released = 0;
    for (const animal of population.animals) {
        if (animal.tamedBy !== userId || (animalId !== undefined && animal.id !== animalId)) continue;
        animal.tamedBy = undefined;
        stop(animal);
        released++;
    }
    return released;
}

/**
 * Keeps each tamed animal with its master: where they stand, as long as it is on the ground and somewhere the
 * animal can be (not in a room, nor in water too deep for it); it waits where it last could be otherwise. An animal
 * whose master is gone (`masterAt` knows them no more), or whose places are (the land switched off), is let go.
 * Returns how many were.
 */
export function leadTamed(
    population: Population,
    masterAt: (userId: number) => { x: number; y: number; ground: boolean } | undefined,
    land: Places | undefined,
): number {
    let released = 0;
    for (const animal of population.animals) {
        if (animal.tamedBy === undefined) continue;
        const master = land ? masterAt(animal.tamedBy) : undefined;
        if (!land || !master) {
            animal.tamedBy = undefined;
            stop(animal);
            released++;
            continue;
        }
        if (!master.ground) continue;
        const cellX = cellAt(master.x);
        const cellY = cellAt(master.y);
        if (land.bodyAt(cellX, cellY) === 0 || !land.passable(cellX, cellY, levelOf(animal))) continue;
        animal.x = master.x;
        animal.y = master.y;
    }
    return released;
}

function stop(animal: Animal): void {
    animal.targetX = animal.targetY = undefined;
    animal.huntSince = undefined;
}
