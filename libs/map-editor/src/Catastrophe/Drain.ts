import { TILE_PX } from "../types";

/** The radius of a drain, in tiles: what a player chooses, from a plughole to a maelstrom. */
export const DRAIN_MIN_TILES = 1;
export const DRAIN_MAX_TILES = 16;
export const DRAIN_DEFAULT_TILES = 3;
/**
 * Pixels of water a drain takes each second from a cell in its middle, and from one at its rim: it pulls harder
 * where it turns, so that the water falls into it.
 */
export const DRAIN_PX_PER_SECOND = 256;
export const DRAIN_RIM_PX_PER_SECOND = 128;
/** How long a drain goes on after the last message of its player, in milliseconds: it follows a held click. */
export const DRAIN_LASTS_MS = 1000;
/** How many drains can be open at once in a room. */
export const DRAINS_PER_ROOM = 8;
/** The current carries no avatar within this many times the radius of an open drain: a drain is for the water. */
export const DRAIN_CALM_REACH = 1.5;

/** A drain open on a map: it empties the disc around a point (map pixels), `radiusTiles` wide. */
export interface Drain {
    id: number;
    x: number;
    y: number;
    radiusTiles: number;
}

/**
 * The radius of a drain of that size: one out of range is the nearest; a size that is not a number, or none (what a
 * browser of before sends), is the usual one.
 */
export function drainTiles(radiusTiles: number): number {
    if (!Number.isFinite(radiusTiles) || radiusTiles === 0) return DRAIN_DEFAULT_TILES;
    return Math.min(DRAIN_MAX_TILES, Math.max(DRAIN_MIN_TILES, Math.round(radiusTiles)));
}

/** Whether a point of the map (pixels) is where an open drain keeps the current from carrying anyone. */
export function drainCalms(drains: Iterable<Pick<Drain, "x" | "y" | "radiusTiles">>, x: number, y: number): boolean {
    for (const drain of drains) {
        const reach = drain.radiusTiles * TILE_PX * DRAIN_CALM_REACH;
        if ((x - drain.x) ** 2 + (y - drain.y) ** 2 <= reach * reach) return true;
    }
    return false;
}
