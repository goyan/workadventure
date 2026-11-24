/** The radius of a downpour, in tiles: what a player chooses, from a watering can to a storm cell. */
export const DOWNPOUR_MIN_TILES = 1;
export const DOWNPOUR_MAX_TILES = 16;
export const DOWNPOUR_DEFAULT_TILES = 3;
/** How long a downpour goes on after the last message of its player, in milliseconds: it follows a held click. */
export const DOWNPOUR_LASTS_MS = 1000;
/** How often a browser tells where its downpour is while the click is held, in milliseconds. */
export const DOWNPOUR_REPORT_MS = 200;
/** The server ignores the messages of a player that come faster than this, in milliseconds. */
export const DOWNPOUR_MIN_REPORT_MS = 100;
/** Pixels of water a downpour brings to each cell under it, each second. */
export const DOWNPOUR_PX_PER_SECOND = 4;
/** How many downpours can be falling at once in a room. */
export const DOWNPOURS_PER_ROOM = 8;

/** The radius of a downpour of that size; a size that is not a number is the usual one, one out of range the nearest. */
export function downpourTiles(radiusTiles: number): number {
    if (!Number.isFinite(radiusTiles)) return DOWNPOUR_DEFAULT_TILES;
    return Math.min(DOWNPOUR_MAX_TILES, Math.max(DOWNPOUR_MIN_TILES, Math.round(radiusTiles)));
}

/** A downpour falling on a map: over the disc around a point (map pixels), or over the whole map. */
export interface Downpour {
    id: number;
    x: number;
    y: number;
    radiusTiles: number;
    wholeMap: boolean;
}
