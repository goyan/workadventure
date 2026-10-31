import type { FloorFamily, WallTint } from "./MapLayerCatalog";
import {
    MAP_LAYER_TILE_SIZE,
    DOOR_CLOSED_FRAME,
    DOOR_VERTICAL_WIDTH,
    WALL_HALF,
    WALL_THICKNESS,
    facadeLeftExtension,
    parseMapLayerPrefab,
} from "./MapLayerCatalog";
import type { DoorRef, WallEdgeRef, WallOrientation } from "./MapLayerModel";
import { MapLayerModel, cellKey, doorEdges, edgeKey } from "./MapLayerModel";

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
                // The sprite fills the tile row of its line and may start left of the column. Walls drawn when the cap
                // was centered on the line (half a wall higher) are still read, and redrawn in place on the next edit.
                const x = (item.x + facadeLeftExtension(piece.ends)) / size;
                const y = item.y / size;
                const legacyY = (item.y + WALL_HALF) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) {
                    model.setWall("h", x, y, piece.tint);
                } else if (Number.isInteger(x) && Number.isInteger(legacyY)) {
                    model.setWall("h", x, legacyY, piece.tint);
                }
                break;
            }
            case "vertical": {
                // The strip is centered on its grid line and starts under the joint of its first vertex (same legacy
                // reading as the facades, with the strip half a wall higher).
                const x = (item.x + WALL_HALF) / size;
                const y = (item.y - WALL_THICKNESS) / size;
                const legacyY = (item.y - WALL_HALF) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) {
                    model.setWall("v", x, y, piece.tint);
                } else if (Number.isInteger(x) && Number.isInteger(legacyY)) {
                    model.setWall("v", x, legacyY, piece.tint);
                }
                break;
            }
            case "door": {
                // The first piece of the door gives its place; the walls under the door are not drawn, so they are read from it.
                if (piece.frame !== DOOR_CLOSED_FRAME || (piece.side !== "g" && piece.side !== "haut")) {
                    break;
                }
                const door: DoorRef =
                    piece.orientation === "h"
                        ? { orientation: "h", x: item.x / size + 1, y: item.y / size }
                        : {
                              orientation: "v",
                              x: (item.x + DOOR_VERTICAL_WIDTH / 2) / size,
                              y: (item.y - WALL_THICKNESS) / size + 1,
                          };
                if (Number.isInteger(door.x) && Number.isInteger(door.y)) {
                    for (const edge of doorEdges(door)) {
                        model.setWall(edge.orientation, edge.x, edge.y, piece.tint);
                    }
                    model.setDoor(door);
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

/**
 * Vertex whose wall has its base nearest to a world position: a wall stands on the tile row of its line, so its
 * base is one tile under the line.
 */
export function vertexAt(worldX: number, worldY: number): Point {
    return {
        x: Math.round(worldX / MAP_LAYER_TILE_SIZE),
        y: Math.round((worldY - MAP_LAYER_TILE_SIZE) / MAP_LAYER_TILE_SIZE),
    };
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
    // The strip of the row y spans from the joint of its first vertex to the joint of the next one.
    const row = Math.floor((worldY - WALL_THICKNESS) / size);
    const nearestLine = Math.round(worldX / size);
    if (Math.abs(worldX - nearestLine * size) <= VERTICAL_WALL_HIT_WIDTH && model.hasWall("v", nearestLine, row)) {
        return { orientation: "v", x: nearestLine, y: row };
    }
    // The facade of the line y fills the tile row y.
    const line = Math.floor(worldY / size);
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

/**
 * Erases what is under a position: a door first (the walls it stands on stay as they were), else a wall, else a
 * floor. `keptEdges` collects the segments of the doors erased, which a drag then leaves alone: one pass of the
 * eraser removes the door, the next one the wall.
 */
export function eraseAt(
    model: MapLayerModel,
    worldX: number,
    worldY: number,
    keptEdges: Set<string> = new Set(),
): void {
    const wall = wallAtPoint(model, worldX, worldY);
    if (wall) {
        if (keptEdges.has(edgeKey(wall.orientation, wall.x, wall.y))) {
            return;
        }
        const door = model.getDoorOn(wall.orientation, wall.x, wall.y);
        if (door) {
            model.removeDoor(door);
            for (const edge of doorEdges(door)) {
                keptEdges.add(edgeKey(edge.orientation, edge.x, edge.y));
            }
            return;
        }
        model.removeWall(wall.orientation, wall.x, wall.y);
        return;
    }
    const cell = cellAt(worldX, worldY);
    model.removeFloor(cell.x, cell.y);
}

/** A door the cursor would place, and whether the walls under it allow it. */
export interface DoorCandidate extends DoorRef {
    valid: boolean;
}

/**
 * The door under a world position, centered on the cursor: it stands on the wall segment hit by the cursor, on the
 * vertex nearest to it along that wall. Without a wall under the cursor the candidate is an invalid horizontal door.
 */
export function doorCandidateAt(model: MapLayerModel, worldX: number, worldY: number): DoorCandidate {
    const size = MAP_LAYER_TILE_SIZE;
    const wall = wallAtPoint(model, worldX, worldY);
    const orientation: WallOrientation = wall?.orientation ?? "h";
    const door: DoorRef =
        orientation === "h"
            ? { orientation, x: Math.round(worldX / size), y: wall?.y ?? Math.floor(worldY / size) }
            : { orientation, x: wall?.x ?? Math.round(worldX / size), y: Math.round((worldY - WALL_THICKNESS) / size) };
    return { ...door, valid: wall !== undefined && model.canSetDoor(door) };
}

/** Floor under the segments of a horizontal door when there is none: the one of the room it opens to (south first). */
function defaultDoorFloor(model: MapLayerModel, cell: Point): FloorFamily | undefined {
    const around: Point[] = [
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x, y: cell.y - 1 },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x + 1, y: cell.y },
    ];
    for (const neighbour of around) {
        const floor = model.getFloor(neighbour.x, neighbour.y);
        if (floor) {
            return floor.family;
        }
    }
    return undefined;
}

/** Sets a door and gives its horizontal segments the floor of the room, unless they already have one. */
export function applyDoor(model: MapLayerModel, door: DoorRef, bounds: MapBounds): void {
    if (!model.setDoor(door)) {
        return;
    }
    if (door.orientation !== "h") {
        return;
    }
    for (const edge of doorEdges(door)) {
        const cell = { x: edge.x, y: edge.y };
        if (model.getFloor(cell.x, cell.y) === undefined && inBounds(cell, bounds)) {
            const family = defaultDoorFloor(model, cell);
            if (family) {
                model.setFloor(cell.x, cell.y, family);
            }
        }
    }
}
