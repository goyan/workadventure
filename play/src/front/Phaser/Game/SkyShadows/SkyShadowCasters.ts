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
import type { ShadowBox, ShadowCasters, ShadowPictureCaster, ShadowTree } from "./SkyShadowGeometry";
import type { ShadowPicture, ShadowShape } from "./SkyShadowPicture";

/** How high a tall object (`castsShadow`) stands, in map pixels: a tile and a half (a cupboard, a shelf). */
export const OBJECT_SHADOW_RISE = 1.5 * MAP_LAYER_TILE_SIZE;
/** The crown of a tree: its radius against the width of its image, its trunk against that radius. */
const CROWN_RADIUS_SHARE = 0.38;
const TRUNK_WIDTH_SHARE = 0.25;
/**
 * The other trees of the nature catalogue, which do not sway (isJungleTree): the bare and the big ones, the snowy
 * ones, the seasonal ones. The same families hold a few low things (a stump, a bush): only what is two tiles high or
 * more is a tree.
 */
const STILL_TREE_PREFIXES = ["Nature:nature-", "Nature:snow-tree-", "Nature:seasonal-", "Nature:winter-auto-"];
const TREE_MIN_HEIGHT = 2 * MAP_LAYER_TILE_SIZE;

/** Whether an object of the map is a tree, for its shadow. */
function isShadowTree(entity: ShadowSourceEntity): boolean {
    const { id } = entity.prefab;
    if (isJungleTree(id)) return true;
    return entity.displayHeight >= TREE_MIN_HEIGHT && STILL_TREE_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** The nature catalogue: what is not a tree in it is a low detail (a rock, a tuft of grass, flowers, a stump). */
export const NATURE_PREFIX = "Nature:";
/** A detail throws the shadow of a low mound: this share of the width of its image round, half its image high. */
const DETAIL_RADIUS_SHARE = 0.35;

/** What throws a shadow of the sky on the ground, by kind: each can be turned off by this person. */
export interface ShadowCategories {
    walls: boolean;
    objects: boolean;
    trees: boolean;
    details: boolean;
    /** A crown on a trunk (oval, by default), or the picture of each tree laid on the ground (realistic). */
    treeShape?: ShadowShape;
}
const ALL_CATEGORIES: ShadowCategories = { walls: true, objects: true, trees: true, details: true };

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
    /** Its picture as it is shown now, when a canvas can draw it: for a realistic shadow. */
    picture?: ShadowPicture;
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

/** A low thing of the nature catalogue: a mound at the bottom middle of its image, never higher than its image. */
function detailOf(entity: ShadowSourceEntity): ShadowTree {
    const crownHeight = entity.displayHeight / 2;
    return {
        x: entity.x + entity.displayWidth / 2,
        y: entity.y + entity.displayHeight,
        crownRadius: Math.min(entity.displayWidth * DETAIL_RADIUS_SHARE, crownHeight),
        crownHeight,
        trunkWidth: 0,
    };
}

/**
 * What throws a shadow of the sky on the ground: the walls of the map layer, the tall objects (`castsShadow`, by their
 * collision), the trees of the nature catalogue and its low details, each kind unless turned off (`categories`). What stands on a raised floor is left out: the shadows are cast on
 * the ground only. `signature` changes only when one of them changes.
 */
export function readShadowCasters(
    entities: Iterable<ShadowSourceEntity>,
    unchangedSince?: string,
    categories: ShadowCategories = ALL_CATEGORIES,
): {
    /** Undefined when the signature is still `unchangedSince`: the walls are not read again for nothing. */
    casters: ShadowCasters | undefined;
    signature: string;
} {
    const pieces: PlacedPrefabLike[] = [];
    const objects: ShadowBox[] = [];
    const trees: ShadowTree[] = [];
    const details: ShadowTree[] = [];
    const pictures: ShadowPictureCaster[] = [];
    const realisticTrees = categories.treeShape === "realistic";
    const on = (shown: boolean): string => (shown ? "1" : "0");
    let signature = `c${on(categories.walls)}${on(categories.objects)}${on(categories.trees)}${on(categories.details)}${on(realisticTrees)};`;
    for (const entity of entities) {
        const { prefab } = entity;
        if (entity.elevation >= RAISED) continue;
        if (MAP_LAYER_WALL_LIKE_COLLECTIONS.includes(prefab.collectionName)) {
            if (!categories.walls) continue;
            pieces.push({ x: entity.x, y: entity.y, collectionName: prefab.collectionName, prefabId: prefab.id });
            signature += `w${prefab.id}@${entity.x},${entity.y};`;
        } else if (isShadowTree(entity)) {
            if (!categories.trees) continue;
            if (realisticTrees && entity.picture) {
                const laid = {
                    x: entity.x + entity.displayWidth / 2,
                    y: entity.y + entity.displayHeight,
                    width: entity.displayWidth,
                    height: entity.displayHeight,
                    picture: entity.picture,
                };
                pictures.push(laid);
                signature += `p${laid.x},${laid.y},${laid.width},${laid.height},${laid.picture.key};`;
                continue;
            }
            const tree = treeOf(entity);
            trees.push(tree);
            signature += `t${tree.x},${tree.y},${tree.crownRadius},${tree.crownHeight};`;
        } else if (prefab.id.startsWith(NATURE_PREFIX) && !prefab.wander) {
            if (!categories.details) continue;
            const detail = detailOf(entity);
            details.push(detail);
            signature += `d${detail.x},${detail.y},${detail.crownRadius},${detail.crownHeight};`;
        } else if (categories.objects) {
            for (const rectangle of shadowRectangles(prefab, entity, MAP_LAYER_TILE_SIZE)) {
                objects.push({ ...rectangle, rise: OBJECT_SHADOW_RISE });
                signature += `o${rectangle.x},${rectangle.y},${rectangle.width},${rectangle.height};`;
            }
        }
    }
    if (signature === unchangedSince) return { casters: undefined, signature };
    const boxes = pieces.length > 0 ? [...wallShadowBoxes(modelFromPlacedPrefabs(pieces)), ...objects] : objects;
    return { casters: { boxes, trees, details, pictures }, signature };
}
