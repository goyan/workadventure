import {
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_UPPER_COLLECTIONS,
    MAP_LAYER_UPPER_SUFFIX,
    parseMapLayerPrefab,
} from "./MapLayerCatalog";
import type { MapLayerPiece } from "./MapLayerCatalog";
import { placementKey } from "./MapLayerAutotile";
import type { MapLayerPlacement } from "./MapLayerAutotile";
import { wallAtPoint } from "./MapLayerOperations";
import type { PlacedPrefabLike } from "./MapLayerOperations";
import type { MapLayerModel } from "./MapLayerModel";

/**
 * Walls, doors and windows standing on a raised floor. They are the pieces of the ground in collections of their own
 * (`Carte Murs Paliers`...), with the altitude of their floor (`EntityData.elevation`), drawn that much further north.
 * The map tool edits one level at a time: it reads the pieces of that level as if they stood on the ground under
 * them, runs the model and the autotile of the ground, and places the result back at the level.
 */
export interface PrefabName {
    collectionName: string;
    prefabId: string;
}

/** A placed entity as the levels read it: with the altitude it stands at (absent on the ground). */
export interface LevelPlaced extends PlacedPrefabLike {
    elevation?: number;
}

/** A placement of a level: the entity to create, with its altitude. */
export interface LevelPlacement extends MapLayerPlacement {
    elevation: number;
}

/** The piece of a raised floor that stands for a piece of the ground. */
export function upperPrefabOf(collectionName: string, prefabId: string): PrefabName {
    const upper = collectionName + MAP_LAYER_UPPER_SUFFIX;
    return { collectionName: upper, prefabId: upper + prefabId.slice(collectionName.length) };
}

/** The piece of the ground a piece of a raised floor stands for; undefined for anything else. */
export function groundPrefabOfUpper(collectionName: string, prefabId: string): PrefabName | undefined {
    if (!MAP_LAYER_UPPER_COLLECTIONS.includes(collectionName) || !prefabId.startsWith(collectionName)) return undefined;
    const ground = collectionName.slice(0, -MAP_LAYER_UPPER_SUFFIX.length);
    return { collectionName: ground, prefabId: ground + prefabId.slice(collectionName.length) };
}

/** The meaning of a piece of the map layer, on the ground or on a raised floor. */
export function parseAnyLevelPrefab(collectionName: string, prefabId: string): MapLayerPiece | undefined {
    const ground = groundPrefabOfUpper(collectionName, prefabId);
    return ground
        ? parseMapLayerPrefab(ground.collectionName, ground.prefabId)
        : parseMapLayerPrefab(collectionName, prefabId);
}

/**
 * The pieces of a level among the entities of a map, as if they stood on the ground: the ones of the ground as they
 * are for the level 0, the ones of a raised floor under their names of the ground and where they stand.
 */
export function levelItems(entities: Iterable<LevelPlaced>, level: number): PlacedPrefabLike[] {
    const items: PlacedPrefabLike[] = [];
    for (const entity of entities) {
        const elevation = entity.elevation ?? 0;
        if (elevation !== level) continue;
        if (level === 0) {
            items.push(entity);
            continue;
        }
        const ground = groundPrefabOfUpper(entity.collectionName, entity.prefabId);
        if (ground) items.push({ x: entity.x, y: entity.y + level, ...ground });
    }
    return items;
}

/**
 * The entities that draw the placements of the ground model at a level. On a raised floor the pieces take their
 * collections of the floors, are drawn the altitude higher, and the floors are left out: the floor of a raised floor
 * is its slabs.
 */
export function levelPlacements(placements: readonly MapLayerPlacement[], level: number): LevelPlacement[] {
    if (level === 0) return placements.map((item) => ({ ...item, elevation: 0 }));
    return placements
        .filter((item) => item.collectionName !== MAP_LAYER_FLOOR_COLLECTION)
        .map((item) => {
            const upper = upperPrefabOf(item.collectionName, item.prefabId);
            return { ...item, ...upper, y: item.y - level, elevation: level };
        });
}

/**
 * The key (see `placementKey`) of the placement of the ground model a placed entity stands for, at a level; undefined
 * when the entity is not a piece of that level.
 */
export function levelPlacedKey(entity: LevelPlaced, level: number): string | undefined {
    const [item] = levelItems([entity], level);
    if (!item || parseMapLayerPrefab(item.collectionName, item.prefabId) === undefined) return undefined;
    return placementKey(item.collectionName, item.prefabId, item.x, item.y);
}

/**
 * The level to edit for a click on a wall: the level being edited when it has a wall under the pointer, otherwise the
 * highest level that has one there (it is drawn over the others), otherwise the level being edited. `models` gives
 * the model of a level; a point of the screen is over the ground the altitude of the level further south.
 */
export function levelOfWallAt(
    models: (level: number) => MapLayerModel,
    levels: readonly number[],
    current: number,
    worldX: number,
    worldY: number,
): number {
    const hasWall = (level: number): boolean => wallAtPoint(models(level), worldX, worldY + level) !== undefined;
    if (hasWall(current)) return current;
    const others = [...new Set([0, ...levels])].filter((level) => level !== current).sort((a, b) => b - a);
    return others.find(hasWall) ?? current;
}
