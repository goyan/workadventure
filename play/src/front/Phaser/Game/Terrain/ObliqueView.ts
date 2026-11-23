import { heightAt } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { paddedView, wellInside } from "../Weather/WeatherFrame";
import type { WeatherView } from "../Weather/WeatherFrame";
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

/**
 * How far above or under a pixel of the screen the shaders may read the heights in 3/4: the point seen is up to 128 px
 * away, and its height is read between the centres of two cells.
 */
export const OBLIQUE_REACH_PX = MAX_DROP + 16;

/**
 * The part of the map drawn around the screen: `margin` of the view on each side, as ever; in 3/4 at least twice the
 * reach above and under it, so that a scroll does not ask for a new drawing at once.
 */
export function drawnArea(screen: WeatherView, oblique: boolean, margin: number): WeatherView {
    const drawn = paddedView(screen, margin);
    if (!oblique) return drawn;
    const reach = Math.max(screen.height * margin, 2 * OBLIQUE_REACH_PX);
    return { x: drawn.x, y: screen.y - reach, width: drawn.width, height: screen.height + 2 * reach };
}

/**
 * A drawing this many times larger than the one the view asks for is made again at the size of the view: zoomed back in
 * after the whole map was seen, the ground is no longer painted over the whole map at each change.
 */
const OVERSIZED = 4;

/** The part of `area` inside `bounds`; undefined when they do not meet. */
function within(area: WeatherView, bounds: WeatherView): WeatherView | undefined {
    const x = Math.max(area.x, bounds.x);
    const y = Math.max(area.y, bounds.y);
    const right = Math.min(area.x + area.width, bounds.x + bounds.width);
    const bottom = Math.min(area.y + area.height, bounds.y + bounds.height);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}

/**
 * The part of the map to draw the ground over for this screen: `drawn` while it still covers the screen, else the screen
 * and `margin` of it around (drawnArea). Within `bounds` (the map and a few cells around it), when given: nothing is
 * drawn further, and a side of the drawing on the edge of the bounds covers the screen whatever its slack. A drawing
 * much larger than the screen needs (left by a view zoomed out) is made again smaller.
 */
export function nextDrawnArea(
    drawn: WeatherView | undefined,
    screen: WeatherView,
    oblique: boolean,
    margin: number,
    slack: number,
    bounds?: WeatherView,
): WeatherView {
    const seen = (bounds && within(screen, bounds)) ?? screen;
    const wanted = drawnArea(seen, oblique, margin);
    const area = (bounds && within(wanted, bounds)) ?? wanted;
    if (!drawn || drawn.width * drawn.height > OVERSIZED * area.width * area.height) return area;
    const left = bounds !== undefined && drawn.x <= bounds.x;
    const top = bounds !== undefined && drawn.y <= bounds.y;
    const right = bounds !== undefined && drawn.x + drawn.width >= bounds.x + bounds.width;
    const bottom = bounds !== undefined && drawn.y + drawn.height >= bounds.y + bounds.height;
    const reachY = oblique ? OBLIQUE_REACH_PX : 0;
    const covers =
        (left || seen.x - drawn.x >= seen.width * slack) &&
        (top || seen.y - drawn.y >= Math.max(seen.height * slack, reachY)) &&
        (right || drawn.x + drawn.width - (seen.x + seen.width) >= seen.width * slack) &&
        (bottom || drawn.y + drawn.height - (seen.y + seen.height) >= Math.max(seen.height * slack, reachY)) &&
        // Every side within the drawing, even on the edge of the bounds.
        seen.x >= drawn.x &&
        seen.y >= drawn.y &&
        seen.x + seen.width <= drawn.x + drawn.width &&
        seen.y + seen.height <= drawn.y + drawn.height;
    return covers ? drawn : area;
}

/** Whether what was drawn still covers the screen (`slack` of the view on each side), and in 3/4 what it reads. */
export function stillCovers(drawn: WeatherView, screen: WeatherView, oblique: boolean, slack: number): boolean {
    if (!wellInside(drawn, screen, slack)) return false;
    if (!oblique) return true;
    return (
        screen.y - drawn.y >= OBLIQUE_REACH_PX &&
        drawn.y + drawn.height - (screen.y + screen.height) >= OBLIQUE_REACH_PX
    );
}

/** The rows of cell centres walked at most: from 128 px south of the pixel to 128 px north of it, and one more. */
export const OBLIQUE_STEPS = Math.ceil((MAX_DROP + MAX_RISE) / 16) + 2;
export const OBLIQUE_HALVINGS = 6;

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
    for (let step = 0; step < OBLIQUE_STEPS; step++) {
        const rowNorth = rowOf(surfaceAt(north), north);
        if (rowNorth <= screenY) {
            const stretch = (rowSouth - rowNorth) / Math.max(south - north, 0.001);
            let low = north;
            let high = south;
            for (let halving = 0; halving < OBLIQUE_HALVINGS; halving++) {
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
