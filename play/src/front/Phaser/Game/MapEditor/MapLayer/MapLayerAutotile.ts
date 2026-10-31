import {
    MAP_LAYER_DOOR_COLLECTION,
    WALL_HALF,
    WALL_THICKNESS,
    facadePrefabName,
    floorPrefabName,
    jointPrefabName,
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_TILE_SIZE,
    DOOR_VERTICAL_WIDTH,
    MAP_LAYER_WALL_COLLECTION,
    doorPrefabName,
    facadeLeftExtension,
    mapLayerPrefabId,
    verticalWallPrefabName,
    wallEndPrefabName,
} from "./MapLayerCatalog";
import type { FacadeEnds, JointArm } from "./MapLayerCatalog";
import type { MapLayerModel } from "./MapLayerModel";

/** One entity the model needs, at a pixel position (top-left corner of its sprite). */
export interface MapLayerPlacement {
    key: string;
    collectionName: string;
    prefabId: string;
    x: number;
    y: number;
}

export function placementKey(collectionName: string, prefabId: string, x: number, y: number): string {
    return JSON.stringify([collectionName, prefabId, x, y]);
}

function placement(collectionName: string, name: string, x: number, y: number): MapLayerPlacement {
    const prefabId = mapLayerPrefabId(collectionName, name);
    return { key: placementKey(collectionName, prefabId, x, y), collectionName, prefabId, x, y };
}

function endsOf(continuesLeft: boolean, continuesRight: boolean): FacadeEnds {
    if (!continuesLeft && !continuesRight) return "single";
    if (!continuesLeft) return "left";
    if (!continuesRight) return "right";
    return "mid";
}

/**
 * A horizontal door replaces the whole wall on its two segments, cap included, and draws the ends of the wall itself
 * (its jambs): the walls next to it continue up to it, with no end of their own, and the vertices it touches get no
 * horizontal arm. A vertical door is drawn between its joints, which stay.
 */
function jointArmsAt(model: MapLayerModel, x: number, y: number): JointArm[] {
    const arms: JointArm[] = [];
    const touchesDoor = model.getDoorOn("h", x, y) !== undefined || model.getDoorOn("h", x - 1, y) !== undefined;
    if (model.hasWall("v", x, y - 1)) arms.push("N");
    if (!touchesDoor && model.hasWall("h", x, y)) arms.push("E");
    if (model.hasWall("v", x, y)) arms.push("S");
    if (!touchesDoor && model.hasWall("h", x - 1, y)) arms.push("W");
    return arms;
}

/**
 * Chooses the sprites of a model.
 * - A floor cell uses the plain tile of its family, or the shaded one when a horizontal wall stands on the tile row
 *   right before it (the wall casts its shadow on the top of the tile, fading downwards).
 * - A horizontal wall stands entirely on the tile row of its grid line: cap on the top 12 px, face on the 20 px below.
 *   It is a facade (cap and south face) in one piece per grid column. Its face is seamless with the
 *   next facade and closes with an end when the wall stops on a vertex.
 * - A vertical wall is a strip, one piece per grid row.
 * - The caps meet on each vertex: a joint piece draws the corner, the T or the cross, or closes the end of a wall.
 */
export function computePlacements(model: MapLayerModel): MapLayerPlacement[] {
    const placements: MapLayerPlacement[] = [];
    const size = MAP_LAYER_TILE_SIZE;
    const vertices = new Map<string, { x: number; y: number }>();

    for (const floor of model.getFloors()) {
        // A door leaves the doorway open, so the wall under it casts no shadow.
        const shaded = model.hasWall("h", floor.x, floor.y - 1) && !model.getDoorOn("h", floor.x, floor.y - 1);
        const name = floorPrefabName(floor.family, shaded ? "ombre" : "uni");
        placements.push(placement(MAP_LAYER_FLOOR_COLLECTION, name, floor.x * size, floor.y * size));
    }

    for (const door of model.getDoors()) {
        const tint = model.getWall(
            door.orientation,
            door.x - (door.orientation === "h" ? 1 : 0),
            door.y - (door.orientation === "v" ? 1 : 0),
        )?.tint;
        if (tint === undefined) continue;
        if (door.orientation === "h") {
            placements.push(
                placement(
                    MAP_LAYER_DOOR_COLLECTION,
                    doorPrefabName("h", tint, "g"),
                    (door.x - 1) * size,
                    door.y * size,
                ),
                placement(MAP_LAYER_DOOR_COLLECTION, doorPrefabName("h", tint, "d"), door.x * size, door.y * size),
            );
        } else {
            const x = door.x * size - DOOR_VERTICAL_WIDTH / 2;
            placements.push(
                placement(
                    MAP_LAYER_DOOR_COLLECTION,
                    doorPrefabName("v", tint, "haut"),
                    x,
                    (door.y - 1) * size + WALL_THICKNESS,
                ),
                placement(
                    MAP_LAYER_DOOR_COLLECTION,
                    doorPrefabName("v", tint, "bas"),
                    x,
                    door.y * size + WALL_THICKNESS,
                ),
            );
        }
    }

    for (const wall of model.getWalls()) {
        // The walls under a door are drawn by the door itself; their vertices still get their joints.
        if (model.getDoorOn(wall.orientation, wall.x, wall.y)) {
            const ends =
                wall.orientation === "h"
                    ? [
                          [wall.x, wall.y],
                          [wall.x + 1, wall.y],
                      ]
                    : [
                          [wall.x, wall.y],
                          [wall.x, wall.y + 1],
                      ];
            for (const [vx, vy] of ends) vertices.set(`${vx},${vy}`, { x: vx, y: vy });
            continue;
        }
        if (wall.orientation === "h") {
            const ends = endsOf(model.hasWall("h", wall.x - 1, wall.y), model.hasWall("h", wall.x + 1, wall.y));
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    facadePrefabName(wall.tint, ends),
                    wall.x * size - facadeLeftExtension(ends),
                    wall.y * size,
                ),
            );
            vertices.set(`${wall.x},${wall.y}`, { x: wall.x, y: wall.y });
            vertices.set(`${wall.x + 1},${wall.y}`, { x: wall.x + 1, y: wall.y });
        } else {
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    verticalWallPrefabName(wall.tint),
                    wall.x * size - WALL_HALF,
                    wall.y * size + WALL_THICKNESS,
                ),
            );
            vertices.set(`${wall.x},${wall.y}`, { x: wall.x, y: wall.y });
            vertices.set(`${wall.x},${wall.y + 1}`, { x: wall.x, y: wall.y + 1 });
        }
    }

    for (const vertex of vertices.values()) {
        // The door draws its own cap on its middle vertex.
        if (model.hasDoorAt("h", vertex.x, vertex.y) || model.hasDoorAt("v", vertex.x, vertex.y)) continue;
        const arms = jointArmsAt(model, vertex.x, vertex.y);
        const lastWall = model.getWall("v", vertex.x, vertex.y - 1);
        if (arms.length === 1 && arms[0] === "N" && lastWall) {
            // A vertical wall that ends alone shows its south face under its cap, like a horizontal wall.
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    wallEndPrefabName(lastWall.tint),
                    vertex.x * size - WALL_HALF,
                    vertex.y * size + WALL_THICKNESS,
                ),
            );
        }
        if (arms.length === 0) continue;
        placements.push(
            placement(MAP_LAYER_WALL_COLLECTION, jointPrefabName(arms), vertex.x * size - WALL_HALF, vertex.y * size),
        );
    }

    return placements;
}

export interface PlacedMapLayerEntity {
    entityId: string;
    key: string;
}

export interface MapLayerDiff {
    toDelete: string[];
    toCreate: MapLayerPlacement[];
}

/** Entities to remove and to create so that the placed entities match the wanted placements, nothing more. */
export function diffPlacements(
    placed: readonly PlacedMapLayerEntity[],
    wanted: readonly MapLayerPlacement[],
): MapLayerDiff {
    const wantedByKey = new Map(wanted.map((item) => [item.key, item]));
    const kept = new Set<string>();
    const toDelete: string[] = [];

    for (const entity of placed) {
        if (wantedByKey.has(entity.key) && !kept.has(entity.key)) {
            kept.add(entity.key);
        } else {
            // Unwanted, or a duplicate of an entity we already keep.
            toDelete.push(entity.entityId);
        }
    }

    const toCreate = wanted.filter((item) => !kept.has(item.key));
    return { toDelete, toCreate };
}
