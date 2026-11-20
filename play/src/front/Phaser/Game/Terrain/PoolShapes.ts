import { cellKey, cellOf, poolStyleOf, soilAt, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** How a pool is drawn in the pool mode of the relief tool: a shape dragged from corner to corner, or the brush. */
export type PoolTool = "rectangle" | "ellipse" | "brush" | "eraser";

export const POOL_TOOLS: readonly PoolTool[] = ["rectangle", "ellipse", "brush", "eraser"];

/** Beyond this many cells a pool is not selected whole: a map painted with pools everywhere stays responsive. */
const MAX_SELECTED_CELLS = 20000;

export interface Point {
    x: number;
    y: number;
}

/** The cells (keys) of a rectangle or an ellipse dragged between two points of the map, both corners included. */
export function shapeCells(shape: "rectangle" | "ellipse", from: Point, to: Point): string[] {
    const left = Math.floor(Math.min(from.x, to.x) / TERRAIN_CELL);
    const right = Math.floor(Math.max(from.x, to.x) / TERRAIN_CELL);
    const top = Math.floor(Math.min(from.y, to.y) / TERRAIN_CELL);
    const bottom = Math.floor(Math.max(from.y, to.y) / TERRAIN_CELL);
    const centreX = (left + right + 1) / 2;
    const centreY = (top + bottom + 1) / 2;
    const radiusX = (right - left + 1) / 2;
    const radiusY = (bottom - top + 1) / 2;
    const cells: string[] = [];
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            if (shape === "ellipse") {
                const dx = (x + 0.5 - centreX) / radiusX;
                const dy = (y + 0.5 - centreY) / radiusY;
                if (dx * dx + dy * dy > 1) continue;
            }
            cells.push(cellKey(x, y));
        }
    }
    return cells;
}

/**
 * The soils a shape paints: the pool of `soil` on each allowed cell, or with the eraser the soil wiped from the cells
 * of a pool only (the ground around keeps its soil).
 */
export function poolShapeChanges(
    terrain: TerrainData | undefined,
    cells: readonly string[],
    soil: number,
    eraser: boolean,
    allowed: (cellX: number, cellY: number) => boolean,
): Map<string, number> {
    const changes = new Map<string, number>();
    for (const key of cells) {
        const { x, y } = cellOf(key);
        if (!allowed(x, y)) continue;
        const here = soilAt(terrain, x, y);
        if (eraser) {
            if (poolStyleOf(here) !== undefined) changes.set(key, 0);
        } else if (here !== soil) changes.set(key, soil);
    }
    return changes;
}

/** The pool under a cell: its style and all its cells joined by a side; undefined off a pool. */
export function poolAt(
    terrain: TerrainData | undefined,
    cellX: number,
    cellY: number,
): { style: number; cells: string[] } | undefined {
    const code = soilAt(terrain, cellX, cellY);
    const style = poolStyleOf(code);
    if (style === undefined) return undefined;
    const start = cellKey(cellX, cellY);
    const seen = new Set<string>([start]);
    const queue = [start];
    for (let next = 0; next < queue.length && seen.size < MAX_SELECTED_CELLS; next++) {
        const { x, y } = cellOf(queue[next]);
        for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
        ]) {
            const key = cellKey(nx, ny);
            if (seen.has(key) || soilAt(terrain, nx, ny) !== code) continue;
            seen.add(key);
            queue.push(key);
        }
    }
    return { style, cells: [...seen] };
}
