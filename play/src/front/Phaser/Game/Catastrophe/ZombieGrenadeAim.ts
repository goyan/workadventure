import { zombieGrenadeAhead } from "@workadventure/map-editor";
import type { ZombieGrenadeShot } from "@workadventure/map-editor";

/**
 * The grenade a player shoots: from the ground under its avatar (x, groundY), ZOMBIE_GRENADE_AHEAD_M ahead the way
 * it looks, as the Nerf fires (Character.getNerfHeading): the way it moves, diagonals included, or the way it faces
 * once stopped. `heading` in eighths of a turn: 0 south, 2 west, 4 north, 6 east (VehicleFrames). Facing an edge of
 * the map (`map`, its size in pixels), not as far: the server takes no point off the map.
 */
export function zombieGrenadeShotOf(
    x: number,
    groundY: number,
    heading: number,
    map?: { width: number; height: number },
): ZombieGrenadeShot {
    const dx = Math.round(-Math.sin((heading * Math.PI) / 4));
    const dy = Math.round(Math.cos((heading * Math.PI) / 4));
    const shot = zombieGrenadeAhead(x, groundY, dx, dy);
    if (!map) return shot;
    const along = (from: number, to: number, size: number): number =>
        to > size - 1 ? (size - 1 - from) / (to - from) : to < 0 ? -from / (to - from) : 1;
    const share = Math.max(
        0,
        Math.min(along(shot.fromX, shot.toX, map.width), along(shot.fromY, shot.toY, map.height)),
    );
    if (share >= 1) return shot;
    return {
        ...shot,
        toX: Math.round(shot.fromX + (shot.toX - shot.fromX) * share),
        toY: Math.round(shot.fromY + (shot.toY - shot.fromY) * share),
    };
}
