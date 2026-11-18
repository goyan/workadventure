import { cellOf } from "../Terrain/TerrainGrid";
import type { WaterWallSides } from "../Terrain/WaterGrid";
import type { Places, WaterCell } from "./WaterBodies";

/** A land predator goes into less water than this: where an avatar does not swim yet. */
export const WADE_DEPTH_PX = 16;
/** An antelope goes into less water than this: it keeps its feet dry. */
export const DRY_LAND_PX = 2;

/** What the land of a map is made of: its size in cells of the relief, its walls, and the water on it. */
export interface LandInput {
    width: number;
    height: number;
    /** The sides no land animal crosses: the walls of the Map tool, doors closed. */
    walls: WaterWallSides;
    /** The water on a cell, in pixels (0 without any). */
    depthAt: (cellX: number, cellY: number) => number;
}

const SIDES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
] as const;

/**
 * The outdoor land of a map, for the animals that walk: the cells reached from the edge of the map without crossing
 * a wall nor water one swims in, in bodies that touch each other. What walls close (a room, a courtyard) is not
 * outdoors: nothing lives there. The level of an animal is the water it does not go into (`passable`: less than it).
 */
export function landPlacesOf(input: LandInput): Places {
    const { width, height, walls, depthAt } = input;
    const inside = (cellX: number, cellY: number): boolean =>
        cellX >= 0 && cellY >= 0 && cellX < width && cellY < height;
    // The walls as bits of the cells, read once: 1 the east side is closed, 2 the south side.
    const closed = new Uint8Array(width * height);
    for (const [sides, bit] of [
        [walls.east, 1],
        [walls.south, 2],
    ] as const) {
        for (const key of sides) {
            const { x, y } = cellOf(key);
            if (inside(x, y)) closed[y * width + x] |= bit;
        }
    }
    const canCross = (cellX: number, cellY: number, dx: number, dy: number): boolean => {
        if (!inside(cellX, cellY) || !inside(cellX + dx, cellY + dy)) return false;
        const index = cellY * width + cellX;
        if (dx === 1 && dy === 0) return (closed[index] & 1) === 0;
        if (dx === -1 && dy === 0) return (closed[index - 1] & 1) === 0;
        if (dx === 0 && dy === 1) return (closed[index] & 2) === 0;
        if (dx === 0 && dy === -1) return (closed[index - width] & 2) === 0;
        return false;
    };
    const walkable = (index: number): boolean => depthAt(index % width, Math.floor(index / width)) < WADE_DEPTH_PX;
    const labels = new Int32Array(width * height);
    const sizes: { cells: number; deep: number }[] = [{ cells: 0, deep: 0 }];
    const queue = new Int32Array(width * height);
    // A body starts from the edge of the map only: what is not reached from there is indoors.
    const flood = (start: number): void => {
        if (labels[start] !== 0 || !walkable(start)) return;
        const body = sizes.length;
        const size = { cells: 0, deep: 0 };
        sizes.push(size);
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        labels[start] = body;
        while (head < tail) {
            const index = queue[head++];
            const cellX = index % width;
            const cellY = Math.floor(index / width);
            size.cells++;
            for (const [dx, dy] of SIDES) {
                if (!canCross(cellX, cellY, dx, dy)) continue;
                const next = index + dx + dy * width;
                if (labels[next] !== 0 || !walkable(next)) continue;
                labels[next] = body;
                queue[tail++] = next;
            }
        }
    };
    for (let cellX = 0; cellX < width; cellX++) {
        flood(cellX);
        flood((height - 1) * width + cellX);
    }
    for (let cellY = 0; cellY < height; cellY++) {
        flood(cellY * width);
        flood(cellY * width + width - 1);
    }
    const bodyAt = (cellX: number, cellY: number): number => (inside(cellX, cellY) ? labels[cellY * width + cellX] : 0);
    const passable = (cellX: number, cellY: number, level: number): boolean =>
        bodyAt(cellX, cellY) !== 0 && depthAt(cellX, cellY) < level;
    return {
        sizes,
        bodyAt,
        passable,
        canCross,
        comfortAt: (cellX, cellY) => -depthAt(cellX, cellY),
        anyCell: (body, level, random) => {
            if (body === 0) return undefined;
            // One pass, each fitting cell kept with the same chance.
            let chosen: WaterCell | undefined;
            let seen = 0;
            for (let index = 0; index < labels.length; index++) {
                if (labels[index] !== body) continue;
                const cellX = index % width;
                const cellY = Math.floor(index / width);
                if (depthAt(cellX, cellY) >= level) continue;
                seen++;
                if (random() * seen < 1) chosen = { cellX, cellY };
            }
            return chosen;
        },
        randomCell: (body, near, reach, level, random) => {
            if (body === 0) return undefined;
            const candidates: WaterCell[] = [];
            for (let cellY = near.cellY - reach; cellY <= near.cellY + reach; cellY++) {
                for (let cellX = near.cellX - reach; cellX <= near.cellX + reach; cellX++) {
                    if (bodyAt(cellX, cellY) === body && depthAt(cellX, cellY) < level)
                        candidates.push({ cellX, cellY });
                }
            }
            if (candidates.length === 0) return undefined;
            return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
        },
    };
}
