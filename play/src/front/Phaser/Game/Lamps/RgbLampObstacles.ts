import type { EntityPrefab } from "@workadventure/map-editor";
import { MathUtils } from "@workadventure/math-utils";
import { wallRise } from "../MapEditor/MapLayer/MapLayerCatalog";
import { getBlockingRectangles } from "../../../Utils/EntityHitbox";
import { getPrefabCollisionRectangles } from "../../../Utils/PrefabCollisionRectangles";
import type { ObstacleRectangle } from "../../../Utils/RectangleObstacles";
import { MAP_LAYER_TILE_SIZE, WALL_HALF } from "../MapEditor/MapLayer/MapLayerCatalog";
import { doorEdges, type DoorRef, type MapLayerModel, type WallEdgeRef } from "../MapEditor/MapLayer/MapLayerModel";
import {
    blockingCellSegments,
    rectangleSegments,
    segmentsNearLight,
    type LightDisc,
    type Segment,
} from "./RgbLampGeometry";

/**
 * Where a wall of the map layer stops the light: on the middle of its cap, the band drawn on the top of the wall. The
 * caps of the walls form one network (see MapLayerCatalog), and so do these segments: they meet exactly on the
 * vertices, no light leaks through a corner or a junction. The pathfinder barriers (`getWallBarriers`) come from the
 * same walls but follow the feet of the avatars, a row lower than the walls are drawn: a shadow would not start on the wall.
 */
function edgeSegment(edge: WallEdgeRef): Segment {
    const x = edge.x * MAP_LAYER_TILE_SIZE;
    const y = edge.y * MAP_LAYER_TILE_SIZE + WALL_HALF;
    return edge.orientation === "h"
        ? { ax: x, ay: y, bx: x + MAP_LAYER_TILE_SIZE, by: y }
        : { ax: x, ay: y, bx: x, by: y + MAP_LAYER_TILE_SIZE };
}

/** The walls of the map layer as segments that stop the light. A closed door is a wall; an open one lets the light through. */
export function wallSegments(model: MapLayerModel, isDoorOpen: (door: DoorRef) => boolean): Segment[] {
    const segments: Segment[] = [];
    // The sides of the faces of the high walls, each once: two pieces side by side share one.
    const sides = new Set<string>();
    const push = (edge: WallEdgeRef): void => {
        const segment = edgeSegment(edge);
        const rise = edge.orientation === "h" ? wallRise(model.getWall("h", edge.x, edge.y)?.height ?? 1) : 0;
        if (rise === 0) {
            segments.push(segment);
            return;
        }
        // A high horizontal wall is drawn up to its cap, above its foot: the light stops there, so that the whole
        // face is lit from the south and none of it from the room behind.
        segments.push({ ...segment, ay: segment.ay - rise, by: segment.by - rise });
        // A side only where the face ends or where a wall leaves it towards the south: between two pieces of the
        // same wall it would cast a shadow on the face, for a light close to the wall.
        for (const [vertex, neighbour] of [
            [edge.x, edge.x - 1],
            [edge.x + 1, edge.x + 1],
        ]) {
            const sameWall = wallRise(model.getWall("h", neighbour, edge.y)?.height ?? 1) === rise;
            if (sameWall && !model.getWall("v", vertex, edge.y)) continue;
            const x = vertex * MAP_LAYER_TILE_SIZE;
            const key = `${x},${segment.ay}`;
            if (sides.has(key)) continue;
            sides.add(key);
            segments.push({ ax: x, ay: segment.ay - rise, bx: x, by: segment.ay });
        }
    };
    for (const wall of model.getWalls()) {
        // The walls stay in the model under a door: the door decides.
        if (!model.getDoorOn(wall.orientation, wall.x, wall.y)) push(wall);
    }
    for (const door of model.getDoors()) {
        if (!isDoorOpen(door)) doorEdges(door).forEach(push);
    }
    return segments;
}

/**
 * What a tall object (`castsShadow` in its catalog entry) stops the light with, in map pixels: its declared collision
 * rectangles, else the blocking cells of its grid, wherever it stands. Nothing for the other objects (a low table lets
 * the light pass), nor for one that walks around (its image is hidden).
 */
export function shadowRectangles(
    prefab: Partial<Pick<EntityPrefab, "castsShadow" | "collisionRectangles" | "collisionGrid" | "wander">>,
    topLeft: { x: number; y: number },
    cellSize: number,
): ObstacleRectangle[] {
    if (prefab.castsShadow !== true || prefab.wander) {
        return [];
    }
    return getPrefabCollisionRectangles(topLeft, getBlockingRectangles(prefab, cellSize));
}

/** Everything of the map that can stop a light. */
export interface LightObstacles {
    /** The collision grid of the tiles of the map (not of its objects: a low object lets the light pass). */
    grid: readonly (readonly number[])[];
    tileSize: number;
    /** The walls of the map layer (see wallSegments). */
    walls: readonly Segment[];
    /** The tall objects (see shadowRectangles). */
    rectangles: readonly ObstacleRectangle[];
}

/**
 * The segments that stop one light: those that touch the disc it reaches. A tall object the light stands in is left
 * out (a lamp put on a cupboard still shines), as is the cell of the grid it stands in.
 */
export function obstacleSegments(light: LightDisc, obstacles: LightObstacles): Segment[] {
    const around = obstacles.rectangles.filter((rectangle) => !MathUtils.isOverlappingWithRectangle(light, rectangle));
    return segmentsNearLight(
        [
            ...blockingCellSegments(obstacles.grid, obstacles.tileSize, light),
            ...obstacles.walls,
            ...around.flatMap(rectangleSegments),
        ],
        light,
    );
}
