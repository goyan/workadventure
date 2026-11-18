import { TERRAIN_CELL } from "@workadventure/map-editor";
import type { Point, Shore, WanderDirection } from "./WanderSchedule";
import type { WanderRectangle } from "./WanderCollisions";

/**
 * The water of the relief as the wandering animals see it. They walk tile by tile: a tile is wet as soon as one of
 * the cells of the relief under it holds this much water (the film a flood leaves behind is not water to them), and
 * stays wet until that water is nearly gone, so a shore that wavers does not send them running each second.
 */
export const WET_ON_PX = 2;
export const WET_OFF_PX = 1;

export class WetTiles {
    constructor(
        public readonly columns: number,
        public readonly rows: number,
        private readonly wet: Uint8Array,
    ) {}

    public isWet(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.columns && y < this.rows && this.wet[y * this.columns + x] === 1;
    }

    public get any(): boolean {
        return this.wet.includes(1);
    }
}

/**
 * The wet tiles of a map of `columns` x `rows` tiles. `depthAt` gives the water over a point of the map (pixels of
 * water, map pixels), read once a cell of the relief and only over `covered`, the part of the map that may hold
 * water. `previous` is what was wet before: see WET_OFF_PX.
 */
export function wetTilesOf(
    columns: number,
    rows: number,
    tileSize: number,
    covered: WanderRectangle,
    depthAt: (x: number, y: number) => number,
    previous?: WetTiles,
): WetTiles {
    const wet = new Uint8Array(columns * rows);
    const firstColumn = Math.max(0, Math.floor(covered.x / tileSize));
    const lastColumn = Math.min(columns, Math.ceil((covered.x + covered.width) / tileSize));
    const firstRow = Math.max(0, Math.floor(covered.y / tileSize));
    const lastRow = Math.min(rows, Math.ceil((covered.y + covered.height) / tileSize));
    const sameSize = previous !== undefined && previous.columns === columns && previous.rows === rows;
    for (let y = firstRow; y < lastRow; y++) {
        for (let x = firstColumn; x < lastColumn; x++) {
            let deepest = 0;
            for (let cellY = y * tileSize; cellY < (y + 1) * tileSize; cellY += TERRAIN_CELL) {
                for (let cellX = x * tileSize; cellX < (x + 1) * tileSize; cellX += TERRAIN_CELL) {
                    deepest = Math.max(deepest, depthAt(cellX, cellY));
                }
            }
            const threshold = sameSize && previous.isWet(x, y) ? WET_OFF_PX : WET_ON_PX;
            if (deepest >= threshold) wet[y * columns + x] = 1;
        }
    }
    return new WetTiles(columns, rows, wet);
}

/** The tiles that are not as they were (wet or dry), row by row. Without a `before`, every wet tile. */
export function changedTiles(before: WetTiles | undefined, after: WetTiles): Point[] {
    const changed: Point[] = [];
    for (let y = 0; y < after.rows; y++) {
        for (let x = 0; x < after.columns; x++) {
            if (after.isWet(x, y) !== (before?.isWet(x, y) ?? false)) changed.push({ x, y });
        }
    }
    return changed;
}

/** The collision grid with every wet tile turned into `collider`. Returns the grid itself when nothing is wet. */
export function blockWetTiles(grid: number[][], wet: WetTiles, collider: number): number[][] {
    if (!wet.any) return grid;
    return grid.map((row, y) => row.map((type, x) => (wet.isWet(x, y) ? collider : type)));
}

const SIDES: readonly { dx: number; dy: number; toward: WanderDirection }[] = [
    // Where the shore is from the water, and where the water is from the shore.
    { dx: 0, dy: -1, toward: "down" },
    { dx: -1, dy: 0, toward: "right" },
    { dx: 1, dy: 0, toward: "left" },
    { dx: 0, dy: 1, toward: "up" },
];

/**
 * Where an animal can drink: the centre of each dry tile it may stop on (`isFree`) that touches a wet tile by a
 * side, with no wall between the two (`isWalled`), and which way the water is. Row by row; a tile between two
 * waters is given once.
 */
export function shoresOf(
    wet: WetTiles,
    tileSize: number,
    isFree: (tile: Point) => boolean,
    isWalled: (from: Point, to: Point) => boolean,
): Shore[] {
    const shores = new Map<number, Shore>();
    for (let y = 0; y < wet.rows; y++) {
        for (let x = 0; x < wet.columns; x++) {
            if (!wet.isWet(x, y)) continue;
            for (const side of SIDES) {
                const tile = { x: x + side.dx, y: y + side.dy };
                const key = tile.y * wet.columns + tile.x;
                if (tile.x < 0 || tile.y < 0 || tile.x >= wet.columns || tile.y >= wet.rows) continue;
                if (shores.has(key) || wet.isWet(tile.x, tile.y) || !isFree(tile) || isWalled(tile, { x, y })) continue;
                shores.set(key, {
                    x: tile.x * tileSize + tileSize / 2,
                    y: tile.y * tileSize + tileSize / 2,
                    toward: side.toward,
                });
            }
        }
    }
    return [...shores.entries()].sort(([a], [b]) => a - b).map(([, shore]) => shore);
}
