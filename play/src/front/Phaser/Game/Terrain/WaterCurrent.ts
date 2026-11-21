import { heightAt, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** What the current is read from: the water of the relief as this browser shows it, and the relief under it. */
export interface CurrentWater {
    depthAt(x: number, y: number, now: number): number;
    relief(): TerrainData | undefined;
    /** The relief the water stands on, its pools dug (TerrainWater.basin); the relief itself when absent. */
    basin?(): TerrainData | undefined;
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
    const current = waterCurrentAt(water, x, y, now);
    if (current.x === 0 && current.y === 0) return NONE;
    const speed = walkSpeed * CURRENT_WALK_SHARE * strength;
    return { x: current.x * speed, y: current.y * speed };
}
