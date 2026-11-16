import type * as Phaser from "phaser";
import * as Sentry from "@sentry/svelte";
import { asError } from "catch-unknown";
import { get } from "svelte/store";
import { v4 as uuidv4 } from "uuid";
import type { WAMEntityData } from "@workadventure/map-editor";
import {
    mapLayerFloorFamilyStore,
    mapLayerLevelStore,
    mapLayerLevelsStore,
    mapLayerModeStore,
    mapLayerStairDirectionStore,
    mapLayerStairHeightStore,
    mapLayerStairOpenStore,
    mapLayerStairWidthStore,
    mapLayerStatusStore,
} from "../../../../Stores/MapLayerStore";
import type { GameScene } from "../../GameScene";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import type { FrontCommand } from "../Commands/FrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { MAP_LAYER_TILE_SIZE } from "../MapLayer/MapLayerCatalog";
import { FloorModel, stairImagePosition } from "../MapLayer/FloorModel";
import {
    applySlabs,
    availableLevels,
    canPlaceStair,
    computeFloorPlacements,
    diffFloorPlacements,
    eraseSlabs,
    floorCellAt,
    floorPlacementKey,
    levelUnderPoint,
    placeStair,
    removeStairAt,
} from "../MapLayer/FloorOperations";
import type { PlacedFloorEntity } from "../MapLayer/FloorOperations";
import { floorPieceSize, parseFloorPiece, stairGroundBox, stairScreenBox } from "../MapLayer/MapLayerFloors";
import type { StairShape } from "../MapLayer/MapLayerFloors";
import type { MapBounds, Point } from "../MapLayer/MapLayerOperations";
import { MAX_ENTITIES_PER_OPERATION } from "../MapLayer/MapLayerSync";

/** Over the floors and what stands on them, under the interface. */
const FLOOR_PREVIEW_DEPTH = 890_000;
const OK_COLOR = 0x22c55e;
const REFUSED_COLOR = 0xef4444;
const ERASE_COLOR = 0xf97316;

/** An edit of the floors, applied to their model; false when it changes nothing or is refused. */
type FloorOperation = (model: FloorModel, bounds: MapBounds) => boolean;

/**
 * The part of the "Map" tool that edits the raised floors: slabs, stairs and their wells. Like the walls, the floors
 * are rebuilt from the entities of their catalog after each gesture, which is one undo step.
 */
export class MapLayerFloorEditing {
    private graphics: Phaser.GameObjects.Graphics | undefined;

    constructor(
        private readonly scene: GameScene,
        private readonly mapEditorModeManager: MapEditorModeManager,
        private readonly getBounds: () => MapBounds,
    ) {}

    public activate(): void {
        this.graphics = this.scene.add.graphics().setDepth(FLOOR_PREVIEW_DEPTH);
        this.refreshLevels();
    }

    public clear(): void {
        this.graphics?.destroy();
        this.graphics = undefined;
    }

    public readModel(): FloorModel {
        const items = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            items.push({
                x: entity.x,
                y: entity.y,
                collectionName: prefab.collectionName,
                prefabId: prefab.id,
                elevation: entity.getEntityData().elevation,
            });
        }
        return FloorModel.fromPlaced(items);
    }

    private readPlaced(): PlacedFloorEntity[] {
        const placed: PlacedFloorEntity[] = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            if (parseFloorPiece(prefab.collectionName, prefab.id) === undefined) continue;
            placed.push({
                entityId: entity.entityId,
                key: floorPlacementKey(prefab.id, entity.x, entity.y, entity.getEntityData().elevation ?? 0),
            });
        }
        return placed;
    }

    /** The floors the panel offers; the one being edited goes back to the ground when it is no longer offered. */
    public refreshLevels(): void {
        const levels = availableLevels(this.readModel());
        mapLayerLevelsStore.set(levels);
        if (get(mapLayerLevelStore) !== 0 && !levels.includes(get(mapLayerLevelStore))) mapLayerLevelStore.set(0);
    }

    /** The pipette: the floor drawn under the pointer becomes the one being edited. */
    public pickLevel(world: Point): void {
        mapLayerLevelStore.set(levelUnderPoint(this.readModel(), world.x, world.y));
    }

    private stairShape(): StairShape {
        return {
            direction: get(mapLayerStairDirectionStore),
            width: get(mapLayerStairWidthStore),
            height: get(mapLayerStairHeightStore),
            open: get(mapLayerStairOpenStore),
        };
    }

    private operation(start: Point, end: Point): FloorOperation | undefined {
        const mode = get(mapLayerModeStore);
        const level = get(mapLayerLevelStore);
        const from = floorCellAt(start.x, start.y, level);
        const to = floorCellAt(end.x, end.y, level);
        if (mode === "slab") {
            const family = get(mapLayerFloorFamilyStore);
            return (model, bounds) => {
                applySlabs(model, level, from, to, family, bounds);
                return true;
            };
        }
        if (mode === "slabErase") {
            return (model) => {
                // A click on a stair that starts from this level removes it; slabs are removed by rectangles.
                if (from.x === to.x && from.y === to.y && removeStairAt(model, level, to)) return true;
                eraseSlabs(model, level, from, to);
                return true;
            };
        }
        if (mode === "stair") {
            const shape = this.stairShape();
            return (model, bounds) => placeStair(model, shape, to, level, bounds);
        }
        return undefined;
    }

    /** Draws what the gesture (or, without one, a click here) would do. */
    public draw(start: Point | undefined, current: Point | undefined): void {
        const graphics = this.graphics;
        if (!graphics) return;
        graphics.clear();
        this.scene.markDirty();
        if (!current) return;
        const size = MAP_LAYER_TILE_SIZE;
        const mode = get(mapLayerModeStore);
        const level = get(mapLayerLevelStore);
        const to = floorCellAt(current.x, current.y, level);
        if (mode === "stair") {
            const shape = this.stairShape();
            const fits = canPlaceStair(this.readModel(), shape, to, level, this.getBounds());
            const color = fits ? OK_COLOR : REFUSED_COLOR;
            const image = stairImagePosition(shape, to, level);
            const box = stairScreenBox(shape, to);
            graphics.fillStyle(color, 0.3);
            graphics.fillRect(image.x, image.y, box.width, box.height);
            // Its footprint on the floor it starts from, and its well in the floor it reaches.
            const ground = stairGroundBox(shape, to);
            graphics.lineStyle(2, color, 1);
            graphics.strokeRect(ground.x, ground.y - level, ground.width, ground.height);
            graphics.lineStyle(1, 0xffffff, 0.9);
            const rise = box.height - ground.height;
            graphics.strokeRect(ground.x, ground.y - level - Math.abs(rise), ground.width, ground.height);
            return;
        }
        if (mode === "slab" && level === 0) return;
        const from = start ? floorCellAt(start.x, start.y, level) : to;
        const x = Math.min(from.x, to.x) * size;
        const y = Math.min(from.y, to.y) * size - level;
        const width = (Math.abs(to.x - from.x) + 1) * size;
        const height = (Math.abs(to.y - from.y) + 1) * size;
        const color = mode === "slabErase" ? ERASE_COLOR : OK_COLOR;
        graphics.fillStyle(color, 0.3);
        graphics.fillRect(x, y, width, height);
        graphics.lineStyle(2, color, 1);
        graphics.strokeRect(x, y, width, height);
    }

    /** Applies the gesture as one undo step. */
    public commit(start: Point, end: Point): void {
        this.graphics?.clear();
        if (get(mapLayerModeStore) === "slab" && get(mapLayerLevelStore) === 0) {
            mapLayerStatusStore.set("slabOnGround");
            return;
        }
        const operation = this.operation(start, end);
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!operation || !wamFile) return;
        const entitiesManager = this.scene.getGameMapFrontWrapper().getEntitiesManager();
        const stairMode = get(mapLayerModeStore) === "stair";

        // The factory runs inside the command queue, right before execution: it reads the current state of the map.
        const factory = (): readonly FrontCommand[] => {
            const model = this.readModel();
            if (!operation(model, this.getBounds())) {
                if (stairMode) mapLayerStatusStore.set("stairInvalid");
                return [];
            }
            const diff = diffFloorPlacements(this.readPlaced(), computeFloorPlacements(model));
            if (diff.toCreate.length + diff.toDelete.length > MAX_ENTITIES_PER_OPERATION) {
                mapLayerStatusStore.set("tooLarge");
                return [];
            }
            const commands: FrontCommand[] = diff.toDelete.map(
                (entityId) => new DeleteEntityFrontCommand(wamFile, entityId, undefined, entitiesManager),
            );
            for (const item of diff.toCreate) {
                const piece = parseFloorPiece(item.collectionName, item.prefabId);
                if (!piece) continue;
                const entityData: WAMEntityData = {
                    x: item.x,
                    y: item.y,
                    prefabRef: { collectionName: item.collectionName, id: item.prefabId },
                    properties: [],
                    elevation: item.elevation,
                };
                commands.push(
                    new CreateEntityFrontCommand(
                        wamFile,
                        uuidv4(),
                        entityData,
                        undefined,
                        entitiesManager,
                        floorPieceSize(piece),
                    ),
                );
            }
            return commands;
        };

        this.mapEditorModeManager
            .executeCommands(factory)
            .then(() => this.refreshLevels())
            .catch((error: unknown) => {
                const cause = asError(error);
                console.error("Failed to edit the floors", cause);
                mapLayerStatusStore.set("failed");
                Sentry.captureException(cause);
            });
    }
}
