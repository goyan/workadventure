import type { EntityPrefab } from "@workadventure/map-editor";
import { isJungleTree } from "../Jungle/JunglePlan";
import { shadowRectangles } from "../Lamps/RgbLampObstacles";
import {
    MAP_LAYER_TILE_SIZE,
    MAP_LAYER_WALL_LIKE_COLLECTIONS,
    WALL_FOOTPRINT,
    WALL_HALF,
} from "../MapEditor/MapLayer/MapLayerCatalog";
import type { MapLayerModel } from "../MapEditor/MapLayer/MapLayerModel";
import { modelFromPlacedPrefabs, type PlacedPrefabLike } from "../MapEditor/MapLayer/MapLayerOperations";
import { mergeShadowBoxes } from "./SkyShadowGeometry";
import type { ShadowBox, ShadowCasters, ShadowTree } from "./SkyShadowGeometry";

/** How high a tall object (`castsShadow`) stands, in map pixels: a tile and a half (a cupboard, a shelf). */
export const OBJECT_SHADOW_RISE = 1.5 * MAP_LAYER_TILE_SIZE;
/** The crown of a tree: its radius against the width of its image, its trunk against that radius. */
const CROWN_RADIUS_SHARE = 0.38;
const TRUNK_WIDTH_SHARE = 0.25;
/** An object on a raised floor stands at least this high (the ground: 0): it casts no shadow on the ground. */
const RAISED = 2;

/**
 * The walls of the map layer as boxes standing on the ground, each as high as its tiles. A wall stands where the
 * avatars meet it (MapLayerBarriers), not where its top is drawn: a horizontal wall of the line y on the bottom of
 * the row y (the foot of its face, WALL_FOOTPRINT thick), a vertical wall of the line x across the row below the one
 * its top is drawn on. The walls under the doors and the windows stand too: a door is closed most of the time, and the
 * wall around a window hides most of the light.
 */
export function wallShadowBoxes(model: MapLayerModel): ShadowBox[] {
    const size = MAP_LAYER_TILE_SIZE;
    const boxes: ShadowBox[] = [];
    for (const wall of model.getWalls()) {
        const rise = wall.height * size;
        if (wall.orientation === "h") {
            boxes.push({
                x: wall.x * size,
                y: (wall.y + 1) * size - WALL_FOOTPRINT,
                width: size,
                height: WALL_FOOTPRINT,
                rise,
            });
        } else {
            boxes.push({
                x: wall.x * size - WALL_HALF,
                y: (wall.y + 1) * size,
                width: 2 * WALL_HALF,
                height: size,
                rise,
            });
        }
    }
    return mergeShadowBoxes(boxes);
}

/** A placed object as the shadows need it (an `Entity` fits through its getters). */
export interface ShadowSourceEntity {
    /** Top-left corner of the image, in map pixels. */
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    elevation: number;
    prefab: Pick<EntityPrefab, "collectionName" | "id"> &
        Partial<Pick<EntityPrefab, "castsShadow" | "collisionRectangles" | "collisionGrid" | "wander">>;
}

/** A tree of the nature catalogue (the ones that sway in the wind, TreeSway): a crown on a trunk. */
function treeOf(entity: ShadowSourceEntity): ShadowTree {
    const crownRadius = entity.displayWidth * CROWN_RADIUS_SHARE;
    return {
        x: entity.x + entity.displayWidth / 2,
        y: entity.y + entity.displayHeight,
        crownRadius,
        // The centre of the crown, a radius under the top of the image.
        crownHeight: Math.max(crownRadius, entity.displayHeight - crownRadius),
        trunkWidth: crownRadius * TRUNK_WIDTH_SHARE,
    };
}

/**
 * What throws a shadow of the sky on the ground: the walls of the map layer, the tall objects (`castsShadow`, by their
 * collision) and the trees of the nature catalogue. What stands on a raised floor is left out: the shadows are cast on
 * the ground only. `signature` changes only when one of them changes.
 */
export function readShadowCasters(
    entities: Iterable<ShadowSourceEntity>,
    unchangedSince?: string,
): {
    /** Undefined when the signature is still `unchangedSince`: the walls are not read again for nothing. */
    casters: ShadowCasters | undefined;
    signature: string;
} {
    const pieces: PlacedPrefabLike[] = [];
    const objects: ShadowBox[] = [];
    const trees: ShadowTree[] = [];
    let signature = "";
    for (const entity of entities) {
        const { prefab } = entity;
        if (entity.elevation >= RAISED) continue;
        if (MAP_LAYER_WALL_LIKE_COLLECTIONS.includes(prefab.collectionName)) {
            pieces.push({ x: entity.x, y: entity.y, collectionName: prefab.collectionName, prefabId: prefab.id });
            signature += `w${prefab.id}@${entity.x},${entity.y};`;
        } else if (isJungleTree(prefab.id)) {
            const tree = treeOf(entity);
            trees.push(tree);
            signature += `t${tree.x},${tree.y},${tree.crownRadius},${tree.crownHeight};`;
        } else {
            for (const rectangle of shadowRectangles(prefab, entity, MAP_LAYER_TILE_SIZE)) {
                objects.push({ ...rectangle, rise: OBJECT_SHADOW_RISE });
                signature += `o${rectangle.x},${rectangle.y},${rectangle.width},${rectangle.height};`;
            }
        }
    }
    if (signature === unchangedSince) return { casters: undefined, signature };
    const boxes = pieces.length > 0 ? [...wallShadowBoxes(modelFromPlacedPrefabs(pieces)), ...objects] : objects;
    return { casters: { boxes, trees }, signature };
}
