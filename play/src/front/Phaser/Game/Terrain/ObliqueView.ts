import { heightAt } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { MAX_DROP, MAX_RISE, shiftOfHeight } from "./Pixel/ColumnPainter";

/**
 * The relief seen in 3/4 by the shaders of the ground (GroundSplat): which point of the map is seen at a pixel. The
 * rule is the one of ReliefProjection (what is drawn the furthest south hides what is behind it; a surface is drawn
 * higher by half its height). This file is the twin, in TypeScript, of what the shaders do in GLSL: the same steps in
 * the same order, so that it can be tested, and the shaders checked against it.
 */

/** A height is sent to the shaders on two bytes: from -512 px, by thirty-seconds of a pixel (up to 1535 px). */
export const HEIGHT_OFFSET = 512;
export const HEIGHT_SCALE = 32;

/** The two bytes of a height (the ground of a cell, or the surface of its water), the high one first. */
export function encodeHeight(height: number): [high: number, low: number] {
    const value = Math.max(0, Math.min(65535, Math.round((height + HEIGHT_OFFSET) * HEIGHT_SCALE)));
    return [value >> 8, value & 255];
}

/**
 * The height two bytes stand for. They need not be whole: the graphics card blends each byte between two cells, and
 * the height read from the blended bytes is the height blended.
 */
export function decodeHeight(high: number, low: number): number {
    return (high * 256 + low) / HEIGHT_SCALE - HEIGHT_OFFSET;
}

/** The exact height of the ground of each cell of an area (`columns` × `rows` cells from the cell `cellX`, `cellY`). */
export function heightsOver(
    terrain: TerrainData | undefined,
    cellX: number,
    cellY: number,
    columns: number,
    rows: number,
): Float32Array {
    const heights = new Float32Array(columns * rows);
    if (!terrain) return heights;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            heights[row * columns + column] = heightAt(terrain, cellX + column, cellY + row);
        }
    }
    return heights;
}

/**
 * The picture of the heights the shaders read in 3/4: two packs side by side, a pixel a cell, the ground (0) then the
 * surface of what is seen (1: the ground, or the water over it). Where a cell of a pack is in its bytes (its red one).
 */
export function heightTexel(pack: 0 | 1, cell: number, columns: number): number {
    const row = Math.floor(cell / columns);
    return (row * columns * 2 + pack * columns + (cell % columns)) * 4;
}

/** Writes the heights of the cells of an area in a pack of that picture: two bytes each, opaque. */
export function writeHeights(
    data: Uint8ClampedArray,
    pack: 0 | 1,
    heights: ArrayLike<number>,
    columns: number,
    rows: number,
): void {
    for (let cell = 0; cell < columns * rows; cell++) {
        const at = heightTexel(pack, cell, columns);
        const [high, low] = encodeHeight(heights[cell] ?? 0);
        data[at] = high;
        data[at + 1] = low;
        data[at + 2] = 0;
        data[at + 3] = 255;
    }
}

/** The row of the screen (in map pixels) a point of the map is drawn at, given the height of what is seen there. */
export function rowOf(surface: number, y: number): number {
    return y + shiftOfHeight(surface);
}

/** The rows of cell centres walked at most: from 128 px south of the pixel to 128 px north of it, and one more. */
const STEPS = Math.ceil((MAX_DROP + MAX_RISE) / 16) + 2;
const HALVINGS = 6;

/**
 * The point of a column of the map seen at a row of the screen: the southernmost one drawn at that row or above it.
 * `surfaceAt`: the height of what is seen at a point of the column (its ground, or the water over it), straight between
 * the centres of the cells. Walked north from as far south as anything is drawn that high, a row of cell centres at a
 * time (the surface is straight between two of them), then halved between the last two.
 * `stretch`: how many rows of the screen a pixel of the ground takes there: 1 on flat ground, more on a ground that
 * falls to the south (a face).
 */
export function seenPoint(
    surfaceAt: (y: number) => number,
    screenY: number,
    cell: number,
): { y: number; stretch: number } {
    let south = screenY + MAX_RISE;
    let rowSouth = rowOf(surfaceAt(south), south);
    if (rowSouth <= screenY) return { y: south, stretch: 1 };
    // The first row of cell centres north of there.
    let north = (Math.ceil(south / cell - 0.5) - 0.5) * cell;
    for (let step = 0; step < STEPS; step++) {
        const rowNorth = rowOf(surfaceAt(north), north);
        if (rowNorth <= screenY) {
            const stretch = (rowSouth - rowNorth) / Math.max(south - north, 0.001);
            let low = north;
            let high = south;
            for (let halving = 0; halving < HALVINGS; halving++) {
                const middle = (low + high) / 2;
                if (rowOf(surfaceAt(middle), middle) <= screenY) low = middle;
                else high = middle;
            }
            return { y: (low + high) / 2, stretch };
        }
        south = north;
        rowSouth = rowNorth;
        north -= cell;
    }
    return { y: south, stretch: 1 };
}
