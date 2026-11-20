import { TILE_PX } from "../types";

/** The side of the square a drain empties, in tiles: always the same, around the tile under the pointer. */
export const DRAIN_SIDE_TILES = 5;
/** Pixels of water a drain takes from each cell under it, each second: sixteen times what a downpour brings. */
export const DRAIN_PX_PER_SECOND = 64;
/** How long a drain goes on after the last message of its player, in milliseconds: it follows a held click. */
export const DRAIN_LASTS_MS = 1000;
/** How many drains can be open at once in a room. */
export const DRAINS_PER_ROOM = 8;

/** A drain open on a map: it empties the square around a point (map pixels). */
export interface Drain {
    id: number;
    x: number;
    y: number;
}

/** The square a drain at that point empties, in map pixels: whole tiles, the tile of the point in its middle. */
export function drainSquare(x: number, y: number): { left: number; top: number; side: number } {
    const around = (DRAIN_SIDE_TILES - 1) / 2;
    return {
        left: (Math.floor(x / TILE_PX) - around) * TILE_PX,
        top: (Math.floor(y / TILE_PX) - around) * TILE_PX,
        side: DRAIN_SIDE_TILES * TILE_PX,
    };
}
