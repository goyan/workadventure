import type { Season } from "@workadventure/map-editor";

/**
 * The units and the seasons the terrain is drawn with, copied here so that the worker that paints its blocks loads
 * neither the map editor library (zod and every schema) nor the game: a test keeps them equal to the originals.
 */

/** Pixels of the map across a cell of the relief. */
export const TERRAIN_CELL = 16;
/** Cells across a chunk of the relief. */
export const TERRAIN_CHUNK = 16;
/** Pixels of the map across a tile. */
export const TILE_PX = 32;
/** From this depth of water (px) one swims; shallower, one wades. */
export const SWIM_DEPTH_PX = 16;

export const SPRING = "spring" as Season;
export const SUMMER = "summer" as Season;
export const AUTUMN = "autumn" as Season;
export const WINTER = "winter" as Season;
