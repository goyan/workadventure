import * as Phaser from "phaser";
import type { EditMapCommandMessage } from "@workadventure/messages";
import * as Sentry from "@sentry/svelte";
import { asError } from "catch-unknown";
import { get } from "svelte/store";
import type { FloorFamily, WallTint } from "../MapLayer/MapLayerCatalog";
import {
    mapLayerCatalogAvailableStore,
    mapLayerDoorGlazedStore,
    mapLayerDoorsAvailableStore,
    mapLayerGlazedDoorsAvailableStore,
    mapLayerFloorFamilyStore,
    mapLayerFloorSwatchesStore,
    mapLayerWallSwatchesStore,
    mapLayerModeStore,
    mapLayerStatusStore,
    mapLayerWallTintStore,
    mapLayerWindowsAvailableStore,
} from "../../../../Stores/MapLayerStore";
import { mapEditorVisibilityStore } from "../../../../Stores/MapEditorStore";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../GameScene";
import type { FrontCommand } from "../Commands/FrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { isPointerInsideCanvas } from "../MapEditorPointer";
import { MapDragPointerCapture } from "../../../UserInput/MapDragPointerCapture";
import {
    MAP_LAYER_DOOR_COLLECTION,
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_FLOOR_FAMILIES,
    MAP_LAYER_TILE_SIZE,
    MAP_LAYER_WALL_TINTS,
    MAP_LAYER_WALL_COLLECTION,
    MAP_LAYER_WINDOW_COLLECTION,
    WALL_HALF,
    WALL_THICKNESS,
    doorPrefabName,
    facadePrefabName,
    floorPrefabName,
    mapLayerPieceSize,
    mapLayerPrefabId,
    parseMapLayerPrefab,
    windowPrefabName,
} from "../MapLayer/MapLayerCatalog";
import { computePlacements, diffPlacements, placementKey } from "../MapLayer/MapLayerAutotile";
import { MAX_ENTITIES_PER_OPERATION, buildMapLayerCommands } from "../MapLayer/MapLayerSync";
import type { MapLayerPlacement, PlacedMapLayerEntity } from "../MapLayer/MapLayerAutotile";
import type { MapLayerModel } from "../MapLayer/MapLayerModel";
import { cellKey } from "../MapLayer/MapLayerModel";
import {
    applyDoor,
    applyFloor,
    applyWalls,
    applyWindows,
    cellAt,
    moveWindow,
    cellsBetween,
    doorCandidateAt,
    doorPixelRect,
    doorUnderPoint,
    eraseAt,
    eraseTargetAt,
    floodFillCells,
    lineWallEdges,
    modelFromPlacedPrefabs,
    rectangleCells,
    roomWallEdges,
    vertexAt,
    windowEdgesBetween,
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
    /** In the window mode, a press on a placed window moves it: the tile of that window. */
    movedWindow?: Point;
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
    /** The cursor this tool asked for: a placed window shows a hand that can grab it. */
    private cursor = "";
    /** The model read for the door preview, which follows the cursor: read again when the map has been edited. */
    private hoverModel: MapLayerModel | undefined;
    /**
     * Keeps a mouse gesture on the canvas while it crosses HTML overlays (the editor panel, the action bar, video
     * bubbles): without it the browser sends the moves to the overlay and Phaser reports that the pointer left the game.
     */
    private pointerCapture: MapDragPointerCapture | undefined;

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
    private readonly gameOutEventHandler = (): void => {
        // A captured gesture never really leaves the canvas: it ends on pointer up or Escape.
        if (this.pointerCapture?.active) return;
        this.cancelGesture();
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
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.addEventListener("blur", this.cancelEventHandler);
        this.pointerCapture = new MapDragPointerCapture(
            this.scene.game.canvas,
            () => this.canStartGesture(),
            () => this.cancelGesture(),
        );
        mapEditorVisibilityStore.set(true);
        mapLayerStatusStore.set(undefined);
        this.hoverModel = undefined;
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
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.removeEventListener("blur", this.cancelEventHandler);
        this.pointerCapture?.destroy();
        this.pointerCapture = undefined;
        this.graphics?.destroy();
        this.graphics = undefined;
        this.setCursor("");
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
        // The doors of the previous room must not stay available while this room's catalogs are checked.
        mapLayerDoorsAvailableStore.set(false);
        mapLayerGlazedDoorsAvailableStore.set(false);
        mapLayerWindowsAvailableStore.set(false);
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
        // The doors are optional: a room whose catalogs do not have them keeps the floors and the walls.
        const door = await manager.getEntityPrefab(
            MAP_LAYER_DOOR_COLLECTION,
            mapLayerPrefabId(MAP_LAYER_DOOR_COLLECTION, doorPrefabName("h", "blanc", "g")),
        );
        mapLayerDoorsAvailableStore.set(door !== undefined);
        // The door button is disabled without doors: leave a mode that could not draw anything.
        if (door === undefined && get(mapLayerModeStore) === "door") mapLayerModeStore.set("wall");
        // The glazed doors are optional within the doors: without them the switch is off and doors are plain.
        const glazedDoor =
            door &&
            (await manager.getEntityPrefab(
                MAP_LAYER_DOOR_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_DOOR_COLLECTION, doorPrefabName("h", "blanc", "g", undefined, false, true)),
            ));
        mapLayerGlazedDoorsAvailableStore.set(glazedDoor !== undefined);
        // The windows are optional too.
        const glazing = await manager.getEntityPrefab(
            MAP_LAYER_WINDOW_COLLECTION,
            mapLayerPrefabId(MAP_LAYER_WINDOW_COLLECTION, windowPrefabName("blanc", "mid")),
        );
        mapLayerWindowsAvailableStore.set(glazing !== undefined);
        if (glazing === undefined && get(mapLayerModeStore) === "window") mapLayerModeStore.set("wall");

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

    /** Whether a press can start a gesture now: the capture is only taken for a press that draws. */
    private canStartGesture(): boolean {
        return this.canDraw() && !this.gesture && !this.placedModeUnavailable();
    }

    /** The door or window mode in a room whose catalogs do not have them: a click draws nothing. */
    private placedModeUnavailable(): boolean {
        const mode = get(mapLayerModeStore);
        return (
            (mode === "door" && !get(mapLayerDoorsAvailableStore)) ||
            (mode === "window" && !get(mapLayerWindowsAvailableStore))
        );
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
        if (this.placedModeUnavailable()) {
            mapLayerStatusStore.set(get(mapLayerModeStore) === "door" ? "doorsUnavailable" : "windowsUnavailable");
            return;
        }
        mapLayerStatusStore.set(undefined);
        const world = { x: pointer.worldX, y: pointer.worldY };
        const baseModel = this.readModel();
        const startCell = cellAt(world.x, world.y);
        this.gesture = {
            pointerId: pointer.id,
            startWorld: world,
            currentWorld: world,
            path: [startCell],
            baseModel,
            movedWindow:
                get(mapLayerModeStore) === "window" && baseModel.hasWindow(startCell.x, startCell.y)
                    ? startCell
                    : undefined,
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
        const mode = get(mapLayerModeStore);
        this.gesture = undefined;
        this.pointerCapture?.release();
        this.clearPreview();
        if (operation) {
            this.commit(operation);
        } else if (mode === "door" && !this.doorAlreadyChosen(gesture)) {
            mapLayerStatusStore.set("doorInvalid");
        } else if (mode === "window" && !this.droppedInPlace(gesture)) {
            mapLayerStatusStore.set("windowInvalid");
        }
    }

    /** A moved window released on its own segment: nothing to do, nothing to explain. */
    /** Whether a door-mode click hit a door already of the chosen variant: nothing to do, nothing to explain. */
    private doorAlreadyChosen(gesture: Gesture): boolean {
        const door = doorUnderPoint(gesture.baseModel, gesture.currentWorld.x, gesture.currentWorld.y);
        return door?.orientation === "h" && (door.glazed === true) === this.doorGlazed();
    }

    /** The variant the door mode places: glazed only with the switch on and the glazed doors in the catalog. */
    private doorGlazed(): boolean {
        return get(mapLayerDoorGlazedStore) && get(mapLayerGlazedDoorsAvailableStore);
    }

    private droppedInPlace(gesture: Gesture): boolean {
        const end = cellAt(gesture.currentWorld.x, gesture.currentWorld.y);
        return gesture.movedWindow !== undefined && end.x === gesture.movedWindow.x && end.y === gesture.movedWindow.y;
    }

    private cancelGesture(): void {
        this.pointerCapture?.release();
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
            case "door": {
                const glazed = this.doorGlazed();
                const candidate = doorCandidateAt(gesture.baseModel, worldPath.end.x, worldPath.end.y);
                if (candidate.valid) {
                    const door = { orientation: candidate.orientation, x: candidate.x, y: candidate.y, glazed };
                    return (model, bounds) => applyDoor(model, door, bounds);
                }
                // A click on a placed horizontal door of the other variant switches it.
                const placed = doorUnderPoint(gesture.baseModel, worldPath.end.x, worldPath.end.y);
                if (placed?.orientation === "h" && (placed.glazed === true) !== glazed) {
                    return (model) => {
                        model.setDoorGlazed(placed, glazed);
                    };
                }
                return undefined;
            }
            case "window": {
                const from = gesture.movedWindow;
                if (from) {
                    if (this.droppedInPlace(gesture)) return undefined;
                    return moveWindow(gesture.baseModel.clone(), from, endCell)
                        ? (model) => {
                              moveWindow(model, from, endCell);
                          }
                        : undefined;
                }
                const edges = windowEdgesBetween(gesture.baseModel, startCell, endCell)
                    .filter((candidate) => candidate.valid)
                    .map((candidate) => candidate.edge);
                return edges.length === 0
                    ? undefined
                    : (model) => {
                          applyWindows(model, edges);
                      };
            }
            case "erase":
                return (model) => {
                    const keptEdges = new Set<string>();
                    // The tiles where a door has been erased: the floor of a tile is not erased with a door that stands on it.
                    const doorTiles = new Set<string>();
                    // Walk along the drag in steps shorter than a wall so no thin wall is jumped over.
                    const steps = Math.max(
                        1,
                        Math.ceil(
                            Math.hypot(worldPath.end.x - worldPath.start.x, worldPath.end.y - worldPath.start.y) / 4,
                        ),
                    );
                    for (let step = 0; step <= steps; step++) {
                        const ratio = step / steps;
                        const x = worldPath.start.x + (worldPath.end.x - worldPath.start.x) * ratio;
                        const y = worldPath.start.y + (worldPath.end.y - worldPath.start.y) * ratio;
                        if (eraseAt(model, x, y, keptEdges)) {
                            const tile = cellAt(x, y);
                            doorTiles.add(cellKey(tile.x, tile.y));
                        }
                    }
                    // A freehand erase passes through every tile of the path, not only the straight line.
                    for (const cell of path) {
                        if (doorTiles.has(cellKey(cell.x, cell.y))) continue;
                        eraseAt(
                            model,
                            cell.x * MAP_LAYER_TILE_SIZE + MAP_LAYER_TILE_SIZE / 2,
                            cell.y * MAP_LAYER_TILE_SIZE + MAP_LAYER_TILE_SIZE / 2,
                            keptEdges,
                        );
                    }
                };
        }
    }

    private setCursor(cursor: string): void {
        if (cursor === this.cursor) return;
        this.cursor = cursor;
        this.scene.input.setDefaultCursor(cursor);
    }

    /** In the window mode, a hand over a placed window (it can be dragged), a closed hand while it is moved. */
    private wantedCursor(): string {
        if (get(mapLayerModeStore) !== "window" || !get(mapLayerWindowsAvailableStore)) return "";
        if (this.gesture) return this.gesture.movedWindow ? "grabbing" : "";
        if (!this.hover) return "";
        this.hoverModel ??= this.readModel();
        const cell = cellAt(this.hover.x, this.hover.y);
        return this.hoverModel.hasWindow(cell.x, cell.y) ? "grab" : "";
    }

    private redraw(): void {
        const graphics = this.graphics;
        if (!graphics) return;
        this.setCursor(this.wantedCursor());
        graphics.clear();
        const size = MAP_LAYER_TILE_SIZE;
        const gesture = this.gesture;

        if (!gesture) {
            if (this.hover) {
                const mode = get(mapLayerModeStore);
                if (mode === "door") {
                    // Without doors a click does nothing: no preview that would suggest otherwise.
                    if (!get(mapLayerDoorsAvailableStore)) {
                        this.scene.markDirty();
                        return;
                    }
                    this.hoverModel ??= this.readModel();
                    this.drawDoorPreview(graphics, this.hoverModel, this.hover);
                } else if (mode === "window") {
                    if (!get(mapLayerWindowsAvailableStore)) {
                        this.scene.markDirty();
                        return;
                    }
                    this.hoverModel ??= this.readModel();
                    const cell = cellAt(this.hover.x, this.hover.y);
                    if (this.hoverModel.hasWindow(cell.x, cell.y)) {
                        // A placed window: it can be grabbed and moved, not set again.
                        graphics
                            .fillStyle(0xffffff, 0.2)
                            .fillRect(
                                cell.x * MAP_LAYER_TILE_SIZE,
                                cell.y * MAP_LAYER_TILE_SIZE,
                                MAP_LAYER_TILE_SIZE,
                                MAP_LAYER_TILE_SIZE,
                            )
                            .lineStyle(2, 0xffffff, 0.9)
                            .strokeRect(
                                cell.x * MAP_LAYER_TILE_SIZE,
                                cell.y * MAP_LAYER_TILE_SIZE,
                                MAP_LAYER_TILE_SIZE,
                                MAP_LAYER_TILE_SIZE,
                            );
                    } else {
                        this.drawWindowPreview(graphics, this.hoverModel, cell, cell);
                    }
                } else if (mode === "erase") {
                    // What the eraser would remove under the cursor is highlighted in red: a door, a wall or a floor.
                    this.hoverModel ??= this.readModel();
                    this.drawEraseHover(graphics, this.hoverModel, this.hover);
                } else if (mode === "wall" || mode === "room") {
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

        if (get(mapLayerModeStore) === "door") {
            this.drawDoorPreview(graphics, gesture.baseModel, gesture.currentWorld);
            this.scene.markDirty();
            return;
        }
        if (get(mapLayerModeStore) === "window" && gesture.movedWindow) {
            this.drawWindowMovePreview(graphics, gesture);
            this.scene.markDirty();
            return;
        }
        if (get(mapLayerModeStore) === "window") {
            this.drawWindowPreview(
                graphics,
                gesture.baseModel,
                cellAt(gesture.startWorld.x, gesture.startWorld.y),
                cellAt(gesture.currentWorld.x, gesture.currentWorld.y),
            );
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

    /** The two segments the door would replace: green when it can be placed there, red when it cannot. */
    private drawDoorPreview(graphics: Phaser.GameObjects.Graphics, model: MapLayerModel, world: Point): void {
        const door = doorCandidateAt(model, world.x, world.y);
        const { x, y, width, height } = doorPixelRect(door);
        graphics.fillStyle(door.valid ? 0x2ecc71 : 0xff3b30, 0.45).fillRect(x, y, width, height);
    }

    /** The segments a window drag passes over: green where a window can go, red where it cannot. */
    private drawWindowPreview(
        graphics: Phaser.GameObjects.Graphics,
        model: MapLayerModel,
        fromCell: Point,
        toCell: Point,
    ): void {
        const size = MAP_LAYER_TILE_SIZE;
        for (const { edge, valid } of windowEdgesBetween(model, fromCell, toCell)) {
            graphics.fillStyle(valid ? 0x2ecc71 : 0xff3b30, 0.45).fillRect(edge.x * size, edge.y * size, size, size);
        }
    }

    /** A window being moved: its segment outlined, the target green when it can take the window, red otherwise. */
    private drawWindowMovePreview(graphics: Phaser.GameObjects.Graphics, gesture: Gesture): void {
        const size = MAP_LAYER_TILE_SIZE;
        const from = gesture.movedWindow;
        if (!from) return;
        const end = cellAt(gesture.currentWorld.x, gesture.currentWorld.y);
        graphics.lineStyle(2, 0xffffff, 0.8).strokeRect(from.x * size, from.y * size, size, size);
        if (this.droppedInPlace(gesture)) return;
        const valid = moveWindow(gesture.baseModel.clone(), from, end);
        graphics.fillStyle(valid ? 0x2ecc71 : 0xff3b30, 0.45).fillRect(end.x * size, end.y * size, size, size);
    }

    /** The thing the eraser would remove under the cursor, in red; a white outline of the tile when there is nothing. */
    private drawEraseHover(graphics: Phaser.GameObjects.Graphics, model: MapLayerModel, world: Point): void {
        const size = MAP_LAYER_TILE_SIZE;
        const target = eraseTargetAt(model, world.x, world.y);
        if (!target) {
            const cell = cellAt(world.x, world.y);
            graphics.lineStyle(2, 0xffffff, 0.8).strokeRect(cell.x * size, cell.y * size, size, size);
            return;
        }
        let rect: { x: number; y: number; width: number; height: number };
        switch (target.kind) {
            case "door":
                rect = doorPixelRect(target.door);
                break;
            case "wall":
                rect =
                    target.wall.orientation === "h"
                        ? { x: target.wall.x * size, y: target.wall.y * size, width: size, height: size }
                        : {
                              x: target.wall.x * size - WALL_HALF,
                              y: target.wall.y * size + WALL_THICKNESS,
                              width: WALL_THICKNESS,
                              height: size - WALL_THICKNESS,
                          };
                break;
            case "window":
                rect = { x: target.wall.x * size, y: target.wall.y * size, width: size, height: size };
                break;
            case "floor":
                rect = { x: target.cell.x * size, y: target.cell.y * size, width: size, height: size };
                break;
        }
        graphics
            .fillStyle(0xff3b30, 0.4)
            .fillRect(rect.x, rect.y, rect.width, rect.height)
            .lineStyle(2, 0xff3b30, 0.9)
            .strokeRect(rect.x, rect.y, rect.width, rect.height);
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

        this.hoverModel = undefined;
        this.mapEditorModeManager
            .executeCommands(factory)
            .then(() => {
                this.hoverModel = undefined;
            })
            .catch((error: unknown) => {
                const cause = asError(error);
                console.error("Failed to edit the map layer", cause);
                mapLayerStatusStore.set("failed");
                Sentry.captureException(cause);
            });
    }
}
