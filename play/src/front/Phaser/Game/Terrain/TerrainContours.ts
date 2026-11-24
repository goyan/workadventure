import { TERRAIN_CELL, TERRAIN_CHUNK } from "@workadventure/map-editor";
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

type Chunks = TerrainData["chunks"];

const chunkKey = (chunkX: number, chunkY: number): string => `${chunkX},${chunkY}`;

/**
 * The contour lines of the relief: an edge between two neighbouring cells is on a line when they are not on the same
 * step of `stepPx` of depth or of height (0 to 7 px, 8 to 15 px… for a step of 8, under the ground as over it). The lines follow the edges of the cells, like
 * everything else of the relief. Shown by the relief tool of the editor only.
 */
export function contourSegments(terrain: TerrainData | undefined, stepPx: number, majorPx: number): ContourSegment[] {
    if (!terrain || !(stepPx > 0) || !(majorPx > 0)) return [];
    return Object.keys(terrain.chunks).flatMap((key) => chunkContourSegments(terrain.chunks, key, stepPx, majorPx));
}

/**
 * The pieces of contour lines a chunk of the relief draws: the east and south edges of its cells, and the west and
 * north edges of its border when no chunk is there (no line is drawn twice, and a cell of a chunk absent is level
 * ground). They depend on the chunk and on its four neighbours only.
 */
function chunkContourSegments(chunks: Chunks, key: string, stepPx: number, majorPx: number): ContourSegment[] {
    const segments: ContourSegment[] = [];
    const heights = chunks[key];
    if (!heights) return segments;
    const [chunkX, chunkY] = key.split(",").map(Number);
    const east = chunks[chunkKey(chunkX + 1, chunkY)];
    const south = chunks[chunkKey(chunkX, chunkY + 1)];
    const westAbsent = !chunks[chunkKey(chunkX - 1, chunkY)];
    const northAbsent = !chunks[chunkKey(chunkX, chunkY - 1)];
    // The steps are counted away from the ground: a mount has the lines of a hollow of the same size.
    const stepOf = (height: number, px: number): number => Math.sign(height) * Math.floor(Math.abs(height) / px);
    const between = (a: number, b: number, x1: number, y1: number, x2: number, y2: number): void => {
        if (stepOf(a, stepPx) === stepOf(b, stepPx)) return;
        segments.push({ x1, y1, x2, y2, major: stepOf(a, majorPx) !== stepOf(b, majorPx) });
    };
    const last = TERRAIN_CHUNK - 1;
    for (let row = 0; row < TERRAIN_CHUNK; row++) {
        for (let column = 0; column < TERRAIN_CHUNK; column++) {
            const height = heights[row * TERRAIN_CHUNK + column] ?? 0;
            const left = (chunkX * TERRAIN_CHUNK + column) * TERRAIN_CELL;
            const top = (chunkY * TERRAIN_CHUNK + row) * TERRAIN_CELL;
            const right = left + TERRAIN_CELL;
            const bottom = top + TERRAIN_CELL;
            const eastHeight =
                column < last ? (heights[row * TERRAIN_CHUNK + column + 1] ?? 0) : (east?.[row * TERRAIN_CHUNK] ?? 0);
            const southHeight =
                row < last ? (heights[(row + 1) * TERRAIN_CHUNK + column] ?? 0) : (south?.[column] ?? 0);
            between(height, eastHeight, right, top, right, bottom);
            between(height, southHeight, left, bottom, right, bottom);
            if (column === 0 && westAbsent) between(height, 0, left, top, left, bottom);
            if (row === 0 && northAbsent) between(height, 0, left, top, right, top);
        }
    }
    return segments;
}

/**
 * The contour lines of a relief kept chunk by chunk, for a relief edited stroke after stroke: a stroke changes a few
 * chunks of the relief (the others are kept as they were, see withHeights), so only those and their neighbours are
 * worked out again, instead of the whole map (a hundred thousand pieces of lines on a map full of lakes). Any other
 * relief (the map loaded again, a stroke undone, a stroke of someone else) is followed the same way.
 */
export class ContourCache {
    private chunks: Chunks | undefined;
    private readonly byChunk = new Map<string, ContourSegment[]>();
    private computed = 0;

    constructor(
        private readonly stepPx: number,
        private readonly majorPx: number,
    ) {}

    /** Follows this relief; returns the chunks whose lines may have changed. */
    public update(terrain: TerrainData | undefined): Set<string> {
        const next = terrain?.chunks ?? {};
        const touched = new Set<string>();
        if (next === this.chunks) return touched;
        const before = this.chunks ?? {};
        const changed: string[] = [];
        for (const key of Object.keys(next)) if (next[key] !== before[key]) changed.push(key);
        for (const key of Object.keys(before)) if (!(key in next)) changed.push(key);
        for (const key of changed) {
            const [chunkX, chunkY] = key.split(",").map(Number);
            touched.add(key);
            touched.add(chunkKey(chunkX - 1, chunkY));
            touched.add(chunkKey(chunkX + 1, chunkY));
            touched.add(chunkKey(chunkX, chunkY - 1));
            touched.add(chunkKey(chunkX, chunkY + 1));
        }
        for (const key of touched) {
            if (next[key]) {
                this.byChunk.set(key, chunkContourSegments(next, key, this.stepPx, this.majorPx));
                this.computed++;
            } else {
                this.byChunk.delete(key);
            }
        }
        this.chunks = next;
        return touched;
    }

    /** The chunks that hold pieces of lines. */
    public chunkKeys(): Iterable<string> {
        return this.byChunk.keys();
    }

    /** The pieces of lines a chunk draws (none for a chunk absent). */
    public segmentsOf(key: string): readonly ContourSegment[] {
        return this.byChunk.get(key) ?? [];
    }

    /** How many times a chunk was worked out, since this cache was made. */
    public computedChunks(): number {
        return this.computed;
    }
}
