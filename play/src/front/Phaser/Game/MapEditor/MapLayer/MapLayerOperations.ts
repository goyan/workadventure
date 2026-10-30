import type { FloorFamily, WallTint } from "./MapLayerCatalog";
import { MAP_LAYER_TILE_SIZE, WALL_HALF, facadeLeftExtension, parseMapLayerPrefab } from "./MapLayerCatalog";
import type { WallOrientation } from "./MapLayerModel";
import { MapLayerModel, cellKey } from "./MapLayerModel";

export interface Point {
    x: number;
    y: number;
}

export interface MapBounds {
    columns: number;
    rows: number;
}

/** Upper bound of a flood fill, so that filling a huge empty map cannot create an unbounded number of entities. */
export const MAX_FILL_CELLS = 2500;

export interface WallEdgeRef {
    orientation: WallOrientation;
    x: number;
    y: number;
}

export interface PlacedPrefabLike {
    x: number;
    y: number;
    collectionName: string;
    prefabId: string;
}

function inBounds(cell: Point, bounds: MapBounds): boolean {
    return cell.x >= 0 && cell.y >= 0 && cell.x < bounds.columns && cell.y < bounds.rows;
}

/** Rebuilds the model from the entities of the map layer already placed on the map. Other entities are ignored. */
export function modelFromPlacedPrefabs(items: Iterable<PlacedPrefabLike>): MapLayerModel {
    const model = new MapLayerModel();
    const size = MAP_LAYER_TILE_SIZE;
    for (const item of items) {
        const piece = parseMapLayerPrefab(item.collectionName, item.prefabId);
        if (!piece) {
            continue;
        }
        switch (piece.kind) {
            case "floor":
                if (item.x % size === 0 && item.y % size === 0) {
                    model.setFloor(item.x / size, item.y / size, piece.family);
                }
                break;
            case "facade": {
                // The sprite starts above the grid line (the cap is centered on it) and may start left of the column.
                const x = (item.x + facadeLeftExtension(piece.ends)) / size;
                const y = (item.y + WALL_HALF) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) {
                    model.setWall("h", x, y, piece.tint);
                }
                break;
            }
            case "vertical": {
                // The strip is centered on its grid line and starts under the joint of its first vertex.
                const x = (item.x + WALL_HALF) / size;
                const y = (item.y - WALL_HALF) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) {
                    model.setWall("v", x, y, piece.tint);
                }
                break;
            }
            case "joint":
            case "end":
                // Derived from the walls: nothing to read.
                break;
        }
    }
    return model;
}

/** Tile indexes crossed by the segment between two tiles, both ends included (Bresenham). */
export function cellsBetween(from: Point, to: Point): Point[] {
    const cells: Point[] = [];
    let x = from.x;
    let y = from.y;
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const stepX = from.x < to.x ? 1 : -1;
    const stepY = from.y < to.y ? 1 : -1;
    let error = dx - dy;
    for (;;) {
        cells.push({ x, y });
        if (x === to.x && y === to.y) {
            return cells;
        }
        const doubled = 2 * error;
        if (doubled > -dy) {
            error -= dy;
            x += stepX;
        }
        if (doubled < dx) {
            error += dx;
            y += stepY;
        }
    }
}

export function rectangleCells(a: Point, b: Point): Point[] {
    const cells: Point[] = [];
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
        for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
            cells.push({ x, y });
        }
    }
    return cells;
}

/** Nearest grid vertex to a world position. */
export function vertexAt(worldX: number, worldY: number): Point {
    return { x: Math.round(worldX / MAP_LAYER_TILE_SIZE), y: Math.round(worldY / MAP_LAYER_TILE_SIZE) };
}

/** Tile index under a world position. */
export function cellAt(worldX: number, worldY: number): Point {
    return { x: Math.floor(worldX / MAP_LAYER_TILE_SIZE), y: Math.floor(worldY / MAP_LAYER_TILE_SIZE) };
}

/**
 * Wall segments of a straight line between two vertices. A diagonal drag follows its dominant axis, the line is
 * always horizontal or vertical.
 */
export function lineWallEdges(from: Point, to: Point): WallEdgeRef[] {
    const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const edges: WallEdgeRef[] = [];
    if (horizontal) {
        for (let x = Math.min(from.x, to.x); x < Math.max(from.x, to.x); x++) {
            edges.push({ orientation: "h", x, y: from.y });
        }
    } else {
        for (let y = Math.min(from.y, to.y); y < Math.max(from.y, to.y); y++) {
            edges.push({ orientation: "v", x: from.x, y });
        }
    }
    return edges;
}

/** Perimeter of a rectangle of tiles, as wall segments (the room is inside, its walls are on its border lines). */
export function roomWallEdges(a: Point, b: Point): WallEdgeRef[] {
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x) + 1;
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y) + 1;
    return [
        ...lineWallEdges({ x: left, y: top }, { x: right, y: top }),
        ...lineWallEdges({ x: left, y: bottom }, { x: right, y: bottom }),
        ...lineWallEdges({ x: left, y: top }, { x: left, y: bottom }),
        ...lineWallEdges({ x: right, y: top }, { x: right, y: bottom }),
    ];
}

/**
 * Tiles reached from a start tile without crossing a wall or leaving the map, among the tiles that are empty or
 * already hold the same floor. Returns undefined when the area is larger than MAX_FILL_CELLS (open space).
 */
export function floodFillCells(
    model: MapLayerModel,
    start: Point,
    bounds: MapBounds,
    family: FloorFamily,
): Point[] | undefined {
    if (!inBounds(start, bounds)) {
        return [];
    }
    const accepts = (cell: Point): boolean => {
        const floor = model.getFloor(cell.x, cell.y);
        return floor === undefined || floor.family !== family;
    };
    // Filling a tile that already holds the target floor would change nothing.
    if (!accepts(start)) {
        return [];
    }
    const startFloor = model.getFloor(start.x, start.y)?.family;
    const sameRegion = (cell: Point): boolean => model.getFloor(cell.x, cell.y)?.family === startFloor;

    const visited = new Set<string>([cellKey(start.x, start.y)]);
    const queue: Point[] = [start];
    const result: Point[] = [];
    while (queue.length > 0) {
        const cell = queue.pop() as Point;
        result.push(cell);
        if (result.length > MAX_FILL_CELLS) {
            return undefined;
        }
        const neighbours: [Point, boolean][] = [
            [{ x: cell.x - 1, y: cell.y }, model.hasWall("v", cell.x, cell.y)],
            [{ x: cell.x + 1, y: cell.y }, model.hasWall("v", cell.x + 1, cell.y)],
            [{ x: cell.x, y: cell.y - 1 }, model.hasWall("h", cell.x, cell.y)],
            [{ x: cell.x, y: cell.y + 1 }, model.hasWall("h", cell.x, cell.y + 1)],
        ];
        for (const [next, blocked] of neighbours) {
            const key = cellKey(next.x, next.y);
            if (blocked || visited.has(key) || !inBounds(next, bounds) || !sameRegion(next)) {
                continue;
            }
            visited.add(key);
            queue.push(next);
        }
    }
    return result;
}

const VERTICAL_WALL_HIT_WIDTH = 8;

/**
 * Wall segment under a world position, for the eraser. A vertical wall is thin: it is hit within a few pixels
 * of its line. A facade is hit anywhere on its cap and face.
 */
export function wallAtPoint(model: MapLayerModel, worldX: number, worldY: number): WallEdgeRef | undefined {
    const size = MAP_LAYER_TILE_SIZE;
    const row = Math.floor(worldY / size);
    const nearestLine = Math.round(worldX / size);
    if (Math.abs(worldX - nearestLine * size) <= VERTICAL_WALL_HIT_WIDTH && model.hasWall("v", nearestLine, row)) {
        return { orientation: "v", x: nearestLine, y: row };
    }
    // The facade of the line y covers from half a wall above the line to the end of its face.
    const line = Math.floor((worldY + WALL_HALF) / size);
    const column = Math.floor(worldX / size);
    if (model.hasWall("h", column, line)) {
        return { orientation: "h", x: column, y: line };
    }
    return undefined;
}

export function applyFloor(
    model: MapLayerModel,
    cells: readonly Point[],
    family: FloorFamily,
    bounds: MapBounds,
): void {
    for (const cell of cells) {
        if (inBounds(cell, bounds)) {
            model.setFloor(cell.x, cell.y, family);
        }
    }
}

export function applyWalls(
    model: MapLayerModel,
    edges: readonly WallEdgeRef[],
    tint: WallTint,
    bounds: MapBounds,
): void {
    for (const edge of edges) {
        const inside =
            edge.orientation === "h"
                ? edge.x >= 0 && edge.x < bounds.columns && edge.y >= 0 && edge.y < bounds.rows
                : edge.x >= 0 && edge.x <= bounds.columns && edge.y >= 0 && edge.y < bounds.rows;
        if (inside) {
            model.setWall(edge.orientation, edge.x, edge.y, tint);
        }
    }
}

export function eraseAt(model: MapLayerModel, worldX: number, worldY: number): void {
    const wall = wallAtPoint(model, worldX, worldY);
    if (wall) {
        model.removeWall(wall.orientation, wall.x, wall.y);
        return;
    }
    const cell = cellAt(worldX, worldY);
    model.removeFloor(cell.x, cell.y);
}
