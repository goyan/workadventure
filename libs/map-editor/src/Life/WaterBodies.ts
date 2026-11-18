import type { WaterGrid } from "../Terrain/WaterGrid";

/** The least water a fish swims in, in pixels of water. */
export const FISH_DEPTH_PX = 8;
/** The least water a dolphin swims in: where an avatar swims. */
export const DOLPHIN_DEPTH_PX = 16;

export interface WaterCell {
    cellX: number;
    cellY: number;
}

/**
 * The bodies of water of a grid: the cells deep enough for a fish that touch each other without a wall between
 * them. They are read again when the water moved, never kept on an animal: bodies merge and split as the level
 * goes up and down.
 */
export interface WaterBodies {
    /** The body of a cell, from 1; 0 where no fish swims. */
    bodyAt(cellX: number, cellY: number): number;
    /** For each body (its number is the index, 0 is none): its cells, and those deep enough for a dolphin. */
    readonly sizes: readonly { cells: number; deep: number }[];
    /** Whether the cell holds at least this much water. */
    swimmable(cellX: number, cellY: number, minDepth: number): boolean;
    /** A random cell of the body with at least this much water, at most `reach` cells away on each axis. */
    randomCell(
        body: number,
        near: WaterCell,
        reach: number,
        minDepth: number,
        random: () => number,
    ): WaterCell | undefined;
    /** A random cell of the whole body with at least this much water. Reads the whole grid: for rare uses. */
    anyCell(body: number, minDepth: number, random: () => number): WaterCell | undefined;
}

const SIDES = [
    { side: "east", dx: 1, dy: 0 },
    { side: "west", dx: -1, dy: 0 },
    { side: "south", dx: 0, dy: 1 },
    { side: "north", dx: 0, dy: -1 },
] as const;

/** Whether what swims can go from a cell to the next one on that side (-1, 0 or 1 on one axis only). */
export function canSwimAcross(grid: WaterGrid, cellX: number, cellY: number, dx: number, dy: number): boolean {
    const side = SIDES.find((candidate) => candidate.dx === dx && candidate.dy === dy);
    return side !== undefined && grid.canCross(cellX, cellY, side.side);
}

export function waterBodiesOf(grid: WaterGrid): WaterBodies {
    const { x: left, y: top, width, height } = grid.bounds;
    const labels = new Int32Array(width * height);
    const sizes: { cells: number; deep: number }[] = [{ cells: 0, deep: 0 }];
    // A queue instead of recursion: a lake may hold hundreds of thousands of cells.
    const queue = new Int32Array(width * height);
    for (let start = 0; start < labels.length; start++) {
        if (labels[start] !== 0) continue;
        if (grid.depthAt(left + (start % width), top + Math.floor(start / width)) < FISH_DEPTH_PX) continue;
        const body = sizes.length;
        const size = { cells: 0, deep: 0 };
        sizes.push(size);
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        labels[start] = body;
        while (head < tail) {
            const index = queue[head++];
            const cellX = left + (index % width);
            const cellY = top + Math.floor(index / width);
            size.cells++;
            if (grid.depthAt(cellX, cellY) >= DOLPHIN_DEPTH_PX) size.deep++;
            for (const { side, dx, dy } of SIDES) {
                if (!grid.canCross(cellX, cellY, side)) continue;
                const next = index + dx + dy * width;
                if (labels[next] !== 0 || grid.depthAt(cellX + dx, cellY + dy) < FISH_DEPTH_PX) continue;
                labels[next] = body;
                queue[tail++] = next;
            }
        }
    }
    const bodyAt = (cellX: number, cellY: number): number => {
        const column = cellX - left;
        const row = cellY - top;
        if (column < 0 || row < 0 || column >= width || row >= height) return 0;
        return labels[row * width + column];
    };
    return {
        sizes,
        bodyAt,
        swimmable: (cellX, cellY, minDepth) => grid.depthAt(cellX, cellY) >= minDepth,
        anyCell: (body, minDepth, random) => {
            if (body === 0) return undefined;
            // One pass, each fitting cell kept with the same chance.
            let chosen: WaterCell | undefined;
            let seen = 0;
            for (let index = 0; index < labels.length; index++) {
                if (labels[index] !== body) continue;
                const cellX = left + (index % width);
                const cellY = top + Math.floor(index / width);
                if (grid.depthAt(cellX, cellY) < minDepth) continue;
                seen++;
                if (random() * seen < 1) chosen = { cellX, cellY };
            }
            return chosen;
        },
        randomCell: (body, near, reach, minDepth, random) => {
            if (body === 0) return undefined;
            const candidates: WaterCell[] = [];
            for (let cellY = near.cellY - reach; cellY <= near.cellY + reach; cellY++) {
                for (let cellX = near.cellX - reach; cellX <= near.cellX + reach; cellX++) {
                    if (bodyAt(cellX, cellY) === body && grid.depthAt(cellX, cellY) >= minDepth) {
                        candidates.push({ cellX, cellY });
                    }
                }
            }
            if (candidates.length === 0) return undefined;
            return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
        },
    };
}
