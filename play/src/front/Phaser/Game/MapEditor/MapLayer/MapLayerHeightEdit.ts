/**
 * The "Height" mode of the map layer tool: which wall, door or window a click or a drag picks, and how a height is
 * applied to them. Pure and without Phaser: the tool draws and commits.
 */
import type { Rect } from "../../Outdoor/OutdoorGrid";
import { computePlacements } from "./MapLayerAutotile";
import {
    MAP_LAYER_TILE_SIZE,
    WALL_HALF,
    WALL_THICKNESS,
    DOOR_VERTICAL_WIDTH,
    facadeLeftExtension,
    mapLayerGroundBottom,
    mapLayerPieceSize,
    parseMapLayerPrefab,
    wallRise,
} from "./MapLayerCatalog";
import type { WallHeight } from "./MapLayerCatalog";
import { doorEdges, doorHeight, edgeKey } from "./MapLayerModel";
import type { DoorRef, MapLayerModel, WallEdgeRef } from "./MapLayerModel";
import type { Point } from "./MapLayerOperations";

/**
 * What a height applies to: a wall segment, a horizontal door (told by its middle vertex), or the window of a segment.
 * A vertical door has no height of its own: picking it picks its two wall segments.
 */
export type HeightTarget =
    | { kind: "wall"; edge: WallEdgeRef }
    | { kind: "door"; door: DoorRef }
    | { kind: "window"; edge: WallEdgeRef };

function targetKey(target: HeightTarget): string {
    switch (target.kind) {
        case "wall":
            return `wall ${edgeKey(target.edge.orientation, target.edge.x, target.edge.y)}`;
        case "window":
            return `window ${edgeKey("h", target.edge.x, target.edge.y)}`;
        case "door":
            return `door ${edgeKey(target.door.orientation, target.door.x, target.door.y)}`;
    }
}

/** One sprite of the map layer and what picking it picks. */
interface PickableSprite {
    target: HeightTarget;
    /** The wall segment the sprite stands on: a drag starting on it runs along its line. */
    edge: WallEdgeRef;
    /** Height of the wall of that segment, which raises the strips of a vertical wall. */
    wallHeight: WallHeight;
    rect: Rect;
    /** Bottom of the sprite on the ground: the one the farthest south is drawn in front. */
    groundBottom: number;
    /** A lintel covers the cap of the door or the window under it. */
    lintel: boolean;
}

function doorRefOf(door: DoorRef): DoorRef {
    return { orientation: door.orientation, x: door.x, y: door.y };
}

/** The sprites of the walls, doors and windows of a model, with what each one picks. */
function pickableSprites(model: MapLayerModel): PickableSprite[] {
    const size = MAP_LAYER_TILE_SIZE;
    const sprites: PickableSprite[] = [];
    for (const placement of computePlacements(model)) {
        const piece = parseMapLayerPrefab(placement.collectionName, placement.prefabId);
        if (!piece || piece.kind === "floor" || piece.kind === "joint") continue;
        const rise = wallRise(piece.height);
        let edge: WallEdgeRef;
        let target: HeightTarget | undefined;
        switch (piece.kind) {
            case "facade":
            case "lintel":
            case "window": {
                edge = {
                    orientation: "h",
                    x: (placement.x + facadeLeftExtension(piece.ends)) / size,
                    y: (placement.y + rise) / size,
                };
                target = piece.kind === "window" ? { kind: "window", edge } : { kind: "wall", edge };
                break;
            }
            case "vertical":
                edge = {
                    orientation: "v",
                    x: (placement.x + WALL_HALF) / size,
                    y: (placement.y + rise - WALL_THICKNESS) / size,
                };
                target = { kind: "wall", edge };
                break;
            case "end":
                // The south face of the wall that ends on the vertex: the wall of the row above it.
                edge = {
                    orientation: "v",
                    x: (placement.x + WALL_HALF) / size,
                    y: (placement.y + rise - WALL_THICKNESS) / size - 1,
                };
                target = { kind: "wall", edge };
                break;
            case "door": {
                edge =
                    piece.orientation === "h"
                        ? { orientation: "h", x: placement.x / size, y: (placement.y + rise) / size }
                        : {
                              orientation: "v",
                              x: (placement.x + DOOR_VERTICAL_WIDTH / 2) / size,
                              y: (placement.y + rise - WALL_THICKNESS) / size,
                          };
                const door = model.getDoorOn(edge.orientation, edge.x, edge.y);
                if (door) target = { kind: "door", door: doorRefOf(door) };
                break;
            }
        }
        const wall = model.getWall(edge.orientation, edge.x, edge.y);
        if (!target || !wall) continue;
        sprites.push({
            target,
            edge,
            wallHeight: wall.height,
            rect: { x: placement.x, y: placement.y, ...mapLayerPieceSize(piece) },
            groundBottom: mapLayerGroundBottom(piece, placement.y),
            lintel: piece.kind === "lintel",
        });
    }
    return sprites;
}

function contains(rect: Rect, point: Point): boolean {
    return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

/** A picked target as a selection: a vertical door is its two wall segments. */
function selectTarget(target: HeightTarget | undefined): HeightTarget[] {
    if (!target) return [];
    if (target.kind === "door" && target.door.orientation === "v") {
        return doorEdges(target.door).map((edge) => ({ kind: "wall", edge }));
    }
    return [target];
}

/** What picks the walls, doors and windows of one state of the map: built once, asked on every move of the pointer. */
export interface HeightPicker {
    /** The element under a point: anywhere on its sprite, the one whose foot is the farthest south. */
    at(x: number, y: number): HeightTarget | undefined;
    /** A picked element as a selection. */
    select(target: HeightTarget | undefined): HeightTarget[];
    /**
     * The selection of a drag. Staying on one segment picks the element under the pointer; going further picks the
     * segments of the line of that segment, from it to the one under the end, each with the door or the window it
     * carries. Starting in the void picks nothing.
     */
    along(from: Point, to: Point): HeightTarget[];
    /** The sprites of a selection, to highlight it. */
    rects(targets: readonly HeightTarget[]): Rect[];
}

export function buildHeightPicker(model: MapLayerModel): HeightPicker {
    const sprites = pickableSprites(model);
    const spriteAt = (point: Point): PickableSprite | undefined => {
        let best: PickableSprite | undefined;
        for (const sprite of sprites) {
            if (!contains(sprite.rect, point)) continue;
            const better =
                !best ||
                sprite.groundBottom > best.groundBottom ||
                (sprite.groundBottom === best.groundBottom && sprite.lintel && !best.lintel);
            if (better) best = sprite;
        }
        return best;
    };
    return {
        at: (x, y) => spriteAt({ x, y })?.target,
        select: selectTarget,
        along: (from, to) => {
            const start = spriteAt(from);
            if (!start) return [];
            const size = MAP_LAYER_TILE_SIZE;
            const { edge } = start;
            const last =
                edge.orientation === "h"
                    ? Math.floor(to.x / size)
                    : Math.floor((to.y + wallRise(start.wallHeight) - WALL_THICKNESS) / size);
            const first = edge.orientation === "h" ? edge.x : edge.y;
            if (last === first) return selectTarget(start.target);
            const targets: HeightTarget[] = [];
            const seen = new Set<string>();
            const add = (target: HeightTarget): void => {
                const key = targetKey(target);
                if (seen.has(key)) return;
                seen.add(key);
                targets.push(target);
            };
            for (let index = Math.min(first, last); index <= Math.max(first, last); index++) {
                const segment: WallEdgeRef =
                    edge.orientation === "h"
                        ? { orientation: "h", x: index, y: edge.y }
                        : { orientation: "v", x: edge.x, y: index };
                if (!model.hasWall(segment.orientation, segment.x, segment.y)) continue;
                add({ kind: "wall", edge: segment });
                const door = model.getDoorOn(segment.orientation, segment.x, segment.y);
                if (door && door.orientation === "h") add({ kind: "door", door: doorRefOf(door) });
                if (segment.orientation === "h" && model.hasWindow(segment.x, segment.y)) {
                    add({ kind: "window", edge: segment });
                }
            }
            return targets;
        },
        rects: (targets) => {
            const wanted = new Set(targets.map(targetKey));
            return sprites.filter((sprite) => wanted.has(targetKey(sprite.target))).map((sprite) => sprite.rect);
        },
    };
}

/** Height of each element of a selection that is still on the map. */
function heightOf(model: MapLayerModel, target: HeightTarget): WallHeight | undefined {
    switch (target.kind) {
        case "wall":
            return model.getWall(target.edge.orientation, target.edge.x, target.edge.y)?.height;
        case "window":
            return model.getWindowHeight(target.edge.x, target.edge.y);
        case "door": {
            const door = model.getDoorOn(target.door.orientation, target.door.x, target.door.y);
            return door && door.x === target.door.x && door.y === target.door.y ? doorHeight(door) : undefined;
        }
    }
}

/** The height shared by every element of a selection; undefined for an empty or a mixed selection. */
export function selectionHeight(model: MapLayerModel, targets: readonly HeightTarget[]): WallHeight | undefined {
    let common: WallHeight | undefined;
    for (const target of targets) {
        const height = heightOf(model, target);
        if (height === undefined) continue;
        if (common !== undefined && common !== height) return undefined;
        common = height;
    }
    return common;
}

/**
 * Gives a selection a height. The walls first, keeping their tint (lowering a wall lowers the door or the window it
 * carries), then the doors and the windows, never above their wall. What is no longer on the map is left out.
 */
export function applyHeight(model: MapLayerModel, targets: readonly HeightTarget[], height: WallHeight): void {
    for (const target of targets) {
        if (target.kind !== "wall") continue;
        const wall = model.getWall(target.edge.orientation, target.edge.x, target.edge.y);
        if (wall) model.setWall(wall.orientation, wall.x, wall.y, wall.tint, height);
    }
    for (const target of targets) {
        if (target.kind === "door") model.setDoorHeight(target.door, height);
        if (target.kind === "window") model.setWindowHeight(target.edge.x, target.edge.y, height);
    }
}
