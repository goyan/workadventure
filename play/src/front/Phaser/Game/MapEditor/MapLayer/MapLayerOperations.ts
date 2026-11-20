import type { FloorFamily, WallHeight, WallTint } from "./MapLayerCatalog";
import {
    MAP_LAYER_TILE_SIZE,
    DOOR_CLOSED_FRAME,
    DOOR_VERTICAL_WIDTH,
    WALL_HALF,
    WALL_THICKNESS,
    facadeLeftExtension,
    parseMapLayerPrefab,
    wallRise,
} from "./MapLayerCatalog";
import type { DoorRef, WallEdgeRef, WallOrientation } from "./MapLayerModel";
import { MapLayerModel, cellKey, doorEdges, doorHeight, edgeKey } from "./MapLayerModel";

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
    /**
     * Height of the wall above a door or a window, read from the lintel over it; applied once every piece is read, so
     * that the result does not depend on the order of the pieces.
     */
    const lintels = new Map<string, { x: number; y: number; height: WallHeight }>();
    /** A segment read twice keeps the highest of its heights: reading never lowers a wall, nor the door on it. */
    const setWall = (orientation: WallOrientation, x: number, y: number, tint: WallTint, height: WallHeight): void => {
        const known = model.getWall(orientation, x, y)?.height ?? 1;
        model.setWall(orientation, x, y, tint, known > height ? known : height);
    };
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
            case "window":
            case "facade": {
                // The sprite fills the tile row of its line, raised by the height of the wall, and may start left of
                // the column. Walls of height 1 drawn when the cap was centered on the line (half a wall higher) are
                // still read, and redrawn in place on the next edit.
                const x = (item.x + facadeLeftExtension(piece.ends)) / size;
                const y = (item.y + wallRise(piece.height)) / size;
                const legacyY = (item.y + WALL_HALF) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) {
                    setWall("h", x, y, piece.tint, piece.height);
                    if (piece.kind === "window") model.setWindow(x, y, piece.height);
                } else if (piece.height === 1 && Number.isInteger(x) && Number.isInteger(legacyY)) {
                    setWall("h", x, legacyY, piece.tint, 1);
                }
                break;
            }
            case "vertical": {
                // The strip is centered on its grid line and starts under the joint of its first vertex, raised by the
                // height of the wall (same legacy reading as the facades, with the strip half a wall higher).
                const x = (item.x + WALL_HALF) / size;
                const y = (item.y + wallRise(piece.height) - WALL_THICKNESS) / size;
                const legacyY = (item.y - WALL_HALF) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) {
                    setWall("v", x, y, piece.tint, piece.height);
                } else if (piece.height === 1 && Number.isInteger(x) && Number.isInteger(legacyY)) {
                    setWall("v", x, legacyY, piece.tint, 1);
                }
                break;
            }
            case "lintel": {
                // Derived from the wall, but the only piece that tells the height of the wall above an opening.
                const x = (item.x + facadeLeftExtension(piece.ends)) / size;
                const y = (item.y + wallRise(piece.height)) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) {
                    const known = lintels.get(edgeKey("h", x, y))?.height ?? 1;
                    lintels.set(edgeKey("h", x, y), { x, y, height: known > piece.height ? known : piece.height });
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
                        ? {
                              orientation: "h",
                              x: item.x / size + 1,
                              y: (item.y + wallRise(piece.height)) / size,
                              height: piece.height,
                              ...(piece.glazed ? { glazed: true } : {}),
                          }
                        : {
                              orientation: "v",
                              x: (item.x + DOOR_VERTICAL_WIDTH / 2) / size,
                              y: (item.y + wallRise(piece.height) - WALL_THICKNESS) / size + 1,
                          };
                if (Number.isInteger(door.x) && Number.isInteger(door.y)) {
                    for (const edge of doorEdges(door)) {
                        setWall(edge.orientation, edge.x, edge.y, piece.tint, piece.height);
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
    for (const lintel of lintels.values()) {
        const wall = model.getWall("h", lintel.x, lintel.y);
        if (wall && wall.height < lintel.height) {
            model.setWall("h", wall.x, wall.y, wall.tint, lintel.height);
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
/** The eraser hits a vertical wall a little wider: it is only 12 px thick, easy to miss. */
export const ERASER_VERTICAL_HIT_WIDTH = 10;

/**
 * Wall segment under a world position, for the eraser. A vertical wall is thin: it is hit within a few pixels
 * of its line. A facade is hit anywhere on its cap and face.
 */
export function wallAtPoint(
    model: MapLayerModel,
    worldX: number,
    worldY: number,
    verticalHitWidth = VERTICAL_WALL_HIT_WIDTH,
): WallEdgeRef | undefined {
    const size = MAP_LAYER_TILE_SIZE;
    // The strip of the row y spans from the joint of its first vertex to the joint of the next one.
    const row = Math.floor((worldY - WALL_THICKNESS) / size);
    const nearestLine = Math.round(worldX / size);
    if (Math.abs(worldX - nearestLine * size) <= verticalHitWidth && model.hasWall("v", nearestLine, row)) {
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
    height: WallHeight = 1,
): void {
    for (const edge of edges) {
        const inside =
            edge.orientation === "h"
                ? edge.x >= 0 && edge.x < bounds.columns && edge.y >= 0 && edge.y < bounds.rows
                : edge.x >= 0 && edge.x <= bounds.columns && edge.y >= 0 && edge.y < bounds.rows;
        if (inside) {
            model.setWall(edge.orientation, edge.x, edge.y, tint, height);
        }
    }
}

/**
 * A room whose floor is the rectangle of tiles between `a` and `b`, all of it seen. A wall stands on the tile row of its
 * grid line: the north wall goes on the line above the rectangle (it stands on the row above, its foot on the top of
 * the rectangle) and the side walls reach up to it; at the top of the map, with no row above, it stays on the first row.
 * The south wall stands on the row under the rectangle, where the avatar walks up to its foot: that row gets the floor
 * of the room too, between the side walls, where it has none yet (a translucent high wall shows it). No floor is ever
 * removed, and none is laid under the north wall.
 */
export function applyRoom(
    model: MapLayerModel,
    a: Point,
    b: Point,
    tint: WallTint,
    family: FloorFamily,
    bounds: MapBounds,
    height: WallHeight = 1,
): void {
    const top = Math.min(a.y, b.y);
    const northRow = top > 0 ? top - 1 : top;
    applyWalls(model, roomWallEdges({ x: a.x, y: northRow }, { x: b.x, y: Math.max(a.y, b.y) }), tint, bounds, height);
    applyFloor(model, rectangleCells(a, b), family, bounds);
    const southRow = Math.max(a.y, b.y) + 1;
    const underSouthWall = rectangleCells(
        { x: Math.min(a.x, b.x), y: southRow },
        { x: Math.max(a.x, b.x), y: southRow },
    ).filter((cell) => model.getFloor(cell.x, cell.y) === undefined);
    applyFloor(model, underSouthWall, family, bounds);
}

/**
 * Erases what is under a position: a door or a window first (the walls it stands on stay as they were), else a wall,
 * else a floor. `keptEdges` collects the segments of the doors and windows erased, which a drag then leaves alone: one
 * pass of the eraser removes the door or the window, the next one the wall. Returns whether a door was erased: the floor around a door stays.
 */
export function eraseAt(
    model: MapLayerModel,
    worldX: number,
    worldY: number,
    keptEdges: Set<string> = new Set(),
    verticalHitWidth = VERTICAL_WALL_HIT_WIDTH,
): boolean {
    const wall = wallAtPoint(model, worldX, worldY, verticalHitWidth);
    if (wall) {
        if (keptEdges.has(edgeKey(wall.orientation, wall.x, wall.y))) {
            return false;
        }
        const door = model.getDoorOn(wall.orientation, wall.x, wall.y);
        if (door) {
            model.removeDoor(door);
            for (const edge of doorEdges(door)) {
                keptEdges.add(edgeKey(edge.orientation, edge.x, edge.y));
            }
            return true;
        }
        if (wall.orientation === "h" && model.removeWindow(wall.x, wall.y)) {
            keptEdges.add(edgeKey("h", wall.x, wall.y));
            return false;
        }
        model.removeWall(wall.orientation, wall.x, wall.y);
        return false;
    }
    const cell = cellAt(worldX, worldY);
    model.removeFloor(cell.x, cell.y);
    return false;
}

/** What the eraser would remove under a position, for the highlight shown before the click. */
export type EraseTarget =
    | { kind: "door"; door: DoorRef }
    | { kind: "window"; wall: WallEdgeRef }
    | { kind: "wall"; wall: WallEdgeRef }
    | { kind: "floor"; cell: Point };

export function eraseTargetAt(
    model: MapLayerModel,
    worldX: number,
    worldY: number,
    verticalHitWidth = VERTICAL_WALL_HIT_WIDTH,
): EraseTarget | undefined {
    const wall = wallAtPoint(model, worldX, worldY, verticalHitWidth);
    if (wall) {
        const door = model.getDoorOn(wall.orientation, wall.x, wall.y);
        if (door) return { kind: "door", door };
        return wall.orientation === "h" && model.hasWindow(wall.x, wall.y)
            ? { kind: "window", wall }
            : { kind: "wall", wall };
    }
    const cell = cellAt(worldX, worldY);
    return model.getFloor(cell.x, cell.y) ? { kind: "floor", cell } : undefined;
}

/**
 * The wall segments an eraser drag removes: the line of the wall it starts on (the row of a horizontal wall, the column
 * of a vertical one), from the start tile to the end tile, as the wall mode draws a line. Undefined when the drag
 * starts on no wall: it erases floors.
 */
export function wallEdgesToErase(model: MapLayerModel, start: Point, end: Point): WallEdgeRef[] | undefined {
    const first = wallAtPoint(model, start.x, start.y, ERASER_VERTICAL_HIT_WIDTH);
    if (!first) return undefined;
    const size = MAP_LAYER_TILE_SIZE;
    const target = first.orientation === "h" ? Math.floor(end.x / size) : Math.floor((end.y - WALL_THICKNESS) / size);
    const from = first.orientation === "h" ? first.x : first.y;
    const edges: WallEdgeRef[] = [];
    for (let at = Math.min(from, target); at <= Math.max(from, target); at++) {
        const edge: WallEdgeRef =
            first.orientation === "h"
                ? { orientation: "h", x: at, y: first.y }
                : { orientation: "v", x: first.x, y: at };
        if (model.hasWall(edge.orientation, edge.x, edge.y)) edges.push(edge);
    }
    return edges;
}

/** Removes the walls of an eraser drag (wallEdgesToErase), with the doors and windows they carry; floors stay. */
export function eraseWallsAlong(model: MapLayerModel, start: Point, end: Point): void {
    for (const edge of wallEdgesToErase(model, start, end) ?? []) {
        model.removeWall(edge.orientation, edge.x, edge.y);
    }
}

/** Removes the floors an eraser drag started on a floor passes over: its straight line and the tiles visited; walls stay. */
export function eraseFloorsAlong(model: MapLayerModel, start: Point, end: Point, path: readonly Point[]): void {
    // Steps shorter than a tile, so no tile of the line is jumped over.
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 8));
    for (let step = 0; step <= steps; step++) {
        const cell = cellAt(start.x + ((end.x - start.x) * step) / steps, start.y + ((end.y - start.y) * step) / steps);
        model.removeFloor(cell.x, cell.y);
    }
    for (const cell of path) model.removeFloor(cell.x, cell.y);
}

/** Pixel rectangle of a door itself: its opening along the wall (the swinging leaves are not counted). */
export function doorPixelRect(door: DoorRef): { x: number; y: number; width: number; height: number } {
    const size = MAP_LAYER_TILE_SIZE;
    return door.orientation === "h"
        ? { x: (door.x - 1) * size, y: door.y * size, width: 2 * size, height: size }
        : {
              x: door.x * size - WALL_HALF,
              y: (door.y - 1) * size + WALL_THICKNESS,
              width: WALL_THICKNESS,
              height: 2 * size - WALL_THICKNESS,
          };
}

/** The door placed on the wall segment under a world position, if any. */
export function doorUnderPoint(model: MapLayerModel, worldX: number, worldY: number): DoorRef | undefined {
    const wall = wallAtPoint(model, worldX, worldY);
    return wall ? model.getDoorOn(wall.orientation, wall.x, wall.y) : undefined;
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

/** The height chosen for the doors: one of the heights, or "auto", the height of the wall up to `DOOR_AUTO_MAX_HEIGHT`. */
export type DoorHeightSetting = WallHeight | "auto";
export const DOOR_AUTO_MAX_HEIGHT: WallHeight = 2;

/**
 * Height a door gets from the setting: in "auto", the one of its wall (the lower of its two walls), two tiles at most;
 * otherwise the chosen height, brought down to the one of its wall. A vertical door has no height: 1.
 */
export function doorHeightFor(model: MapLayerModel, door: DoorRef, setting: DoorHeightSetting): WallHeight {
    if (door.orientation === "v") return 1;
    const wall = model.lowerWallOf(door);
    const wanted = setting === "auto" ? DOOR_AUTO_MAX_HEIGHT : setting;
    return wanted > wall ? wall : wanted;
}

/**
 * What a click of the door mode does: place a door, change a placed horizontal door (the one under the pointer), or
 * nothing (no wall to take a door, nothing a click could change). A placed door gets the settings of the panel, its
 * height (Auto or chosen) and glazed or plain; when it has them already, a click flips it, glazed to plain or plain to
 * glazed, as long as the catalog has the glazed doors.
 */
export interface DoorPlan {
    door: DoorRef;
    height: WallHeight;
    glazed: boolean;
    action: "place" | "update" | "invalid";
}

/** Settings of the door mode, besides the height: the glazed switch, and what the catalogs have. */
export interface DoorPlanOptions {
    /** The switch of the panel, the glazed doors being in the catalog: whether new doors are glazed. */
    glazed?: boolean;
    /** Whether the catalog has the glazed doors (a plain door can only be made glazed then). */
    glazedAvailable?: boolean;
    /** Heights the catalogs have for the plain and the glazed doors; a door of another height goes back to 1. */
    heightsAvailable?: (glazed: boolean) => readonly WallHeight[];
}

export function planDoorAt(
    model: MapLayerModel,
    worldX: number,
    worldY: number,
    setting: DoorHeightSetting,
    options: DoorPlanOptions = {},
): DoorPlan {
    const heightOf = (door: DoorRef, glazed: boolean): WallHeight => {
        const height = doorHeightFor(model, door, setting);
        return options.heightsAvailable && !options.heightsAvailable(glazed).includes(height) ? 1 : height;
    };
    const candidate = doorCandidateAt(model, worldX, worldY);
    if (candidate.valid) {
        const door: DoorRef = { orientation: candidate.orientation, x: candidate.x, y: candidate.y };
        const glazed = door.orientation === "h" && options.glazed === true;
        return { door, height: heightOf(door, glazed), glazed, action: "place" };
    }
    const placed = doorUnderPoint(model, worldX, worldY);
    if (placed?.orientation !== "h") {
        const door: DoorRef = { orientation: candidate.orientation, x: candidate.x, y: candidate.y };
        return { door, height: doorHeightFor(model, door, setting), glazed: false, action: "invalid" };
    }
    const door: DoorRef = { orientation: "h", x: placed.x, y: placed.y };
    const wasGlazed = placed.glazed === true;
    const glazed = options.glazed === true;
    const height = heightOf(placed, glazed);
    if (height !== doorHeight(placed) || glazed !== wasGlazed) return { door, height, glazed, action: "update" };
    // The door has the settings already: a click flips it.
    if (!wasGlazed && options.glazedAvailable !== true) return { door, height, glazed, action: "invalid" };
    return { door, height: heightOf(placed, !wasGlazed), glazed: !wasGlazed, action: "update" };
}

export function applyDoorPlan(model: MapLayerModel, plan: DoorPlan, bounds: MapBounds): void {
    if (plan.action === "place") applyDoor(model, { ...plan.door, height: plan.height, glazed: plan.glazed }, bounds);
    if (plan.action === "update") {
        model.setDoorGlazed(plan.door, plan.glazed);
        model.setDoorHeight(plan.door, plan.height);
    }
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

/** A segment of a window drag, and whether a window can be set on it. */
export interface WindowEdgeCandidate {
    edge: WallEdgeRef;
    valid: boolean;
}

/**
 * The horizontal segments a window drag passes over, between the tiles under its start and its end. A facade fills
 * the tile row of its line, so the tile under the cursor is the segment itself: a click sets one window. Windows only
 * go on horizontal walls, so the drag stays on the row it started from.
 */
export function windowEdgesBetween(model: MapLayerModel, fromCell: Point, toCell: Point): WindowEdgeCandidate[] {
    const candidates: WindowEdgeCandidate[] = [];
    for (let x = Math.min(fromCell.x, toCell.x); x <= Math.max(fromCell.x, toCell.x); x++) {
        candidates.push({ edge: { orientation: "h", x, y: fromCell.y }, valid: model.canSetWindow(x, fromCell.y) });
    }
    return candidates;
}

/**
 * Moves the window of the segment under `fromCell` to the segment under `toCell` (any free horizontal wall). The walls
 * stay where they are. Without a window to move, or with a target that cannot take it, nothing changes.
 */
export function moveWindow(model: MapLayerModel, fromCell: Point, toCell: Point): boolean {
    const height = model.getWindowHeight(fromCell.x, fromCell.y);
    if (height === undefined) return false;
    model.removeWindow(fromCell.x, fromCell.y);
    if (model.setWindow(toCell.x, toCell.y, height)) return true;
    model.setWindow(fromCell.x, fromCell.y, height);
    return false;
}

/** Sets a window of the given height on each segment that can take one. Returns how many were set. */
export function applyWindows(model: MapLayerModel, edges: readonly WallEdgeRef[], height: WallHeight = 1): number {
    let count = 0;
    for (const edge of edges) {
        if (edge.orientation === "h" && model.setWindow(edge.x, edge.y, height)) count++;
    }
    return count;
}
