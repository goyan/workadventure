import { zombieMsLeft } from "@workadventure/map-editor";
import type { ZombieHorde } from "@workadventure/map-editor";
import type { ZombieShown } from "../../../Stores/CatastropheStore";

/**
 * The horde as the panel shows it at `epoch` (ms, the time of the server), with `walking` zombies on the map: its time
 * left by the clock of the horde, which a map faster than reality runs faster too. Undefined while there is none.
 */
export function zombieShownOf(
    horde: ZombieHorde | undefined,
    walking: number | undefined,
    epoch: number | undefined,
): ZombieShown | undefined {
    if (!horde || walking === undefined || epoch === undefined) return undefined;
    return {
        count: horde.count,
        durationMs: horde.durationMs,
        startedAt: horde.startedAt,
        heading: horde.heading,
        walking,
        secondsLeft: Math.round(zombieMsLeft(horde, epoch) / 1000),
    };
}

/**
 * How the horde shoves the avatar of this player whose body is at (x, y), px/s: nothing in Basique (as the server
 * reads it, the map editor included: the horde leaves the avatar out of the crowd then), nothing while no horde is
 * drawn, and never into water an avatar would swim in (half a tile ahead at least `deep` deep).
 */
export function zombieShoveOf(
    view: { active(): boolean; shoveAt(x: number, y: number): { x: number; y: number } } | undefined,
    basic: boolean,
    x: number,
    y: number,
    depthAt: (x: number, y: number) => number,
    deep: number,
): { x: number; y: number } | undefined {
    if (!view?.active() || basic) return undefined;
    const shove = view.shoveAt(x, y);
    if (shove.x === 0 && shove.y === 0) return undefined;
    const length = Math.sqrt(shove.x * shove.x + shove.y * shove.y);
    if (depthAt(x + (shove.x / length) * 16, y + (shove.y / length) * 16) >= deep) return undefined;
    return shove;
}
