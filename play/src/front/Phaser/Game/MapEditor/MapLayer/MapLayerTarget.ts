/**
 * What the "Map" tool points at: the one element a click or a drag of the eraser removes, and of the window and stair
 * modes picks up, with its outline as it is drawn on the screen. Pure and without Phaser: the tool draws the outline
 * of the target it finds and commits the change of the target found again on the map read just before the commit,
 * with the same functions, so the highlight and the action cannot disagree.
 *
 * Every point and every outline here is on the screen (the world of Phaser): a raised floor, and the walls standing on
 * it, are drawn their altitude further north than the tiles they cover.
 */
import type { Rect } from "../../Outdoor/OutdoorGrid";
import { MAP_LAYER_TILE_SIZE, WALL_HALF, WALL_THICKNESS, wallRise } from "./MapLayerCatalog";
import { slabImagePosition, stairImagePosition } from "./FloorModel";
import type { FloorModel, PlacedStair } from "./FloorModel";
import { floorCellAt, removeStairAt, stairUnderPoint } from "./FloorOperations";
import { stairScreenBox } from "./MapLayerFloors";
import type { TilePoint } from "./MapLayerFloors";
import type { HeightPicker, HeightTarget } from "./MapLayerHeightEdit";
import { doorEdges } from "./MapLayerModel";
import type { DoorRef, MapLayerModel, WallEdgeRef } from "./MapLayerModel";
import { ERASER_VERTICAL_HIT_WIDTH, doorPixelRect, eraseTargetAt, floorCellsAlong } from "./MapLayerOperations";
import type { Point } from "./MapLayerOperations";

/** The map as the tool reads it for one level. */
export interface TargetScene {
    /** The walls, doors and windows of the level edited (and the floors of the ground), as if they stood on the ground. */
    walls: MapLayerModel;
    /** What picks the sprites of `walls`. */
    picker: HeightPicker;
    /** The raised floors of the whole map: slabs and stairs. */
    floors: FloorModel;
    /** The altitude of the level edited, 0 for the ground. */
    level: number;
}

/**
 * An element of the map told by what stays true from one reading of the map to the next (a stair by its floor and its
 * first step, a wall by its segment), never by an object of a model: the commit finds it again on a fresh model.
 */
export type MapLayerTargetRef =
    | { kind: "stair"; base: number; foot: TilePoint }
    | { kind: "door"; door: DoorRef }
    | { kind: "window"; edge: WallEdgeRef }
    | { kind: "wall"; edge: WallEdgeRef }
    | { kind: "slab"; level: number; cell: TilePoint }
    | { kind: "floor"; cell: TilePoint };

export interface MapLayerTarget {
    ref: MapLayerTargetRef;
    /** Where it is drawn, on the screen. */
    outline: Rect[];
}

/** The order the eraser tries: a stair or a ramp, then a door, a window, a wall, then a slab, then a floor. */
export const ERASE_PRIORITY: readonly MapLayerTargetRef["kind"][] = [
    "stair",
    "door",
    "window",
    "wall",
    "slab",
    "floor",
];

const size = MAP_LAYER_TILE_SIZE;

/** Where a stair (or a ramp) is drawn on the screen: its whole image. */
export function stairOutline(stair: PlacedStair): Rect {
    const image = stairImagePosition(stair.shape, stair.foot, stair.base);
    const box = stairScreenBox(stair.shape, stair.foot);
    return { x: image.x, y: image.y, width: box.width, height: box.height };
}

function contains(rect: Rect, point: Point): boolean {
    return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

/** The stair whose image is under a point of the screen, whatever the floor it starts from; the last placed first. */
export function stairImageUnderPoint(floors: FloorModel, x: number, y: number): PlacedStair | undefined {
    return [...floors.getStairs()].reverse().find((stair) => contains(stairOutline(stair), { x, y }));
}

function stairTarget(stair: PlacedStair): MapLayerTarget {
    return { ref: { kind: "stair", base: stair.base, foot: { ...stair.foot } }, outline: [stairOutline(stair)] };
}

/** A placed stair (or ramp) under a point of the screen, whatever the floor it starts from: the one the stair mode moves. */
export function stairTargetUnder(scene: TargetScene, screen: Point): MapLayerTarget | undefined {
    const stair = stairUnderPoint(scene.floors, scene.level, screen.x, screen.y);
    return stair ? stairTarget(stair) : undefined;
}

/** What the height picker knows of a wall, door or window, for its sprites. */
function heightTargetOf(ref: MapLayerTargetRef): HeightTarget | undefined {
    switch (ref.kind) {
        case "wall":
            return { kind: "wall", edge: ref.edge };
        case "window":
            return { kind: "window", edge: ref.edge };
        case "door":
            return { kind: "door", door: { orientation: ref.door.orientation, x: ref.door.x, y: ref.door.y } };
        default:
            return undefined;
    }
}

/** The rectangle of a wall, a window or a door at its foot, for an element whose sprites are not found. */
function footRect(ref: MapLayerTargetRef): Rect | undefined {
    switch (ref.kind) {
        case "door":
            return doorPixelRect(ref.door);
        case "window":
            return { x: ref.edge.x * size, y: ref.edge.y * size, width: size, height: size };
        case "wall":
            return ref.edge.orientation === "h"
                ? { x: ref.edge.x * size, y: ref.edge.y * size, width: size, height: size }
                : {
                      x: ref.edge.x * size - WALL_HALF,
                      y: ref.edge.y * size + WALL_THICKNESS,
                      width: WALL_THICKNESS,
                      height: size - WALL_THICKNESS,
                  };
        default:
            return undefined;
    }
}

/** Where a wall, a window or a door of the level edited is drawn on the screen: its whole sprites. */
function wallOutline(scene: TargetScene, refs: readonly MapLayerTargetRef[]): Rect[] {
    const targets = refs.map(heightTargetOf).filter((target): target is HeightTarget => target !== undefined);
    let rects = scene.picker.rects(targets);
    if (rects.length === 0) {
        rects = refs.map(footRect).filter((rect): rect is Rect => rect !== undefined);
    }
    return rects.map((rect) => ({ ...rect, y: rect.y - scene.level }));
}

/** A wall segment seen by the eraser: the door or the window it carries before the wall itself. */
function wallRefOn(walls: MapLayerModel, edge: WallEdgeRef): MapLayerTargetRef {
    const door = walls.getDoorOn(edge.orientation, edge.x, edge.y);
    if (door) return { kind: "door", door: { orientation: door.orientation, x: door.x, y: door.y } };
    if (edge.orientation === "h" && walls.hasWindow(edge.x, edge.y)) return { kind: "window", edge: { ...edge } };
    return { kind: "wall", edge: { ...edge } };
}

/** The edge a door, a window or a wall stands on: the first segment of a door. */
function edgeOf(ref: MapLayerTargetRef): WallEdgeRef | undefined {
    switch (ref.kind) {
        case "wall":
        case "window":
            return ref.edge;
        case "door":
            return doorEdges(ref.door)[0];
        default:
            return undefined;
    }
}

interface WallHit {
    ref: MapLayerTargetRef;
    edge: WallEdgeRef;
    /** How much higher than its foot the wall is drawn where it was hit: 0 when hit at its foot. */
    rise: number;
}

/**
 * The wall, door or window under a point of the ground (of the level edited): anywhere on its sprites (the raised top of
 * a high wall included), else at its foot, a vertical wall a few pixels around its line.
 */
function wallHitAt(walls: MapLayerModel, picker: HeightPicker, ground: Point): WallHit | undefined {
    const picked = picker.at(ground.x, ground.y);
    if (picked) {
        const edge = picked.kind === "door" ? doorEdges(picked.door)[0] : picked.edge;
        const ref: MapLayerTargetRef =
            picked.kind === "door"
                ? { kind: "door", door: { orientation: picked.door.orientation, x: picked.door.x, y: picked.door.y } }
                : wallRefOn(walls, picked.edge);
        const height = walls.getWall(edge.orientation, edge.x, edge.y)?.height ?? 1;
        return { ref, edge, rise: wallRise(height) };
    }
    const foot = eraseTargetAt(walls, ground.x, ground.y, ERASER_VERTICAL_HIT_WIDTH);
    if (!foot || foot.kind === "floor") return undefined;
    const ref: MapLayerTargetRef =
        foot.kind === "door"
            ? { kind: "door", door: { orientation: foot.door.orientation, x: foot.door.x, y: foot.door.y } }
            : { kind: foot.kind, edge: { ...foot.wall } };
    const edge = edgeOf(ref);
    return edge ? { ref, edge, rise: 0 } : undefined;
}

function groundOf(scene: TargetScene, screen: Point): Point {
    return { x: screen.x, y: screen.y + scene.level };
}

function slabTarget(level: number, cell: TilePoint): MapLayerTarget {
    const image = slabImagePosition(cell, level);
    return { ref: { kind: "slab", level, cell: { ...cell } }, outline: [{ ...image, width: size, height: size }] };
}

function floorTarget(cell: TilePoint): MapLayerTarget {
    return {
        ref: { kind: "floor", cell: { ...cell } },
        outline: [{ x: cell.x * size, y: cell.y * size, width: size, height: size }],
    };
}

/** What a click of the eraser removes under a point of the screen, in the order of `ERASE_PRIORITY`. */
export function eraseTargetUnder(scene: TargetScene, screen: Point): MapLayerTarget | undefined {
    const stair = stairTargetUnder(scene, screen);
    if (stair) return stair;
    const wall = wallHitAt(scene.walls, scene.picker, groundOf(scene, screen));
    if (wall) return { ref: wall.ref, outline: wallOutline(scene, [wall.ref]) };
    const cell = floorCellAt(screen.x, screen.y, scene.level);
    if (scene.level > 0) {
        return scene.floors.hasSlab(scene.level, cell.x, cell.y) ? slabTarget(scene.level, cell) : undefined;
    }
    return scene.walls.getFloor(cell.x, cell.y) ? floorTarget(cell) : undefined;
}

/** A placed window under a point of the screen, on its pane or its lintel: the one the window mode moves. */
export function windowTargetUnder(scene: TargetScene, screen: Point): MapLayerTarget | undefined {
    const wall = wallHitAt(scene.walls, scene.picker, groundOf(scene, screen));
    return wall?.ref.kind === "window" ? { ref: wall.ref, outline: wallOutline(scene, [wall.ref]) } : undefined;
}

/** The wall segments of the line of `edge`, from it to the one under `end` (a point of the ground), that have a wall. */
function wallLine(walls: MapLayerModel, edge: WallEdgeRef, end: Point, rise: number): WallEdgeRef[] {
    const first = edge.orientation === "h" ? edge.x : edge.y;
    const last =
        edge.orientation === "h" ? Math.floor(end.x / size) : Math.floor((end.y + rise - WALL_THICKNESS) / size);
    const edges: WallEdgeRef[] = [];
    for (let at = Math.min(first, last); at <= Math.max(first, last); at++) {
        const segment: WallEdgeRef =
            edge.orientation === "h" ? { orientation: "h", x: at, y: edge.y } : { orientation: "v", x: edge.x, y: at };
        if (walls.hasWall(segment.orientation, segment.x, segment.y)) edges.push(segment);
    }
    return edges;
}

function rectangleCells(a: TilePoint, b: TilePoint): TilePoint[] {
    const cells: TilePoint[] = [];
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
        for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) cells.push({ x, y });
    }
    return cells;
}

export interface ErasePlan {
    refs: MapLayerTargetRef[];
    outline: Rect[];
}

/**
 * What an eraser gesture removes, from `start` to `end` (points of the screen). What it starts on decides: a stair, the
 * stair; a wall, a door or a window, that element on a click and the walls of its line (with what they carry) on a drag
 * along it; anything else, the slabs of the rectangle on a raised floor, the floors passed over on the ground (`path`:
 * the tiles visited, on the ground).
 */
export function erasePlan(scene: TargetScene, start: Point, end: Point, path: readonly Point[]): ErasePlan {
    const stair = stairTargetUnder(scene, start);
    if (stair) return { refs: [stair.ref], outline: stair.outline };
    const wall = wallHitAt(scene.walls, scene.picker, groundOf(scene, start));
    if (wall) {
        const line = wallLine(scene.walls, wall.edge, groundOf(scene, end), wall.rise);
        if (!goesAlong(scene, wall, end, line)) return { refs: [wall.ref], outline: wallOutline(scene, [wall.ref]) };
        const refs: MapLayerTargetRef[] = line.map((edge) => ({ kind: "wall", edge }));
        // A wall removed takes the door and the window it carries: they are outlined with it.
        return { refs, outline: wallOutline(scene, [...refs, ...line.map((edge) => wallRefOn(scene.walls, edge))]) };
    }
    if (scene.level > 0) {
        const targets = rectangleCells(
            floorCellAt(start.x, start.y, scene.level),
            floorCellAt(end.x, end.y, scene.level),
        )
            .filter((cell) => scene.floors.hasSlab(scene.level, cell.x, cell.y))
            .map((cell) => slabTarget(scene.level, cell));
        return { refs: targets.map((target) => target.ref), outline: targets.flatMap((target) => target.outline) };
    }
    const seen = new Set<string>();
    const targets: MapLayerTarget[] = [];
    for (const cell of floorCellsAlong(start, end, path)) {
        const key = `${cell.x},${cell.y}`;
        if (seen.has(key) || !scene.walls.getFloor(cell.x, cell.y)) continue;
        seen.add(key);
        targets.push(floorTarget(cell));
    }
    return { refs: targets.map((target) => target.ref), outline: targets.flatMap((target) => target.outline) };
}

function sameEdge(a: WallEdgeRef, b: WallEdgeRef): boolean {
    return a.orientation === b.orientation && a.x === b.x && a.y === b.y;
}

function sameRef(a: MapLayerTargetRef, b: MapLayerTargetRef): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether an eraser gesture started on a wall, a door or a window runs along the line of its wall: it ends on another
 * element, and the segments it passes over are not only the ones of the element it started on (the two leaves of a
 * door are one door). Otherwise it is a click on that element.
 */
function goesAlong(scene: TargetScene, start: WallHit, end: Point, line: readonly WallEdgeRef[]): boolean {
    const endHit = wallHitAt(scene.walls, scene.picker, groundOf(scene, end));
    if (endHit && sameRef(endHit.ref, start.ref)) return false;
    const own = start.ref.kind === "door" ? doorEdges(start.ref.door) : [start.edge];
    return line.some((edge) => !own.some((mine) => sameEdge(mine, edge)));
}

/** Whether a target lives in the walls of a level (else in the raised floors). */
export function isWallLayerRef(ref: MapLayerTargetRef): boolean {
    return ref.kind === "door" || ref.kind === "window" || ref.kind === "wall" || ref.kind === "floor";
}

/**
 * Removes the targets of a plan from fresh models of the map: `walls` the walls of the level edited, `floors` the raised
 * floors.
 * A model left out keeps its targets. Returns whether something was removed.
 */
export function applyErase(
    refs: readonly MapLayerTargetRef[],
    walls: MapLayerModel | undefined,
    floors: FloorModel | undefined,
): boolean {
    let changed = false;
    for (const ref of refs) {
        switch (ref.kind) {
            case "stair":
                // A removed stair gets its well closed with the floor around it.
                if (floors && removeStairAt(floors, ref.base, ref.foot)) changed = true;
                break;
            case "slab":
                if (floors?.removeSlab(ref.level, ref.cell.x, ref.cell.y)) changed = true;
                break;
            case "door": {
                const [first] = doorEdges(ref.door);
                if (walls?.getDoorOn(first.orientation, first.x, first.y)) {
                    walls.removeDoor(ref.door);
                    changed = true;
                }
                break;
            }
            case "window":
                if (walls?.removeWindow(ref.edge.x, ref.edge.y)) changed = true;
                break;
            case "wall":
                if (walls?.removeWall(ref.edge.orientation, ref.edge.x, ref.edge.y)) changed = true;
                break;
            case "floor":
                if (walls?.removeFloor(ref.cell.x, ref.cell.y)) changed = true;
                break;
        }
    }
    return changed;
}
