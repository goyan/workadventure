import { CELL_METRES, heightAt, metresOf, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** What the current is read from: the water of the relief as this browser shows it, and the relief under it. */
export interface CurrentWater {
    depthAt(x: number, y: number, now: number): number;
    relief(): TerrainData | undefined;
    /** The relief the water stands on, its pools dug (TerrainWater.basin); the relief itself when absent. */
    basin?(): TerrainData | undefined;
    /**
     * How fast the water runs at a point, in cells a second, when the server computes it (the water with inertia):
     * the current is then that speed, not what the slope lets guess. Undefined: the slope is read.
     */
    speedAt?(x: number, y: number): { x: number; y: number } | undefined;
}

export interface CurrentVector {
    x: number;
    y: number;
}

/** Under this depth of water (a quarter of a tile) one walks through it without being carried. */
export const CURRENT_MIN_DEPTH_PX = 8;
/** From this depth on (half a tile: one swims) the current carries fully; between the two, by half. */
export const CURRENT_FULL_DEPTH_PX = 16;
/** The slope of the surface, in pixels a cell, that carries as hard as it can. */
export const CURRENT_FULL_SLOPE = 2;
/** A slope slighter than this is water coming to rest, not a current. */
export const CURRENT_REST_SLOPE = 0.1;

/** The speed of the hardest current at the usual strength, as a share of the walking speed: one walks against it. */
export const CURRENT_WALK_SHARE = 0.25;

/** Ground this much lower than the ground under the water is a drop: the water falls there. */
export const CURRENT_DROP_PX = 8;

/**
 * What knocks someone over in a flood is the depth of the water times its speed. Under the first product (square
 * metres a second) an adult keeps their footing and is not carried; from the second on they are swept along at the
 * speed of the water; in between, by as much. The figures hydraulics uses for the stability of people in floods
 * (low hazard for an adult up to 0.4 to 0.6 m²/s, extreme from 1.2).
 */
export const FOOTING_KEPT_M2_PER_S = 0.4;
export const FOOTING_LOST_M2_PER_S = 1.2;

/**
 * The share of the speed of the water that carries someone standing in `depthPx` pixels of it running at `speed`
 * cells a second: none while they keep their footing, all of it once they lost it.
 */
export function sweptShare(depthPx: number, speed: number): number {
    const product = -metresOf(-depthPx) * speed * CELL_METRES;
    if (!(product > FOOTING_KEPT_M2_PER_S)) return 0;
    return Math.min(1, (product - FOOTING_KEPT_M2_PER_S) / (FOOTING_LOST_M2_PER_S - FOOTING_KEPT_M2_PER_S));
}

/** A water whose speed is known carries as hard as it can from this speed on, in cells a second (the foam). */
export const CURRENT_FULL_SPEED = 3;
/** A water slower than this, in cells a second, is at rest. */
export const CURRENT_REST_SPEED = 0.2;

const NONE: CurrentVector = { x: 0, y: 0 };

/**
 * The current of the water of the relief at a point of the map (map pixels): where the surface of the water (ground
 * and water) goes down around it, as the server makes the water run. Each part is between -1 and 1, the whole never
 * longer than 1: the share of the hardest push. Nothing in still water, in water too shallow to carry, or dry.
 *
 * Dry ground, or ground under a film too thin to carry anyone, is a bank or the edge of a flood, not a slope: one is
 * neither pushed away from a shore nor carried onto it. Where the ground itself drops (a hollow lower than the ground
 * under the water), the water falls, and carries towards it.
 *
 * `shallowest` is the least depth of water that counts: what carries someone by default; less to know which way a
 * shallow stream runs (the foam drawn on it).
 */
export function waterCurrentAt(
    water: CurrentWater | undefined,
    x: number,
    y: number,
    now: number,
    shallowest: number = CURRENT_MIN_DEPTH_PX,
): CurrentVector {
    if (!water) return NONE;
    const depth = water.depthAt(x, y, now);
    if (depth < shallowest) return NONE;
    // The server tells how fast this water runs: that is its current, whatever its surface looks like.
    const known = water.speedAt?.(x, y);
    if (known) {
        const speed = Math.hypot(known.x, known.y);
        if (speed < CURRENT_REST_SPEED) return NONE;
        const carried = depth < CURRENT_FULL_DEPTH_PX ? 0.5 : 1;
        const share = (Math.min(1, speed / CURRENT_FULL_SPEED) * carried) / speed;
        return { x: known.x * share || 0, y: known.y * share || 0 };
    }
    const terrain = water.basin ? water.basin() : water.relief();
    const cellX = Math.floor(x / TERRAIN_CELL);
    const cellY = Math.floor(y / TERRAIN_CELL);
    const groundHere = heightAt(terrain, cellX, cellY);
    const here = groundHere + depth;
    const surface = (awayX: number, awayY: number): number => {
        const ground = heightAt(terrain, cellX + awayX, cellY + awayY);
        const held = water.depthAt((cellX + awayX + 0.5) * TERRAIN_CELL, (cellY + awayY + 0.5) * TERRAIN_CELL, now);
        // Water deep enough to carry someone: its surface.
        if (held >= shallowest) return ground + held;
        // Dry ground, or a film too thin to carry anyone: a bank or the edge of a flood, not a slope, unless the
        // ground itself drops there (the water falls into a hollow).
        return ground < groundHere - CURRENT_DROP_PX ? ground + held : here;
    };
    // The slope over the two cells on each side, so that one cell out of line does not turn the current.
    const slopeX = ((surface(1, 0) - surface(-1, 0)) / 2 + (surface(2, 0) - surface(-2, 0)) / 4) / 2;
    const slopeY = ((surface(0, 1) - surface(0, -1)) / 2 + (surface(0, 2) - surface(0, -2)) / 4) / 2;
    const slope = Math.hypot(slopeX, slopeY);
    if (slope < CURRENT_REST_SLOPE) return NONE;
    const carried = depth < CURRENT_FULL_DEPTH_PX ? 0.5 : 1;
    const share = (Math.min(1, slope / CURRENT_FULL_SLOPE) * carried) / slope;
    // The water runs down the slope.
    return { x: -slopeX * share || 0, y: -slopeY * share || 0 };
}

/**
 * The speed the current gives to an avatar at a point, in pixels a second: the current, times a quarter of the
 * walking speed (a current at its hardest carries four times slower than one walks), times the strength set for the
 * map (0: no current).
 */
export function currentPush(
    water: CurrentWater | undefined,
    x: number,
    y: number,
    now: number,
    strength: number,
    walkSpeed: number,
): CurrentVector {
    if (!Number.isFinite(strength) || strength <= 0) return NONE;
    // A water whose speed the server tells carries at that very speed: all of it who floats (deep enough to
    // swim), and who stands in it by as much as the water takes their footing away (its depth times its speed).
    // A thin sheet that runs fast carries nobody, the wave of a tsunami faster than one walks.
    const known = water?.speedAt?.(x, y);
    if (water && known) {
        const depth = water.depthAt(x, y, now);
        const speed = Math.hypot(known.x, known.y);
        if (depth <= 0 || speed < CURRENT_REST_SPEED) return NONE;
        const share = depth >= CURRENT_FULL_DEPTH_PX ? 1 : sweptShare(depth, speed);
        if (share <= 0) return NONE;
        const carried = share * strength * TERRAIN_CELL;
        return { x: known.x * carried, y: known.y * carried };
    }
    const current = waterCurrentAt(water, x, y, now);
    if (current.x === 0 && current.y === 0) return NONE;
    const speed = walkSpeed * CURRENT_WALK_SHARE * strength;
    return { x: current.x * speed, y: current.y * speed };
}
