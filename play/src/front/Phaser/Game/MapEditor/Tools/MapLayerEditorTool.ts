import * as Phaser from "phaser";
import type { EditMapCommandMessage } from "@workadventure/messages";
import * as Sentry from "@sentry/svelte";
import { asError } from "catch-unknown";
import { get } from "svelte/store";
import type { FloorFamily, WallTint } from "../MapLayer/MapLayerCatalog";
import {
    mapLayerCatalogAvailableStore,
    mapLayerFloorFamilyStore,
    mapLayerFloorSwatchesStore,
    mapLayerWallSwatchesStore,
    mapLayerModeStore,
    mapLayerStatusStore,
    mapLayerWallTintStore,
} from "../../../../Stores/MapLayerStore";
import { mapEditorVisibilityStore } from "../../../../Stores/MapEditorStore";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../GameScene";
import type { FrontCommand } from "../Commands/FrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { isPointerInsideCanvas } from "../MapEditorPointer";
import {
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_FLOOR_FAMILIES,
    MAP_LAYER_TILE_SIZE,
    MAP_LAYER_WALL_TINTS,
    MAP_LAYER_WALL_COLLECTION,
    facadePrefabName,
    floorPrefabName,
    mapLayerPieceSize,
    mapLayerPrefabId,
    parseMapLayerPrefab,
} from "../MapLayer/MapLayerCatalog";
import { computePlacements, diffPlacements, placementKey } from "../MapLayer/MapLayerAutotile";
import { MAX_ENTITIES_PER_OPERATION, buildMapLayerCommands } from "../MapLayer/MapLayerSync";
import type { MapLayerPlacement, PlacedMapLayerEntity } from "../MapLayer/MapLayerAutotile";
import type { MapLayerModel } from "../MapLayer/MapLayerModel";
import {
    applyFloor,
    applyWalls,
    cellAt,
    cellsBetween,
    eraseAt,
    floodFillCells,
    lineWallEdges,
    modelFromPlacedPrefabs,
    rectangleCells,
    roomWallEdges,
    vertexAt,
} from "../MapLayer/MapLayerOperations";
import type { MapBounds, Point } from "../MapLayer/MapLayerOperations";
import { MapEditorTool } from "./MapEditorTool";

/** Above every entity, below nothing: the preview must stay readable over furniture. */
const PREVIEW_DEPTH = 100_000;

/**
 * An edit of the map layer, applied to the model. The same function drives the preview (on a copy of the model
 * read when the gesture starts) and the commit (on the model read again just before execution).
 */
type MapLayerOperation = (model: MapLayerModel, bounds: MapBounds) => "fillTooLarge" | void;

interface Gesture {
    pointerId: number;
    startWorld: Point;
    currentWorld: Point;
    /** Tiles visited, for continuous gestures (brush, eraser). */
    path: Point[];
    baseModel: MapLayerModel;
}

/**
 * The "Map" tool: draws and erases floors and walls of the room. It never touches the other entities:
 * its model is rebuilt from the entities that belong to the map layer catalogs and autotile re-chooses the
 * sprites of the neighbours after each gesture. A gesture is one undo step.
 */
export class MapLayerEditorTool extends MapEditorTool {
    private readonly scene: GameScene;
    private readonly mapEditorModeManager: MapEditorModeManager;
    private active = false;
    private gesture: Gesture | undefined;
    private graphics: Phaser.GameObjects.Graphics | undefined;
    private hover: Point | undefined;

    private readonly pointerDownEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerDown(pointer);
    };
    private readonly pointerMoveEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerMove(pointer);
    };
    private readonly pointerUpEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerUp(pointer);
    };
    private readonly pointerUpOutsideEventHandler = (pointer: Phaser.Input.Pointer): void => {
        if (this.gesture?.pointerId === pointer.id) this.cancelGesture();
    };
    private readonly cancelEventHandler = (): void => {
        this.cancelGesture();
    };

    constructor(mapEditorModeManager: MapEditorModeManager) {
        super();
        this.mapEditorModeManager = mapEditorModeManager;
        this.scene = mapEditorModeManager.getScene();
    }

    public update(time: number, dt: number): void {}

    public activate(): void {
        this.active = true;
        this.scene.input.topOnly = true;
        this.graphics = this.scene.add.graphics().setDepth(PREVIEW_DEPTH);
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpOutsideEventHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.cancelEventHandler);
        window.addEventListener("blur", this.cancelEventHandler);
        mapEditorVisibilityStore.set(true);
        mapLayerStatusStore.set(undefined);
        this.checkCatalogs().catch((error: unknown) => {
            console.error("Map layer catalog check failed", error);
            mapLayerCatalogAvailableStore.set(false);
        });
    }

    public clear(): void {
        this.active = false;
        this.gesture = undefined;
        this.hover = undefined;
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpOutsideEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.cancelEventHandler);
        window.removeEventListener("blur", this.cancelEventHandler);
        this.graphics?.destroy();
        this.graphics = undefined;
        this.scene.input.topOnly = false;
        this.scene.markDirty();
    }

    public destroy(): void {
        this.clear();
    }

    public subscribeToGameMapFrontWrapperEvents(gameMapFrontWrapper: GameMapFrontWrapper): void {}

    public handleKeyDownEvent(event: KeyboardEvent): void {
        if (event.key.toLowerCase() === "escape") {
            this.cancelGesture();
        }
    }

    public handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        // Entities created by other editors are handled by the entities manager.
        return Promise.resolve();
    }

    private async checkCatalogs(): Promise<void> {
        mapLayerCatalogAvailableStore.set(undefined);
        const manager = this.scene.getEntitiesCollectionsManager();
        const [floor, wall] = await Promise.all([
            manager.getEntityPrefab(
                MAP_LAYER_FLOOR_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_FLOOR_COLLECTION, floorPrefabName("carrelage-gris", "uni")),
            ),
            manager.getEntityPrefab(
                MAP_LAYER_WALL_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, facadePrefabName("blanc", "mid")),
            ),
        ]);
        mapLayerCatalogAvailableStore.set(floor !== undefined && wall !== undefined);
        if (floor === undefined || wall === undefined) return;

        const floorSamples = await Promise.all(
            MAP_LAYER_FLOOR_FAMILIES.map((family) =>
                manager.getEntityPrefab(
                    MAP_LAYER_FLOOR_COLLECTION,
                    mapLayerPrefabId(MAP_LAYER_FLOOR_COLLECTION, floorPrefabName(family, "uni")),
                ),
            ),
        );
        const wallSamples = await Promise.all(
            MAP_LAYER_WALL_TINTS.map((tint) =>
                manager.getEntityPrefab(
                    MAP_LAYER_WALL_COLLECTION,
                    mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, facadePrefabName(tint, "mid")),
                ),
            ),
        );
        const floorSwatches: Partial<Record<FloorFamily, string>> = {};
        MAP_LAYER_FLOOR_FAMILIES.forEach((family, index) => {
            const sample = floorSamples[index];
            if (sample) floorSwatches[family] = sample.imagePath;
        });
        const wallSwatches: Partial<Record<WallTint, string>> = {};
        MAP_LAYER_WALL_TINTS.forEach((tint, index) => {
            const sample = wallSamples[index];
            if (sample) wallSwatches[tint] = sample.imagePath;
        });
        mapLayerFloorSwatchesStore.set(floorSwatches);
        mapLayerWallSwatchesStore.set(wallSwatches);
    }

    private getBounds(): MapBounds {
        const map = this.scene.getGameMapFrontWrapper().getMap();
        return { columns: map.width ?? 0, rows: map.height ?? 0 };
    }

    private readModel(): MapLayerModel {
        const items: { x: number; y: number; collectionName: string; prefabId: string }[] = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            items.push({ x: entity.x, y: entity.y, collectionName: prefab.collectionName, prefabId: prefab.id });
        }
        return modelFromPlacedPrefabs(items);
    }

    private readPlacedEntities(): PlacedMapLayerEntity[] {
        const placed: PlacedMapLayerEntity[] = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            if (parseMapLayerPrefab(prefab.collectionName, prefab.id) === undefined) continue;
            placed.push({
                entityId: entity.entityId,
                key: placementKey(prefab.collectionName, prefab.id, entity.x, entity.y),
            });
        }
        return placed;
    }

    private canDraw(): boolean {
        return this.active && get(mapLayerCatalogAvailableStore) === true;
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        if (
            !this.canDraw() ||
            this.gesture ||
            pointer.button !== 0 ||
            !pointer.leftButtonDown() ||
            (pointer.downElement !== this.scene.game.canvas && pointer.event.target !== this.scene.game.canvas) ||
            !isPointerInsideCanvas(this.scene, pointer)
        ) {
            return;
        }
        mapLayerStatusStore.set(undefined);
        const world = { x: pointer.worldX, y: pointer.worldY };
        this.gesture = {
            pointerId: pointer.id,
            startWorld: world,
            currentWorld: world,
            path: [cellAt(world.x, world.y)],
            baseModel: this.readModel(),
        };
        // Filling reacts to the click itself.
        this.redraw();
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
        const gesture = this.gesture;
        if (!gesture) {
            if (this.canDraw()) {
                this.hover = { x: pointer.worldX, y: pointer.worldY };
                this.redraw();
            }
            return;
        }
        if (gesture.pointerId !== pointer.id) return;
        if (!pointer.leftButtonDown() || !isPointerInsideCanvas(this.scene, pointer)) {
            this.cancelGesture();
            return;
        }
        const world = { x: pointer.worldX, y: pointer.worldY };
        const previous = cellAt(gesture.currentWorld.x, gesture.currentWorld.y);
        const next = cellAt(world.x, world.y);
        gesture.currentWorld = world;
        if (next.x !== previous.x || next.y !== previous.y) {
            gesture.path.push(...cellsBetween(previous, next).slice(1));
        }
        this.redraw();
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        const gesture = this.gesture;
        if (!gesture || gesture.pointerId !== pointer.id || pointer.button !== 0) return;
        const operation = this.buildOperation(gesture);
        this.gesture = undefined;
        this.clearPreview();
        if (operation) {
            this.commit(operation);
        }
    }

    private cancelGesture(): void {
        if (!this.gesture) return;
        this.gesture = undefined;
        this.clearPreview();
    }

    private buildOperation(gesture: Gesture): MapLayerOperation | undefined {
        const mode = get(mapLayerModeStore);
        const family = get(mapLayerFloorFamilyStore);
        const tint = get(mapLayerWallTintStore);
        const startCell = cellAt(gesture.startWorld.x, gesture.startWorld.y);
        const endCell = cellAt(gesture.currentWorld.x, gesture.currentWorld.y);
        const path = [...gesture.path];
        const worldPath = { start: gesture.startWorld, end: gesture.currentWorld };

        switch (mode) {
            case "wall": {
                const edges = lineWallEdges(
                    vertexAt(worldPath.start.x, worldPath.start.y),
                    vertexAt(worldPath.end.x, worldPath.end.y),
                );
                return edges.length === 0 ? undefined : (model, bounds) => applyWalls(model, edges, tint, bounds);
            }
            case "room":
                return (model, bounds) => {
                    applyWalls(model, roomWallEdges(startCell, endCell), tint, bounds);
                    applyFloor(model, rectangleCells(startCell, endCell), family, bounds);
                };
            case "floorBrush":
                return (model, bounds) => applyFloor(model, path, family, bounds);
            case "floorRectangle":
                return (model, bounds) => applyFloor(model, rectangleCells(startCell, endCell), family, bounds);
            case "floorFill":
                return (model, bounds) => {
                    const cells = floodFillCells(model, startCell, bounds, family);
                    if (cells === undefined) return "fillTooLarge";
                    applyFloor(model, cells, family, bounds);
                    return;
                };
            case "erase":
                return (model) => {
                    // Walk along the drag in steps shorter than a wall so no thin wall is jumped over.
                    const steps = Math.max(
                        1,
                        Math.ceil(
                            Math.hypot(worldPath.end.x - worldPath.start.x, worldPath.end.y - worldPath.start.y) / 4,
                        ),
                    );
                    for (let step = 0; step <= steps; step++) {
                        const ratio = step / steps;
                        eraseAt(
                            model,
                            worldPath.start.x + (worldPath.end.x - worldPath.start.x) * ratio,
                            worldPath.start.y + (worldPath.end.y - worldPath.start.y) * ratio,
                        );
                    }
                    // A freehand erase passes through every tile of the path, not only the straight line.
                    for (const cell of path) {
                        eraseAt(
                            model,
                            cell.x * MAP_LAYER_TILE_SIZE + MAP_LAYER_TILE_SIZE / 2,
                            cell.y * MAP_LAYER_TILE_SIZE + MAP_LAYER_TILE_SIZE / 2,
                        );
                    }
                };
        }
    }

    private redraw(): void {
        const graphics = this.graphics;
        if (!graphics) return;
        graphics.clear();
        const size = MAP_LAYER_TILE_SIZE;
        const gesture = this.gesture;

        if (!gesture) {
            if (this.hover) {
                const mode = get(mapLayerModeStore);
                if (mode === "wall" || mode === "room") {
                    const vertex = vertexAt(this.hover.x, this.hover.y);
                    graphics.fillStyle(0xffffff, 0.8).fillCircle(vertex.x * size, (vertex.y + 1) * size, 4);
                } else {
                    const cell = cellAt(this.hover.x, this.hover.y);
                    graphics.lineStyle(2, 0xffffff, 0.8).strokeRect(cell.x * size, cell.y * size, size, size);
                }
            }
            this.scene.markDirty();
            return;
        }

        const operation = this.buildOperation(gesture);
        if (operation) {
            const model = gesture.baseModel.clone();
            const outcome = operation(model, this.getBounds());
            if (outcome === "fillTooLarge") {
                mapLayerStatusStore.set("fillTooLarge");
            } else {
                const base = computePlacements(gesture.baseModel);
                const baseKeys = new Set(base.map((item) => item.key));
                const next = computePlacements(model);
                const nextKeys = new Set(next.map((item) => item.key));
                graphics.fillStyle(0xff3b30, 0.35);
                for (const item of base) {
                    if (!nextKeys.has(item.key)) this.fillPlacement(graphics, item);
                }
                graphics.fillStyle(0x2ecc71, 0.45);
                for (const item of next) {
                    if (!baseKeys.has(item.key)) this.fillPlacement(graphics, item);
                }
            }
        }
        this.scene.markDirty();
    }

    private fillPlacement(graphics: Phaser.GameObjects.Graphics, placement: MapLayerPlacement): void {
        const piece = parseMapLayerPrefab(placement.collectionName, placement.prefabId);
        if (!piece) return;
        const { width, height } = mapLayerPieceSize(piece);
        graphics.fillRect(placement.x, placement.y, width, height);
    }

    private clearPreview(): void {
        this.graphics?.clear();
        this.scene.markDirty();
    }

    private commit(operation: MapLayerOperation): void {
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile) return;
        const entitiesManager = this.scene.getGameMapFrontWrapper().getEntitiesManager();
        const bounds = this.getBounds();

        // The factory runs inside the command queue, right before execution: it reads the current state of the map.
        const factory = (): readonly FrontCommand[] => {
            const model = this.readModel();
            if (operation(model, bounds) === "fillTooLarge") {
                mapLayerStatusStore.set("fillTooLarge");
                return [];
            }
            const diff = diffPlacements(this.readPlacedEntities(), computePlacements(model));
            if (diff.toCreate.length + diff.toDelete.length > MAX_ENTITIES_PER_OPERATION) {
                mapLayerStatusStore.set("tooLarge");
                return [];
            }
            return buildMapLayerCommands(wamFile, entitiesManager, diff);
        };

        this.mapEditorModeManager.executeCommands(factory).catch((error: unknown) => {
            const cause = asError(error);
            console.error("Failed to edit the map layer", cause);
            mapLayerStatusStore.set("failed");
            Sentry.captureException(cause);
        });
    }
}
