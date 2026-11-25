import { TERRAIN_CELL } from "../types";
import { ZOMBIE_PX_PER_METRE, ZOMBIE_SOLID, ZOMBIE_STEP_MS } from "./ZombieHorde";
import { zombieGroundBlocks } from "./ZombieGrenade";
import type { ZombieGrenadeGround } from "./ZombieGrenade";

/**
 * A dart of the Nerf shot into a horde of zombies: it flies straight from the barrel, as far as a dart flies, and the
 * first zombie it meets on its way is killed. It stops there; a wall, a collision of the map or the edge of the map
 * stops it before. Its flight is a pure function of where it was shot from and to, of the step it was shot at and of
 * where the zombies were at each step of its flight: the server and every browser kill the same zombie at the same step.
 *
 * - A dart flies NERF_DART_SPEED_PX_S, NERF_DART_RANGE_PX at most, as the Nerf of the players shoots it (NerfProtocol):
 *   ZOMBIE_DART_TICKS steps of the horde at the speed of reality. On a map sped up, the steps of the horde are closer:
 *   a tick of its flight takes `stride` steps (the speed of the map when it was shot, whole), so that it flies as fast
 *   to the eye as everywhere.
 * - At each tick, the part of its way it covers then is checked against the bodies of the zombies walking at that
 *   step, as they are drawn (a box on their feet, ZOMBIE_DART_BODY_PX high): the one it enters first is hit.
 * - The log of the horde applies it once its flight is over (and after the step every browser could have it by): the
 *   zombie hit is killed then, laid where the dart met it, a little further along the dart. Until then its browser
 *   draws it falling already (ZombieCrowd.dartsSeen), from the step it was hit at.
 *
 * Computed with + - * / and Math.sqrt only, over whole numbers told by the server and positions kept in half pixels:
 * the same in every engine.
 */

const PX = ZOMBIE_PX_PER_METRE;
/** The range and the speed of a dart of the Nerf (map pixels): 12 tiles, 10 tiles a second. */
export const NERF_DART_RANGE_PX = 384;
export const NERF_DART_SPEED_PX_S = 320;
/** The ticks of the flight of a dart over its whole range: 12, a step of the horde each at the speed of reality. */
export const ZOMBIE_DART_TICKS = Math.round(((NERF_DART_RANGE_PX / NERF_DART_SPEED_PX_S) * 1000) / ZOMBIE_STEP_MS);
/** A map sped up the most (hurricaneTimesOf): a tick of the flight of a dart takes this many steps of the horde. */
export const ZOMBIE_DART_MOST_STRIDE = 10;
/**
 * How many steps back the crowd remembers where its zombies were: what a dart applied by the log needs to be met by
 * them as they were when it flew. A dart waits for the later of the end of its flight (120 steps at most) and the step
 * the log is complete to (25 steps ahead at the speed of reality, 250 on a map sped up ten times), from a shot up to
 * half a second late: some 300 steps at most. A constant, so that every crowd remembers the same; a dart that would
 * need more is refused by the server.
 */
export const ZOMBIE_DART_HISTORY_STEPS = 400;
/** A zombie hit lies this many steps (3 s of the horde) from when it was hit: it recoils, falls, lies, and is gone. */
export const ZOMBIE_DART_FALL_STEPS = 30;
/** It recoils this far along the dart, over this many steps. */
export const ZOMBIE_DART_RECOIL_PX = 0.3 * PX;
export const ZOMBIE_DART_RECOIL_STEPS = 3;
/**
 * The body of a zombie as a dart meets it, as it is drawn (ZombieView: about as tall as an avatar): this wide on each
 * side of its feet, this high above them. A dart flies at the height of a hand: it meets the body it crosses on screen.
 */
export const ZOMBIE_DART_HALF_WIDTH_PX = 0.25 * PX;
export const ZOMBIE_DART_BODY_PX = 28;
/** Where a dart goes is checked against the ground every this many pixels: under a cell, no wall is jumped over. */
const SAMPLE_PX = 4;

/** A dart as the log of the horde tells it: from where, to where (its range), the step shot at, the steps of a tick. */
export interface ZombieDart {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    shotStep: number;
    stride: number;
}

/** Where a dart met a zombie: which, at which step, where the zombie was (map pixels), how far along the dart. */
export interface ZombieDartHit {
    zombie: number;
    step: number;
    x: number;
    y: number;
    distance: number;
}

/**
 * Whether the log may apply a dart at the step `applyStep`: a tick of a whole number of steps, shot at a step of the
 * horde, its flight over, and not so long ago that the crowd forgot where its zombies were then. Not, it is nothing.
 */
export function zombieDartFits(dart: Pick<ZombieDart, "shotStep" | "stride">, applyStep: number): boolean {
    return (
        Number.isInteger(dart.stride) &&
        dart.stride >= 1 &&
        dart.stride <= ZOMBIE_DART_MOST_STRIDE &&
        Number.isInteger(dart.shotStep) &&
        dart.shotStep >= 0 &&
        zombieDartFlightEnd(dart) <= applyStep &&
        applyStep - dart.shotStep < ZOMBIE_DART_HISTORY_STEPS
    );
}

/** The steps a tick of the flight of a dart takes on a map whose steps last `msPerStep` ms: its speed, whole. */
export function zombieDartStride(msPerStep: number): number {
    if (!Number.isFinite(msPerStep) || msPerStep <= 0) return 1;
    return Math.min(ZOMBIE_DART_MOST_STRIDE, Math.max(1, Math.round(ZOMBIE_STEP_MS / msPerStep)));
}

/** The step the flight of a dart is over at: the log applies it at that step or after. */
export function zombieDartFlightEnd(dart: Pick<ZombieDart, "shotStep" | "stride">): number {
    return dart.shotStep + ZOMBIE_DART_TICKS * dart.stride;
}

/**
 * A dart shot from a point towards another, in whole map pixels: its end where its range ends, on the line through
 * the point aimed at. Undefined when both points are the same.
 */
export function zombieDartAim(shot: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}): { fromX: number; fromY: number; toX: number; toY: number } | undefined {
    const fromX = Math.round(shot.fromX);
    const fromY = Math.round(shot.fromY);
    const dx = shot.toX - fromX;
    const dy = shot.toY - fromY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!(distance >= 1)) return undefined;
    return {
        fromX,
        fromY,
        toX: Math.round(fromX + (dx / distance) * NERF_DART_RANGE_PX),
        toY: Math.round(fromY + (dy / distance) * NERF_DART_RANGE_PX),
    };
}

/**
 * Whether a dart is told as zombieDartAim makes it: whole pixels, its end at the range of the Nerf (within the half
 * pixels its ends were rounded by). The server takes it so, as it was sent: the browsers find it in the log as they
 * shot or saw it.
 */
export function zombieDartAimed(dart: Pick<ZombieDart, "fromX" | "fromY" | "toX" | "toY">): boolean {
    if (![dart.fromX, dart.fromY, dart.toX, dart.toY].every(Number.isInteger)) return false;
    const dx = dart.toX - dart.fromX;
    const dy = dart.toY - dart.fromY;
    const length = Math.sqrt(dx * dx + dy * dy);
    return length >= NERF_DART_RANGE_PX - 1 && length <= NERF_DART_RANGE_PX + 1;
}

/** The way of a dart: its unit vector and its length, the range of the Nerf at most. */
export function zombieDartWay(dart: Pick<ZombieDart, "fromX" | "fromY" | "toX" | "toY">): {
    ux: number;
    uy: number;
    length: number;
} {
    const dx = dart.toX - dart.fromX;
    const dy = dart.toY - dart.fromY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!(distance > 0)) return { ux: 0, uy: 0, length: 0 };
    return { ux: dx / distance, uy: dy / distance, length: Math.min(NERF_DART_RANGE_PX, distance) };
}

/**
 * How far a dart flies before a wall, a collision of the map (it flies at the height of a hand) or the edge of the
 * map: its length at most. 0 when it is shot from off the map or from within a collision.
 */
export function zombieDartReach(
    dart: Pick<ZombieDart, "fromX" | "fromY" | "toX" | "toY">,
    ground: ZombieGrenadeGround,
): number {
    const { ux, uy, length } = zombieDartWay(dart);
    const cellOf = (px: number, py: number): number => {
        const cellX = Math.floor(px / TERRAIN_CELL);
        const cellY = Math.floor(py / TERRAIN_CELL);
        if (cellX < 0 || cellY < 0 || cellX >= ground.width || cellY >= ground.height) return -1;
        return cellY * ground.width + cellX;
    };
    let cell = cellOf(dart.fromX, dart.fromY);
    if (cell < 0 || (ground.terrain[cell] & ZOMBIE_SOLID) !== 0) return 0;
    let reached = 0;
    for (let along = SAMPLE_PX; reached < length; along += SAMPLE_PX) {
        const at = Math.min(length, along);
        const next = cellOf(dart.fromX + ux * at, dart.fromY + uy * at);
        if (next < 0 || (next !== cell && zombieGroundBlocks(ground, cell, next))) return reached;
        cell = next;
        reached = at;
    }
    return reached;
}

/**
 * Where along a segment from (ax, ay) to (bx, by) it enters the body of a zombie whose feet are at (zx, zy): a share
 * of the segment from 0 to 1, or -1 when it misses it.
 */
export function zombieDartEnters(ax: number, ay: number, bx: number, by: number, zx: number, zy: number): number {
    let enter = 0;
    let leave = 1;
    const dx = bx - ax;
    const dy = by - ay;
    const left = zx - ZOMBIE_DART_HALF_WIDTH_PX;
    const right = zx + ZOMBIE_DART_HALF_WIDTH_PX;
    const top = zy - ZOMBIE_DART_BODY_PX;
    if (dx === 0) {
        if (ax < left || ax > right) return -1;
    } else {
        let near = (left - ax) / dx;
        let far = (right - ax) / dx;
        if (near > far) {
            const swap = near;
            near = far;
            far = swap;
        }
        if (near > enter) enter = near;
        if (far < leave) leave = far;
    }
    if (dy === 0) {
        if (ay < top || ay > zy) return -1;
    } else {
        let near = (top - ay) / dy;
        let far = (zy - ay) / dy;
        if (near > far) {
            const swap = near;
            near = far;
            far = swap;
        }
        if (near > enter) enter = near;
        if (far < leave) leave = far;
    }
    return enter <= leave ? enter : -1;
}
