import {
    MAP_LAYER_DOOR_COLLECTION,
    WALL_HALF,
    WALL_THICKNESS,
    facadePrefabName,
    floorPrefabName,
    jointPrefabName,
    lintelPrefabName,
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_TILE_SIZE,
    DOOR_VERTICAL_WIDTH,
    MAP_LAYER_WALL_COLLECTION,
    MAP_LAYER_WINDOW_COLLECTION,
    doorPrefabName,
    facadeLeftExtension,
    mapLayerPrefabId,
    verticalWallPrefabName,
    wallEndPrefabName,
    wallRise,
    windowPrefabName,
} from "./MapLayerCatalog";
import type { FacadeEnds, JointArm, WallHeight } from "./MapLayerCatalog";
import { doorEdges, doorHeight } from "./MapLayerModel";
import type { MapLayerModel, WallEdge } from "./MapLayerModel";

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
 * Ends of the face of height `height` drawn on the horizontal segment (x, y): it continues on a side when the wall next
 * to it is at least as high. A lower wall next to it continues under it, and this face closes with its end.
 */
function facadeEndsAt(model: MapLayerModel, x: number, y: number, height: WallHeight): FacadeEnds {
    const continues = (next: number): boolean => (model.getWall("h", next, y)?.height ?? 0) >= height;
    return endsOf(continues(x - 1), continues(x + 1));
}

/**
 * Whether a horizontal door draws the whole wall of this segment, cap included: it does when it is as high as its
 * wall. Under a lower door, the lintel above it draws the cap at the level of the wall.
 */
function isDrawnByDoor(model: MapLayerModel, wall: WallEdge): boolean {
    if (wall.orientation !== "h") return false;
    const door = model.getDoorOn("h", wall.x, wall.y);
    return door !== undefined && doorHeight(door) >= wall.height;
}

/** Whether the strip of a vertical wall under a vertical door is drawn: only a high wall passes over its door. */
function isStripOverDoor(wall: WallEdge): boolean {
    return wall.orientation === "v" && wall.height >= 2;
}

interface ArmWall {
    arm: JointArm;
    wall: WallEdge;
}

/**
 * The joints of a vertex, one per level of the walls that meet there, each one joining the walls of its level.
 * - A horizontal door as high as its wall draws the ends of the wall itself (its jambs): the walls of its level next to
 *   it continue up to it, with no end of their own, and the vertices it touches get no horizontal arm at that level.
 * - A horizontal wall higher than a level hides the joint of that level behind its face, but for the south arm, the
 *   wall that comes out under it.
 * - The middle vertex of a door is drawn by the door, but for the walls that pass over it (the lintels over a lower
 *   horizontal door, the strips of a high vertical wall over its door).
 * - A vertical wall that ends alone at a level shows its south face under its cap, like a horizontal wall.
 */
function jointsAt(model: MapLayerModel, x: number, y: number): MapLayerPlacement[] {
    const size = MAP_LAYER_TILE_SIZE;
    const middleOfDoor = model.hasDoorAt("h", x, y) || model.hasDoorAt("v", x, y);
    const candidates: ArmWall[] = [];
    const add = (arm: JointArm, wall: WallEdge | undefined): void => {
        if (wall) candidates.push({ arm, wall });
    };
    add("N", model.getWall("v", x, y - 1));
    add("E", model.getWall("h", x, y));
    add("S", model.getWall("v", x, y));
    add("W", model.getWall("h", x - 1, y));

    const horizontals = candidates.filter(({ arm }) => arm === "E" || arm === "W");
    const arms = middleOfDoor
        ? candidates.filter(({ wall }) =>
              wall.orientation === "h"
                  ? model.getDoorOn("h", wall.x, wall.y) !== undefined && !isDrawnByDoor(model, wall)
                  : model.getDoorOn("v", wall.x, wall.y) !== undefined && isStripOverDoor(wall),
          )
        : candidates.filter(({ wall }) => !isDrawnByDoor(model, wall));

    const placements: MapLayerPlacement[] = [];
    const levels = new Set(arms.map(({ wall }) => wall.height));
    for (const level of [...levels].sort((a, b) => a - b)) {
        const jambAtLevel =
            !middleOfDoor && horizontals.some(({ wall }) => wall.height === level && isDrawnByDoor(model, wall));
        const coveredByHigherWall = horizontals.some(({ wall }) => wall.height > level);
        const atLevel = arms.filter(({ arm, wall }) => {
            if (wall.height !== level) return false;
            if (coveredByHigherWall) return arm === "S";
            return !(jambAtLevel && (arm === "E" || arm === "W"));
        });
        if (atLevel.length === 0) continue;
        const rise = wallRise(level);
        const north = atLevel.find(({ arm }) => arm === "N");
        if (atLevel.length === 1 && north) {
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    wallEndPrefabName(north.wall.tint, level),
                    x * size - WALL_HALF,
                    y * size + WALL_THICKNESS - rise,
                ),
            );
        }
        placements.push(
            placement(
                MAP_LAYER_WALL_COLLECTION,
                jointPrefabName(
                    atLevel.map(({ arm }) => arm),
                    level,
                ),
                x * size - WALL_HALF,
                y * size - rise,
            ),
        );
    }
    return placements;
}

/**
 * Chooses the sprites of a model.
 * - A floor cell uses the plain tile of its family, or the shaded one when a horizontal wall stands on the tile row
 *   right before it (the wall casts its shadow on the top of the tile, fading downwards).
 * - A horizontal wall stands entirely on the tile row of its grid line: cap on the top 12 px, face on the 20 px below.
 *   It is a facade (cap and south face) in one piece per grid column. Its face is seamless with the
 *   next facade and closes with an end when the wall stops on a vertex. A segment with a window uses the window of
 *   the same ends instead of the facade, at the same place.
 * - A vertical wall is a strip, one piece per grid row.
 * - The caps meet on each vertex: a joint piece draws the corner, the T or the cross, or closes the end of a wall.
 * - A wall of height N is the same wall raised by `wallRise(N)`, its face longer by as much: its foot stays on the
 *   same row. A door or a window lower than its wall gets a lintel above it, at the height of the wall.
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
        const [first] = doorEdges(door);
        const tint = model.getWall(first.orientation, first.x, first.y)?.tint;
        if (tint === undefined) continue;
        if (door.orientation === "h") {
            const height = doorHeight(door);
            const y = door.y * size - wallRise(height);
            placements.push(
                placement(
                    MAP_LAYER_DOOR_COLLECTION,
                    doorPrefabName("h", tint, "g", undefined, false, height),
                    (door.x - 1) * size,
                    y,
                ),
                placement(
                    MAP_LAYER_DOOR_COLLECTION,
                    doorPrefabName("h", tint, "d", undefined, false, height),
                    door.x * size,
                    y,
                ),
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
        if (wall.orientation === "h") {
            vertices.set(`${wall.x},${wall.y}`, { x: wall.x, y: wall.y });
            vertices.set(`${wall.x + 1},${wall.y}`, { x: wall.x + 1, y: wall.y });
        } else {
            vertices.set(`${wall.x},${wall.y}`, { x: wall.x, y: wall.y });
            vertices.set(`${wall.x},${wall.y + 1}`, { x: wall.x, y: wall.y + 1 });
        }
        const door = model.getDoorOn(wall.orientation, wall.x, wall.y);
        if (wall.orientation === "h") {
            const wallEnds = facadeEndsAt(model, wall.x, wall.y, wall.height);
            const lintel = (opening: WallHeight): MapLayerPlacement =>
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    lintelPrefabName(wall.tint, wallEnds, wall.height, opening),
                    wall.x * size - facadeLeftExtension(wallEnds),
                    wall.y * size - wallRise(wall.height),
                );
            if (door) {
                // The door itself is drawn with the doors; a lower door gets the rest of the wall above it.
                const opening = doorHeight(door);
                if (opening < wall.height) placements.push(lintel(opening));
                continue;
            }
            const paneHeight = model.getWindowHeight(wall.x, wall.y);
            if (paneHeight !== undefined) {
                const paneEnds = facadeEndsAt(model, wall.x, wall.y, paneHeight);
                placements.push(
                    placement(
                        MAP_LAYER_WINDOW_COLLECTION,
                        windowPrefabName(wall.tint, paneEnds, paneHeight),
                        wall.x * size - facadeLeftExtension(paneEnds),
                        wall.y * size - wallRise(paneHeight),
                    ),
                );
                if (paneHeight < wall.height) placements.push(lintel(paneHeight));
                continue;
            }
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    facadePrefabName(wall.tint, wallEnds, wall.height),
                    wall.x * size - facadeLeftExtension(wallEnds),
                    wall.y * size - wallRise(wall.height),
                ),
            );
        } else {
            // A vertical door is drawn on the ground between its joints; the strip of a high wall passes over it.
            if (door && !isStripOverDoor(wall)) continue;
            placements.push(
                placement(
                    MAP_LAYER_WALL_COLLECTION,
                    verticalWallPrefabName(wall.tint, wall.height),
                    wall.x * size - WALL_HALF,
                    wall.y * size + WALL_THICKNESS - wallRise(wall.height),
                ),
            );
        }
    }

    for (const vertex of vertices.values()) {
        placements.push(...jointsAt(model, vertex.x, vertex.y));
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
