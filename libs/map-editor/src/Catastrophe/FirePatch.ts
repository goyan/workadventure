/** The radius of a patch of fire a player sets under their pointer, in tiles. */
export const FIRE_MIN_TILES = 1;
export const FIRE_MAX_TILES = 8;
export const FIRE_DEFAULT_TILES = 2;
/** A player sets this many patches of fire a second at most. */
export const FIRE_PATCHES_PER_SECOND = 5;

/** The size of a patch within what it may be; the usual one for a size that is not a number. */
export function fireTiles(radiusTiles: number): number {
    return Number.isFinite(radiusTiles)
        ? Math.min(FIRE_MAX_TILES, Math.max(FIRE_MIN_TILES, Math.round(radiusTiles)))
        : FIRE_DEFAULT_TILES;
}
