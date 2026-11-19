import { cellOf, dugCells, heightAt, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** A piece of a contour line of the relief, in map pixels: an edge between two cells of different levels. */
export interface ContourSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    /** Whether a major level is crossed there: drawn stronger. */
    major: boolean;
}

/**
 * The contour lines of the relief: an edge between two neighbouring cells is on a line when they are not on the same
 * step of `stepPx` of depth (0 to 7 px, 8 to 15 px… for a step of 8). The lines follow the edges of the cells, like
 * everything else of the relief. Shown by the relief tool of the editor only.
 */
export function contourSegments(terrain: TerrainData | undefined, stepPx: number, majorPx: number): ContourSegment[] {
    const segments: ContourSegment[] = [];
    if (!terrain || !(stepPx > 0) || !(majorPx > 0)) return segments;
    const between = (a: number, b: number, x1: number, y1: number, x2: number, y2: number): void => {
        if (Math.floor(-a / stepPx) === Math.floor(-b / stepPx)) return;
        segments.push({ x1, y1, x2, y2, major: Math.floor(-a / majorPx) !== Math.floor(-b / majorPx) });
    };
    for (const [key, height] of dugCells(terrain)) {
        const { x, y } = cellOf(key);
        const left = x * TERRAIN_CELL;
        const top = y * TERRAIN_CELL;
        const right = left + TERRAIN_CELL;
        const bottom = top + TERRAIN_CELL;
        between(height, heightAt(terrain, x + 1, y), right, top, right, bottom);
        between(height, heightAt(terrain, x, y + 1), left, bottom, right, bottom);
        // The west and north edges belong to the neighbour there when it is dug too: drawn once.
        const west = heightAt(terrain, x - 1, y);
        if (west >= 0) between(height, west, left, top, left, bottom);
        const north = heightAt(terrain, x, y - 1);
        if (north >= 0) between(height, north, left, top, right, top);
    }
    return segments;
}
