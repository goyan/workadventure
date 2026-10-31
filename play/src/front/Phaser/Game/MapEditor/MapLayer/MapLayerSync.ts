import { v4 as uuidv4 } from "uuid";
import type { WAMEntityData, WamFile } from "@workadventure/map-editor";
import type { EntitiesManager } from "../../GameMap/EntitiesManager";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import type { FrontCommand } from "../Commands/FrontCommand";
import { computePlacements, diffPlacements, placementKey } from "./MapLayerAutotile";
import type { MapLayerDiff, PlacedMapLayerEntity } from "./MapLayerAutotile";
import { mapLayerPieceSize, parseMapLayerPrefab } from "./MapLayerCatalog";
import { modelFromPlacedPrefabs } from "./MapLayerOperations";
import type { PlacedPrefabLike } from "./MapLayerOperations";

/** Safety net: one gesture never creates or deletes more entities than this. */
export const MAX_ENTITIES_PER_OPERATION = 4000;

export interface MapLayerEntityState extends PlacedPrefabLike {
    entityId: string;
}

/** Entities of the map as they are now, in the shape the map layer reads. */
export function readMapLayerEntityStates(entitiesManager: EntitiesManager): MapLayerEntityState[] {
    return Array.from(entitiesManager.getEntities().values(), (entity) => {
        const prefab = entity.getPrefab();
        return {
            entityId: entity.entityId,
            x: entity.x,
            y: entity.y,
            collectionName: prefab.collectionName,
            prefabId: prefab.id,
        };
    });
}

/**
 * Commands that make the floors and walls of `entities` consistent: the sprites and joints that the walls and floors
 * need are created and the ones they no longer need are deleted. `entities` may describe the map as it will be after
 * other commands (move, paste, delete): the commands returned are meant to run right after them, in the same batch.
 * Returns undefined when the change would touch too many entities.
 */
export function buildMapLayerSyncCommands(
    wamFile: WamFile,
    entitiesManager: EntitiesManager,
    entities: readonly MapLayerEntityState[],
): FrontCommand[] | undefined {
    const placed: PlacedMapLayerEntity[] = [];
    for (const entity of entities) {
        if (parseMapLayerPrefab(entity.collectionName, entity.prefabId) === undefined) continue;
        placed.push({
            entityId: entity.entityId,
            key: placementKey(entity.collectionName, entity.prefabId, entity.x, entity.y),
        });
    }
    const diff = diffPlacements(placed, computePlacements(modelFromPlacedPrefabs(entities)));
    if (diff.toCreate.length + diff.toDelete.length > MAX_ENTITIES_PER_OPERATION) {
        return undefined;
    }
    return buildMapLayerCommands(wamFile, entitiesManager, diff);
}

/** Commands that apply a diff of placements: delete the sprites that go away, create the ones that are missing. */
export function buildMapLayerCommands(
    wamFile: WamFile,
    entitiesManager: EntitiesManager,
    diff: MapLayerDiff,
): FrontCommand[] {
    const commands: FrontCommand[] = diff.toDelete.map(
        (entityId) => new DeleteEntityFrontCommand(wamFile, entityId, undefined, entitiesManager),
    );
    for (const item of diff.toCreate) {
        const piece = parseMapLayerPrefab(item.collectionName, item.prefabId);
        if (!piece) continue;
        const entityData: WAMEntityData = {
            x: item.x,
            y: item.y,
            prefabRef: { collectionName: item.collectionName, id: item.prefabId },
            properties: [],
        };
        commands.push(
            new CreateEntityFrontCommand(
                wamFile,
                uuidv4(),
                entityData,
                undefined,
                entitiesManager,
                mapLayerPieceSize(piece),
            ),
        );
    }
    return commands;
}
