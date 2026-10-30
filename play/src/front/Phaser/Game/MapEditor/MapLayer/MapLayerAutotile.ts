import {
    WALL_HALF,
    facadePrefabName,
    floorPrefabName,
    jointPrefabName,
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_TILE_SIZE,
    MAP_LAYER_WALL_COLLECTION,
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

function jointArmsAt(model: MapLayerModel, x: number, y: number): JointArm[] {
    const arms: JointArm[] = [];
    if (model.hasWall("v", x, y - 1)) arms.push("N");
    if (model.hasWall("h", x, y)) arms.push("E");
    if (model.hasWall("v", x, y)) arms.push("S");
    if (model.hasWall("h", x - 1, y)) arms.push("W");
    return arms;
}

/**
 * Chooses the sprites of a model.
 * - A floor cell uses the plain tile of its family, or the shaded one when a horizontal wall stands on it (its foot casts a shadow).
 * - A horizontal wall is a facade (cap and south face) in one piece per grid column. Its face is seamless with the
 *   next facade and closes with an end when the wall stops on a vertex.
 * - A vertical wall is a strip, one piece per grid row.
 * - The caps meet on each vertex: a joint piece draws the corner, the T or the cross, or closes the end of a wall.
 */
export function computePlacements(model: MapLayerModel): MapLayerPlacement[] {
    const placements: MapLayerPlacement[] = [];
    const size = MAP_LAYER_TILE_SIZE;
    const vertices = new Map<string, { x: number; y: number }>();

    for (const floor of model.getFloors()) {
        const name = floorPrefabName(floor.family, model.hasWall("h", floor.x, floor.y) ? "ombre" : "uni");
        placements.push(placement(MAP_LAYER_FLOOR_COLLECTION, name, floor.x * size, floor.y * size));
    }

    for (const wall of model.getWalls()) {
        if (wall.orientation === "h") {
            const ends = endsOf(model.hasWall("h", wall.x - 1, wall.y), model.hasWall("h", wall.x + 1, wall.y));
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    facadePrefabName(wall.tint, ends),
                    wall.x * size - facadeLeftExtension(ends),
                    wall.y * size - WALL_HALF,
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
                    wall.y * size + WALL_HALF,
                ),
            );
            vertices.set(`${wall.x},${wall.y}`, { x: wall.x, y: wall.y });
            vertices.set(`${wall.x},${wall.y + 1}`, { x: wall.x, y: wall.y + 1 });
        }
    }

    for (const vertex of vertices.values()) {
        const arms = jointArmsAt(model, vertex.x, vertex.y);
        const lastWall = model.getWall("v", vertex.x, vertex.y - 1);
        if (arms.length === 1 && arms[0] === "N" && lastWall) {
            // A vertical wall that ends alone shows its south face under its cap, like a horizontal wall.
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    wallEndPrefabName(lastWall.tint),
                    vertex.x * size - WALL_HALF,
                    vertex.y * size + WALL_HALF,
                ),
            );
        }
        placements.push(
            placement(
                MAP_LAYER_WALL_COLLECTION,
                jointPrefabName(arms),
                vertex.x * size - WALL_HALF,
                vertex.y * size - WALL_HALF,
            ),
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
