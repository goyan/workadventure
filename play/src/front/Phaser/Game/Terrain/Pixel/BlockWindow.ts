import { TERRAIN_CHUNK } from "./TerrainUnits";

/** Rows of cells north of a block read to draw it: the highest face of a drop (128 px drawn, 8 cells) reaches it. */
export const NORTH_ROWS = 8;
/** Rows of cells south of a block read to draw it: the highest top of a mount (128 px drawn, 8 cells) rises into it. */
export const SOUTH_ROWS = 8;
/**
 * Columns of cells west of a block read to draw it: the shadow of the highest mount (256 px high, 113 px long, 8 cells)
 * falls south-east into it.
 */
export const SHADOW_CELLS = 8;

/**
 * The cells a block of the relief is drawn from: its own, NORTH_ROWS north of it (the faces of the hollows),
 * SOUTH_ROWS south (the tops of the mounts), SHADOW_CELLS west (the shadows), and one more all around (the heights are
 * interpolated between the centres of the cells). The drawing and every signature of a block read this one window.
 */
export function blockCellWindow(
    blockX: number,
    blockY: number,
): { x: number; y: number; width: number; height: number } {
    return {
        x: blockX * TERRAIN_CHUNK - 1 - SHADOW_CELLS,
        y: blockY * TERRAIN_CHUNK - NORTH_ROWS - 1,
        width: TERRAIN_CHUNK + 2 + SHADOW_CELLS,
        height: TERRAIN_CHUNK + NORTH_ROWS + SOUTH_ROWS + 2,
    };
}

/**
 * Pixels of the map for a point of a block drawn (its texel), given how many pixels of the screen a pixel of the map
 * takes: a point drawn is a third more than a pixel of the screen at most, a block is drawn hardly finer than the screen
 * shows it. Far out, a block costs 4 or 16 times less to draw and to keep, and looks the same.
 */
export function texelFor(screenScale: number): 1 | 2 | 4 {
    return screenScale > 2 / 3 ? 1 : screenScale > 1 / 3 ? 2 : 4;
}

/**
 * The texel a block of the view is first drawn with, whatever the zoom: 16 times cheaper than a sharp one, so the view
 * is filled at once; each block is then drawn again as sharp as the screen shows it.
 */
export const COARSE_TEXEL = 4;
