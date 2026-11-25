import { zombieGrenadeAhead } from "@workadventure/map-editor";
import type { ZombieGrenadeShot } from "@workadventure/map-editor";

/**
 * The grenade a player shoots: from the ground under its avatar (x, groundY), ZOMBIE_GRENADE_AHEAD_M ahead the way
 * it looks, as the Nerf fires (Character.getNerfHeading): the way it moves, diagonals included, or the way it faces
 * once stopped. `heading` in eighths of a turn: 0 south, 2 west, 4 north, 6 east (VehicleFrames).
 */
export function zombieGrenadeShotOf(x: number, groundY: number, heading: number): ZombieGrenadeShot {
    const dx = Math.round(-Math.sin((heading * Math.PI) / 4));
    const dy = Math.round(Math.cos((heading * Math.PI) / 4));
    return zombieGrenadeAhead(x, groundY, dx, dy);
}
