import { TERRAIN_CELL } from "../types";
import {
    ZOMBIE_EAST,
    ZOMBIE_PX_PER_METRE,
    ZOMBIE_SOLID,
    ZOMBIE_SOUTH,
    ZOMBIE_STEP_MS,
    ZOMBIE_WATER,
} from "./ZombieHorde";

/**
 * A grenade of the grenade launcher a player holds while a horde of zombies crosses the map: lobbed at a point, it
 * flies, bounces, rolls, and goes off when its fuse has burnt. Its whole path is a pure function of where it was shot
 * from and to, and of the ground the horde froze: the server and every browser compute the same, so that the room is
 * told only who shot where, and when it goes off.
 *
 * - A time fuse, as a hand grenade's: 4 s (the fuse of the M67 burns 4 to 5.5 s, US Army FM 3-23.30). The launcher
 *   lobs it at 35° above the ground, as fast as reaching the point aimed at asks (in a vacuum: v² = g d / sin 2θ), no
 *   further than ZOMBIE_GRENADE_RANGE_M.
 * - It falls under gravity, bounces off the ground keeping 30 % of its speed downwards and 60 % along it (a can of
 *   400 g on grass, a choice of the order of measured restitutions of 0.2 to 0.5), then rolls, braked by the grass
 *   (a rolling resistance of 0.4 g, a choice). A wall or a collision of the map under 2.5 m sends it back, half as
 *   fast; it sinks where it falls into water.
 * - It goes off with the effects of the M67: zombies within 5 m are killed, those within 15 m wounded (its radii of
 *   fatality and of casualties, FM 3-23.30); the blast throws them, the more the nearer.
 *
 * Computed with + - * / and Math.sqrt only, in steps of 20 ms: the same in every engine.
 */

const PX = ZOMBIE_PX_PER_METRE;
const G_PX = 9.81 * PX;
/** The launch above the ground: 35°, its sine and cosine written out (no engine computes them its own way). */
const LAUNCH_SIN = 0.573576436351046;
const LAUNCH_COS = 0.8191520442889918;
/** sin(2 × 35°). */
const LAUNCH_SIN_TWICE = 0.9396926207859084;
/** The fuse, in steps of the horde (100 ms of reality each): 4 s. */
export const ZOMBIE_GRENADE_FUSE_STEPS = 40;
export const ZOMBIE_GRENADE_RANGE_M = 45;
export const ZOMBIE_GRENADE_LETHAL_M = 5;
export const ZOMBIE_GRENADE_BLAST_M = 15;
/** Where the grenade leaves the launcher, over the ground (m). */
const MUZZLE_HEIGHT_PX = 1.2 * PX;
/** Under this height a wall or a collision stops it. */
const WALL_HEIGHT_PX = 2.5 * PX;
const BOUNCE_DOWN = 0.3;
const BOUNCE_ALONG = 0.6;
const ROLL_BRAKE_PX = 0.4 * G_PX;
/** The steps of its path within a step of the horde. */
const SUBSTEPS = 5;
const DT = ZOMBIE_STEP_MS / 1000 / SUBSTEPS;

/** A grenade as the room is told of it: from where, to where. */
export interface ZombieGrenadeShot {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

/** Where the grenade is at each step of the horde from its shot to its blast (map pixels; z its height). */
export interface ZombieGrenadePath {
    x: Float64Array;
    y: Float64Array;
    z: Float64Array;
}

/** What a grenade flies over: the ground the horde froze. */
export interface ZombieGrenadeGround {
    width: number;
    height: number;
    terrain: Uint8Array;
}

/** The point a player aims at, brought within the range of the launcher. */
export function zombieGrenadeAim(shot: ZombieGrenadeShot): ZombieGrenadeShot {
    const dx = shot.toX - shot.fromX;
    const dy = shot.toY - shot.fromY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const most = ZOMBIE_GRENADE_RANGE_M * PX;
    if (distance <= most) return shot;
    return { ...shot, toX: shot.fromX + (dx / distance) * most, toY: shot.fromY + (dy / distance) * most };
}

/** The whole path of a grenade, ZOMBIE_GRENADE_FUSE_STEPS + 1 points: the last is where it goes off. */
export function zombieGrenadePath(shot: ZombieGrenadeShot, ground: ZombieGrenadeGround): ZombieGrenadePath {
    const aimed = zombieGrenadeAim(shot);
    const dx = aimed.toX - aimed.fromX;
    const dy = aimed.toY - aimed.fromY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const ux = distance > 1e-6 ? dx / distance : 0;
    const uy = distance > 1e-6 ? dy / distance : 0;
    const speed = Math.sqrt((G_PX * distance) / LAUNCH_SIN_TWICE);
    let x = aimed.fromX;
    let y = aimed.fromY;
    let z = MUZZLE_HEIGHT_PX;
    let vx = ux * speed * LAUNCH_COS;
    let vy = uy * speed * LAUNCH_COS;
    let vz = speed * LAUNCH_SIN;
    let rolling = false;
    let sunk = false;
    const steps = ZOMBIE_GRENADE_FUSE_STEPS;
    const path: ZombieGrenadePath = {
        x: new Float64Array(steps + 1),
        y: new Float64Array(steps + 1),
        z: new Float64Array(steps + 1),
    };
    const cellOf = (px: number, py: number): number => {
        const cellX = Math.floor(px / TERRAIN_CELL);
        const cellY = Math.floor(py / TERRAIN_CELL);
        if (cellX < 0 || cellY < 0 || cellX >= ground.width || cellY >= ground.height) return -1;
        return cellY * ground.width + cellX;
    };
    path.x[0] = x;
    path.y[0] = y;
    path.z[0] = z;
    for (let step = 1; step <= steps; step++) {
        for (let sub = 0; sub < SUBSTEPS && !sunk; sub++) {
            if (rolling) {
                const along = Math.sqrt(vx * vx + vy * vy);
                const slowed = Math.max(0, along - ROLL_BRAKE_PX * DT);
                if (along > 1e-9) {
                    vx = (vx / along) * slowed;
                    vy = (vy / along) * slowed;
                }
            } else {
                vz -= G_PX * DT;
            }
            const from = cellOf(x, y);
            let nextX = x + vx * DT;
            let nextY = y + vy * DT;
            const toX = cellOf(nextX, y);
            // A wall or a collision under its height sends it back, half as fast; off the map, it stops at the edge.
            if (toX < 0) {
                nextX = x;
                vx = -vx * 0.5;
            } else if (from >= 0 && toX !== from && z < WALL_HEIGHT_PX && zombieGroundBlocks(ground, from, toX)) {
                nextX = x;
                vx = -vx * 0.5;
            }
            const fromY = cellOf(nextX, y);
            const toY = cellOf(nextX, nextY);
            if (toY < 0) {
                nextY = y;
                vy = -vy * 0.5;
            } else if (fromY >= 0 && toY !== fromY && z < WALL_HEIGHT_PX && zombieGroundBlocks(ground, fromY, toY)) {
                nextY = y;
                vy = -vy * 0.5;
            }
            x = nextX;
            y = nextY;
            if (!rolling) {
                z += vz * DT;
                if (z <= 0) {
                    z = 0;
                    const here = cellOf(x, y);
                    if (here >= 0 && (ground.terrain[here] & ZOMBIE_WATER) !== 0) {
                        sunk = true;
                        vx = 0;
                        vy = 0;
                        vz = 0;
                    } else if (-vz * BOUNCE_DOWN < 1 * PX) {
                        rolling = true;
                        vz = 0;
                        vx *= BOUNCE_ALONG;
                        vy *= BOUNCE_ALONG;
                    } else {
                        vz = -vz * BOUNCE_DOWN;
                        vx *= BOUNCE_ALONG;
                        vy *= BOUNCE_ALONG;
                    }
                }
            } else {
                const here = cellOf(x, y);
                if (here >= 0 && (ground.terrain[here] & ZOMBIE_WATER) !== 0) {
                    sunk = true;
                    vx = 0;
                    vy = 0;
                }
            }
        }
        path.x[step] = x;
        path.y[step] = y;
        path.z[step] = z;
    }
    return path;
}

/** Whether something flying low goes from a cell to the next one (side by side or on a diagonal): walls, collisions. */
export function zombieGroundBlocks(ground: ZombieGrenadeGround, from: number, to: number): boolean {
    const { terrain, width } = ground;
    if ((terrain[to] & ZOMBIE_SOLID) !== 0) return true;
    const fromX = from % width;
    const toX = to % width;
    const fromY = (from - fromX) / width;
    const toY = (to - toX) / width;
    if (toX === fromX + 1 && (terrain[from] & ZOMBIE_EAST) !== 0) return true;
    if (toX === fromX - 1 && (terrain[to] & ZOMBIE_EAST) !== 0) return true;
    if (toY === fromY + 1 && (terrain[from] & ZOMBIE_SOUTH) !== 0) return true;
    if (toY === fromY - 1 && (terrain[to] & ZOMBIE_SOUTH) !== 0) return true;
    return false;
}
