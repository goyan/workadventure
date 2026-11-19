import { TERRAIN_CHUNK, TERRAIN_MIN_HEIGHT } from "../types";
import type { TerrainData } from "../types";

const CHUNK_CELLS = TERRAIN_CHUNK * TERRAIN_CHUNK;

/** The key of a cell of the relief, in cells (a cell is TERRAIN_CELL map pixels wide). */
export function cellKey(x: number, y: number): string {
    return `${x},${y}`;
}

export function cellOf(key: string): { x: number; y: number } {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
}

function chunkOf(cellX: number, cellY: number): { key: string; index: number } {
    const chunkX = Math.floor(cellX / TERRAIN_CHUNK);
    const chunkY = Math.floor(cellY / TERRAIN_CHUNK);
    return {
        key: `${chunkX},${chunkY}`,
        index: (cellY - chunkY * TERRAIN_CHUNK) * TERRAIN_CHUNK + (cellX - chunkX * TERRAIN_CHUNK),
    };
}

/** The size of a map in cells of the relief. */
export interface MapCells {
    width: number;
    height: number;
}

/**
 * Whether a cell is on the map. The ground shown past the edges of a map is only a picture: no avatar walks there, so
 * nothing is dug nor simulated there. Every cell is held while the size of the map is not known.
 */
export function cellInMap(cellX: number, cellY: number, map: MapCells | undefined): boolean {
    return !map || (cellX >= 0 && cellY >= 0 && cellX < map.width && cellY < map.height);
}

/** The height of a cell in pixels of altitude: 0 on the ground of the map, negative where it was dug. */
export function heightAt(terrain: TerrainData | undefined, cellX: number, cellY: number): number {
    if (!terrain) return 0;
    const { key, index } = chunkOf(cellX, cellY);
    return terrain.chunks[key]?.[index] ?? 0;
}

/**
 * The relief with these cells set to these heights (by cell key), kept within the stored range. A chunk back to flat
 * is dropped, so a map filled in again weighs nothing. The relief given is left as it is.
 */
export function withHeights(terrain: TerrainData | undefined, changes: ReadonlyMap<string, number>): TerrainData {
    const chunks: Record<string, number[]> = { ...(terrain?.chunks ?? {}) };
    const copied = new Set<string>();
    for (const [cell, height] of changes) {
        const { x, y } = cellOf(cell);
        const { key, index } = chunkOf(x, y);
        if (!copied.has(key)) {
            chunks[key] = chunks[key] ? [...chunks[key]] : new Array<number>(CHUNK_CELLS).fill(0);
            copied.add(key);
        }
        const kept = Number.isFinite(height) ? Math.round(Math.min(0, Math.max(TERRAIN_MIN_HEIGHT, height))) : 0;
        // No negative zero in a saved map.
        chunks[key][index] = kept === 0 ? 0 : kept;
    }
    for (const key of copied) {
        if (chunks[key].every((height) => height === 0)) delete chunks[key];
    }
    return { ...(terrain ?? {}), chunks };
}

/** The cells that were dug, by cell key, with their height. */
export function dugCells(terrain: TerrainData | undefined): Map<string, number> {
    const cells = new Map<string, number>();
    if (!terrain) return cells;
    for (const [key, heights] of Object.entries(terrain.chunks)) {
        const [chunkX, chunkY] = key.split(",").map(Number);
        heights.forEach((height, index) => {
            if (height >= 0) return;
            const x = chunkX * TERRAIN_CHUNK + (index % TERRAIN_CHUNK);
            const y = chunkY * TERRAIN_CHUNK + Math.floor(index / TERRAIN_CHUNK);
            cells.set(cellKey(x, y), height);
        });
    }
    return cells;
}
