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
 * Where the animals of a habitat live: bodies of cells that touch each other without a wall between them (bodies of
 * water, pieces of outdoor land). An animal has a level: the least water it swims in, or the most a land animal
 * walks in.
 */
export interface Places {
    /** The body of a cell, from 1; 0 where nothing of that habitat lives. */
    bodyAt(cellX: number, cellY: number): number;
    /** For each body (its number is the index, 0 is none): its cells, and those deep enough for a dolphin. */
    readonly sizes: readonly { cells: number; deep: number }[];
    /** Whether an animal of that level may be in the cell. */
    passable(cellX: number, cellY: number, level: number): boolean;
    /** Whether one goes from a cell to the next one on that side (-1, 0 or 1 on one axis only) without a wall. */
    canCross(cellX: number, cellY: number, dx: number, dy: number): boolean;
    /** How good a cell is for an animal left where it cannot be: it goes to the best one next to it. */
    comfortAt(cellX: number, cellY: number): number;
    /** A random cell of the body an animal of that level may be in, at most `reach` cells away on each axis. */
    randomCell(
        body: number,
        near: WaterCell,
        reach: number,
        level: number,
        random: () => number,
    ): WaterCell | undefined;
    /** A random cell of the whole body for that level. Reads the whole place: for rare uses. */
    anyCell(body: number, level: number, random: () => number): WaterCell | undefined;
    /** On land: the trees a lion or a tiger may live around, in map pixels, with their body. */
    readonly homes?: readonly { x: number; y: number; body: number }[];
    /**
     * On land: the cell of the body nearest to a cell where an animal of that level stands beside water; of any
     * body for -1.
     */
    shoreNear?(body: number, cellX: number, cellY: number, level: number): WaterCell | undefined;
    /** On land: whether an animal standing on that cell is beside water it can drink. */
    atShore?(cellX: number, cellY: number): boolean;
}

/**
 * The bodies of water of a grid: the cells deep enough for a fish that touch each other without a wall between
 * them. They are read again when the water moved, never kept on an animal: bodies merge and split as the level
 * goes up and down. The level of an animal is the least water it swims in.
 */
export interface WaterBodies extends Places {
    /** Whether the cell holds at least this much water (`passable`). */
    swimmable(cellX: number, cellY: number, minDepth: number): boolean;
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

/**
 * `excluded`: cells whose water is no home for an animal, whatever its depth (the pools: treated water, no fish in
 * it). They belong to no body and nothing swims into them.
 */
export function waterBodiesOf(grid: WaterGrid, excluded?: (cellX: number, cellY: number) => boolean): WaterBodies {
    const { x: left, y: top, width, height } = grid.bounds;
    const depthAt = (cellX: number, cellY: number): number =>
        excluded?.(cellX, cellY) ? 0 : grid.depthAt(cellX, cellY);
    const labels = new Int32Array(width * height);
    const sizes: { cells: number; deep: number }[] = [{ cells: 0, deep: 0 }];
    // A queue instead of recursion: a lake may hold hundreds of thousands of cells.
    const queue = new Int32Array(width * height);
    for (let start = 0; start < labels.length; start++) {
        if (labels[start] !== 0) continue;
        if (depthAt(left + (start % width), top + Math.floor(start / width)) < FISH_DEPTH_PX) continue;
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
            if (depthAt(cellX, cellY) >= DOLPHIN_DEPTH_PX) size.deep++;
            for (const { side, dx, dy } of SIDES) {
                if (!grid.canCross(cellX, cellY, side)) continue;
                const next = index + dx + dy * width;
                if (labels[next] !== 0 || depthAt(cellX + dx, cellY + dy) < FISH_DEPTH_PX) continue;
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
        swimmable: (cellX, cellY, minDepth) => depthAt(cellX, cellY) >= minDepth,
        passable: (cellX, cellY, minDepth) => depthAt(cellX, cellY) >= minDepth,
        canCross: (cellX, cellY, dx, dy) => canSwimAcross(grid, cellX, cellY, dx, dy),
        comfortAt: (cellX, cellY) => depthAt(cellX, cellY),
        anyCell: (body, minDepth, random) => {
            if (body === 0) return undefined;
            // One pass, each fitting cell kept with the same chance.
            let chosen: WaterCell | undefined;
            let seen = 0;
            for (let index = 0; index < labels.length; index++) {
                if (labels[index] !== body) continue;
                const cellX = left + (index % width);
                const cellY = top + Math.floor(index / width);
                if (depthAt(cellX, cellY) < minDepth) continue;
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
                    if (bodyAt(cellX, cellY) === body && depthAt(cellX, cellY) >= minDepth) {
                        candidates.push({ cellX, cellY });
                    }
                }
            }
            if (candidates.length === 0) return undefined;
            return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
        },
    };
}
