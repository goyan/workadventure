import { TERRAIN_CELL, TILE_PX } from "../types";

/**
 * The scale of the map, shared by the light of the lamps and the water of the relief: a tile is taken for this much
 * floor (about 1.10 m wide).
 */
export const TILE_AREA_M2 = 1.2;

/** Floor under one cell of the relief. */
export const CELL_AREA_M2 = TILE_AREA_M2 * (TERRAIN_CELL / TILE_PX) ** 2;

export const LITRES_PER_M3 = 1000;

/** A height in pixels of altitude, in metres: a tile of altitude is as high as a tile is wide. */
export function metresOf(heightPx: number): number {
    return heightPx === 0 ? 0 : (heightPx / TILE_PX) * Math.sqrt(TILE_AREA_M2);
}

/** The height in pixels of altitude of that many metres: the reverse of metresOf. */
export function heightOfMetres(metres: number): number {
    return metres === 0 ? 0 : (metres / Math.sqrt(TILE_AREA_M2)) * TILE_PX;
}
