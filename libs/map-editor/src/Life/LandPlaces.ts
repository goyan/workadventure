import { cellOf } from "../Terrain/TerrainGrid";
import { TERRAIN_CELL } from "../types";
import type { WaterWallSides } from "../Terrain/WaterGrid";
import { LIFE_DEPTHS_PX } from "../Terrain/WaterView";
import type { Places, WaterCell } from "./WaterBodies";

/** A land predator goes into less water than this: where an avatar does not swim yet. */
export const WADE_DEPTH_PX = LIFE_DEPTHS_PX.deep;
/** An antelope goes into less water than this: it keeps its feet dry. */
export const DRY_LAND_PX = LIFE_DEPTHS_PX.film;
/** An animal drinks from a cell that holds this much water at least, in pixels. */
export const DRINK_DEPTH_PX = LIFE_DEPTHS_PX.film;

/** What the land of a map is made of: its size in cells of the relief, its walls, and the water on it. */
export interface LandInput {
    width: number;
    height: number;
    /** The sides no land animal crosses: the walls of the Map tool, doors closed. */
    walls: WaterWallSides;
    /** The water on a cell, in pixels (0 without any). */
    depthAt: (cellX: number, cellY: number) => number;
    /** The trees of the map, in map pixels (see landTreesOf): those on the land are homes for the predators. */
    trees?: readonly { x: number; y: number }[];
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
    const labels = new Int32Array(width * height);
    const sizes: { cells: number; deep: number }[] = [{ cells: 0, deep: 0 }];
    const queue = new Int32Array(width * height);
    // Whether one walks in each cell, asked once: the flood below looks at each cell from its four neighbours.
    const WALKS = 1;
    const DROWNED = 2;
    const walks = new Uint8Array(width * height);
    const walkable = (index: number): boolean => {
        if (walks[index] === 0) {
            walks[index] = depthAt(index % width, Math.floor(index / width)) < WADE_DEPTH_PX ? WALKS : DROWNED;
        }
        return walks[index] === WALKS;
    };
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
            const cellY = (index - cellX) / width;
            size.cells++;
            // The four sides in the order of SIDES (east, west, south, north), as canCross answers them.
            for (let side = 0; side < 4; side++) {
                let next: number;
                if (side === 0) {
                    if (cellX + 1 >= width || closed[index] & 1) continue;
                    next = index + 1;
                } else if (side === 1) {
                    if (cellX === 0 || closed[index - 1] & 1) continue;
                    next = index - 1;
                } else if (side === 2) {
                    if (cellY + 1 >= height || closed[index] & 2) continue;
                    next = index + width;
                } else {
                    if (cellY === 0 || closed[index - width] & 2) continue;
                    next = index - width;
                }
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
    const homes: { x: number; y: number; body: number }[] = [];
    for (const tree of input.trees ?? []) {
        const body = bodyAt(Math.floor(tree.x / TERRAIN_CELL), Math.floor(tree.y / TERRAIN_CELL));
        if (body !== 0) homes.push({ x: tree.x, y: tree.y, body });
    }
    const atShore = (cellX: number, cellY: number): boolean => {
        if (bodyAt(cellX, cellY) === 0 || depthAt(cellX, cellY) >= DRY_LAND_PX) return false;
        for (const [dx, dy] of SIDES) {
            if (inside(cellX + dx, cellY + dy) && depthAt(cellX + dx, cellY + dy) >= DRINK_DEPTH_PX) return true;
        }
        return false;
    };
    // The cells of the land beside water, read the first time an animal is thirsty.
    let shores: Int32Array | undefined;
    const readShores = (): Int32Array => {
        // What atShore answers for each cell of the land, read from the water as it is now: each cell is asked its
        // depth once (dry enough to stand on, deep enough to drink from), not once for itself and once more from
        // each of its neighbours.
        const DRY = 1;
        const DRINK = 2;
        const depths = new Uint8Array(width * height);
        for (let index = 0; index < depths.length; index++) {
            const depth = depthAt(index % width, Math.floor(index / width));
            depths[index] = (depth >= DRY_LAND_PX ? 0 : DRY) | (depth >= DRINK_DEPTH_PX ? DRINK : 0);
        }
        const found: number[] = [];
        for (let index = 0; index < labels.length; index++) {
            if (labels[index] === 0 || !(depths[index] & DRY)) continue;
            const cellX = index % width;
            const cellY = (index - cellX) / width;
            if (
                (cellX + 1 < width && depths[index + 1] & DRINK) ||
                (cellX > 0 && depths[index - 1] & DRINK) ||
                (cellY + 1 < height && depths[index + width] & DRINK) ||
                (cellY > 0 && depths[index - width] & DRINK)
            ) {
                found.push(index);
            }
        }
        return Int32Array.from(found);
    };
    return {
        homes,
        atShore,
        shoreNear: (body, cellX, cellY, level) => {
            // Any piece of land for a body of -1 (a gull lands anywhere).
            if (body === 0) return undefined;
            shores ??= readShores();
            let best: WaterCell | undefined;
            let least = Number.POSITIVE_INFINITY;
            for (const index of shores) {
                if (body !== -1 && labels[index] !== body) continue;
                const x = index % width;
                const y = Math.floor(index / width);
                const far = (x - cellX) ** 2 + (y - cellY) ** 2;
                if (far < least && depthAt(x, y) < level) {
                    least = far;
                    best = { cellX: x, cellY: y };
                }
            }
            return best;
        },
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
