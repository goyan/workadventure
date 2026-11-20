import * as Phaser from "phaser";
import type { EditMapCommandMessage } from "@workadventure/messages";
import * as Sentry from "@sentry/svelte";
import { asError } from "catch-unknown";
import { get } from "svelte/store";
import type { FloorFamily, WallHeight, WallTint } from "../MapLayer/MapLayerCatalog";
import {
    mapLayerCatalogAvailableStore,
    mapLayerDoorHeightStore,
    mapLayerDoorHeightsAvailableStore,
    mapLayerDoorGlazedStore,
    mapLayerGlazedDoorHeightsAvailableStore,
    mapLayerGlazedDoorsAvailableStore,
    mapLayerDoorsAvailableStore,
    mapLayerHeightRequestStore,
    mapLayerHeightSelectionStore,
    mapLayerFloorFamilyStore,
    mapLayerFloorSwatchesStore,
    mapLayerWallSwatchesStore,
    mapLayerModeStore,
    mapLayerStatusStore,
    mapLayerWallHeightStore,
    mapLayerWallHeightsAvailableStore,
    mapLayerWallTintStore,
    mapLayerWindowHeightStore,
    mapLayerWindowHeightsAvailableStore,
    mapLayerWindowsAvailableStore,
    isFloorMode,
    mapLayerFloorsAvailableStore,
    mapLayerGlassSlabsAvailableStore,
    mapLayerShortStairsAvailableStore,
    mapLayerPickLevelStore,
    mapLayerLevelStore,
    mapLayerLevelsStore,
    isWallLevelMode,
    mapLayerUpperWallsAvailableStore,
    usesLevel,
} from "../../../../Stores/MapLayerStore";
import { mapEditorPlacementLevelStore, mapEditorVisibilityStore } from "../../../../Stores/MapEditorStore";
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
    MAP_LAYER_WALL_HEIGHTS,
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
import { computePlacements, diffPlacements } from "../MapLayer/MapLayerAutotile";
import { MAX_ENTITIES_PER_OPERATION, buildMapLayerCommands } from "../MapLayer/MapLayerSync";
import { applyHeight, buildHeightPicker, selectionHeight } from "../MapLayer/MapLayerHeightEdit";
import type { HeightPicker, HeightTarget } from "../MapLayer/MapLayerHeightEdit";
import type { MapLayerPlacement, PlacedMapLayerEntity } from "../MapLayer/MapLayerAutotile";
import type { MapLayerModel } from "../MapLayer/MapLayerModel";
import {
    applyDoorPlan,
    applyFloor,
    applyRoom,
    applyWalls,
    applyWindows,
    cellAt,
    moveWindow,
    cellsBetween,
    doorPixelRect,
    doorUnderPoint,
    ERASER_VERTICAL_HIT_WIDTH,
    eraseAt,
    eraseFloorsAlong,
    eraseTargetAt,
    eraseWallsAlong,
    wallEdgesToErase,
    floodFillCells,
    lineWallEdges,
    modelFromPlacedPrefabs,
    planDoorAt,
    rectangleCells,
    vertexAt,
    windowEdgesBetween,
} from "../MapLayer/MapLayerOperations";
import type { DoorHeightSetting, DoorPlanOptions, MapBounds, Point } from "../MapLayer/MapLayerOperations";
import {
    MAP_LAYER_FLOOR_SLAB_COLLECTION,
    SLAB_GLASS_FAMILY,
    slabPrefabName,
    stairPrefabName,
} from "../MapLayer/MapLayerFloors";
import { stepLevel, steppableLevels } from "../MapLayer/FloorOperations";
import { FLOOR_PREVIEW_DEPTH } from "../MapLayer/FloorDepth";
import { levelItems, levelOfWallAt, levelPlacedKey, levelPlacements, upperPrefabOf } from "../MapLayer/MapLayerLevels";
import type { LevelPlaced } from "../MapLayer/MapLayerLevels";
import { MapEditorTool } from "./MapEditorTool";
import { MapLayerFloorEditing } from "./MapLayerFloorEditing";

/** The chosen height, or 1 when the catalogs of the room do not have its pieces. */
function availableHeight(chosen: WallHeight, available: readonly WallHeight[]): WallHeight {
    return available.includes(chosen) ? chosen : 1;
}

/** The walls, doors and windows selected in the height mode. */
const HEIGHT_SELECTION_COLOR = 0x3b82f6;

/** Above every entity, those of the raised floors too: the preview must stay readable over them. */
const PREVIEW_DEPTH = FLOOR_PREVIEW_DEPTH;

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
    /** In the height mode, what the drag picks, read from the model of the start of the gesture. */
    picker?: HeightPicker;
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
    /** What the pointer picks in the height mode, built from `hoverModel`. */
    private hoverPicker: HeightPicker | undefined;
    /** The walls, doors and windows selected in the height mode. */
    private heightSelection: HeightTarget[] = [];
    private unsubscribeHeightRequest: (() => void) | undefined;
    private unsubscribeMode: (() => void) | undefined;
    private unsubscribeLevelChoice: (() => void) | undefined;
    /**
     * Keeps a mouse gesture on the canvas while it crosses HTML overlays (the editor panel, the action bar, video
     * bubbles): without it the browser sends the moves to the overlay and Phaser reports that the pointer left the game.
     */
    private pointerCapture: MapDragPointerCapture | undefined;
    /** The raised floors: slabs, stairs and their wells. */
    private floorEditing: MapLayerFloorEditing | undefined;

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
        this.floorEditing = new MapLayerFloorEditing(this.scene, this.mapEditorModeManager, () => this.getBounds());
        this.floorEditing.activate();
        this.forgetHoverModel();
        this.setHeightSelection([], undefined);
        this.unsubscribeHeightRequest = mapLayerHeightRequestStore.subscribe((height) => {
            if (height === undefined) return;
            mapLayerHeightRequestStore.set(undefined);
            this.applySelectionHeight(height);
        });
        // The level chosen in the panel (shared with the objects): a number is the level edited; "auto" follows the
        // floor drawn under the pointer (see `followPointerLevel`).
        this.unsubscribeLevelChoice = mapEditorPlacementLevelStore.subscribe((choice) => {
            if (choice === "auto" || choice === get(mapLayerLevelStore)) return;
            mapLayerLevelStore.set(choice);
            this.forgetHoverModel();
            this.redraw();
        });
        // The selection belongs to the height mode: choosing another mode lets it go.
        this.unsubscribeMode = mapLayerModeStore.subscribe((mode) => {
            if (mode !== "height" && this.heightSelection.length > 0) {
                this.setHeightSelection([], undefined);
                this.redraw();
            }
        });
        this.checkCatalogs().catch((error: unknown) => {
            console.error("Map layer catalog check failed", error);
            mapLayerCatalogAvailableStore.set(false);
        });
    }

    public clear(): void {
        this.active = false;
        this.gesture = undefined;
        this.hover = undefined;
        this.unsubscribeHeightRequest?.();
        this.unsubscribeHeightRequest = undefined;
        this.unsubscribeLevelChoice?.();
        this.unsubscribeLevelChoice = undefined;
        this.unsubscribeMode?.();
        this.unsubscribeMode = undefined;
        this.setHeightSelection([], undefined);
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpOutsideEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.removeEventListener("blur", this.cancelEventHandler);
        this.pointerCapture?.destroy();
        this.pointerCapture = undefined;
        this.floorEditing?.clear();
        this.floorEditing = undefined;
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
            if (!this.gesture && this.heightSelection.length > 0) {
                this.setHeightSelection([], undefined);
                this.redraw();
            }
            this.cancelGesture();
            mapLayerPickLevelStore.set(false);
        }
        // Page Up and Page Down change the floor being edited, in the modes of the raised floors.
        if (
            (event.key === "PageUp" || event.key === "PageDown") &&
            usesLevel(get(mapLayerModeStore), get(mapLayerUpperWallsAvailableStore))
        ) {
            event.preventDefault();
            // One level up or down: a level chosen, any level (with or without slabs).
            mapEditorPlacementLevelStore.set(
                stepLevel(
                    steppableLevels(get(mapLayerLevelsStore)),
                    get(mapLayerLevelStore),
                    event.key === "PageUp" ? 1 : -1,
                ),
            );
            this.forgetHoverModel();
            this.redraw();
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
        mapLayerWallHeightsAvailableStore.set([1]);
        mapLayerGlazedDoorHeightsAvailableStore.set([1]);
        mapLayerDoorHeightsAvailableStore.set([1]);
        mapLayerWindowHeightsAvailableStore.set([1]);
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
        // The walls of the raised floors are optional too: the same pieces in collections of their own.
        const upperFacade = upperPrefabOf(
            MAP_LAYER_WALL_COLLECTION,
            mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, facadePrefabName("blanc", "mid")),
        );
        mapLayerUpperWallsAvailableStore.set(
            (await manager.getEntityPrefab(upperFacade.collectionName, upperFacade.prefabId)) !== undefined,
        );
        // The raised floors are optional.
        const slab = await manager.getEntityPrefab(
            MAP_LAYER_FLOOR_SLAB_COLLECTION,
            mapLayerPrefabId(MAP_LAYER_FLOOR_SLAB_COLLECTION, slabPrefabName("parquet-clair")),
        );
        mapLayerFloorsAvailableStore.set(slab !== undefined);
        // The glass slab came later: an older catalog does not have it.
        const glassSlab = await manager.getEntityPrefab(
            MAP_LAYER_FLOOR_SLAB_COLLECTION,
            mapLayerPrefabId(MAP_LAYER_FLOOR_SLAB_COLLECTION, slabPrefabName(SLAB_GLASS_FAMILY)),
        );
        mapLayerGlassSlabsAvailableStore.set(glassSlab !== undefined);
        // The new short stairs (-v2) came later too.
        const shortStair = await manager.getEntityPrefab(
            MAP_LAYER_FLOOR_SLAB_COLLECTION,
            mapLayerPrefabId(
                MAP_LAYER_FLOOR_SLAB_COLLECTION,
                stairPrefabName({ direction: "n", width: 1, rise: 52, open: false, short: true }),
            ),
        );
        mapLayerShortStairsAvailableStore.set(shortStair !== undefined);
        if (slab === undefined && isFloorMode(get(mapLayerModeStore))) mapLayerModeStore.set("wall");
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
                mapLayerPrefabId(
                    MAP_LAYER_DOOR_COLLECTION,
                    doorPrefabName("h", "blanc", "g", undefined, false, 1, true),
                ),
            ));
        mapLayerGlazedDoorsAvailableStore.set(glazedDoor !== undefined);
        // The windows are optional too.
        const glazing = await manager.getEntityPrefab(
            MAP_LAYER_WINDOW_COLLECTION,
            mapLayerPrefabId(MAP_LAYER_WINDOW_COLLECTION, windowPrefabName("blanc", "mid")),
        );
        mapLayerWindowsAvailableStore.set(glazing !== undefined);
        if (glazing === undefined && get(mapLayerModeStore) === "window") mapLayerModeStore.set("wall");

        // The high walls, doors and windows are optional: a height is offered when the catalog has a sample of it.
        const tint = MAP_LAYER_WALL_TINTS[0];
        const heightsWith = async (sample: (height: WallHeight) => [string, string]): Promise<WallHeight[]> => {
            const found = await Promise.all(
                MAP_LAYER_WALL_HEIGHTS.map((height) =>
                    height === 1 ? Promise.resolve(true) : manager.getEntityPrefab(...sample(height)).then(Boolean),
                ),
            );
            return MAP_LAYER_WALL_HEIGHTS.filter((_, index) => found[index]);
        };
        const [wallHeights, doorHeights, windowHeights, glazedDoorHeights] = await Promise.all([
            heightsWith((height) => [
                MAP_LAYER_WALL_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, facadePrefabName(tint, "mid", height)),
            ]),
            door === undefined
                ? Promise.resolve<WallHeight[]>([1])
                : heightsWith((height) => [
                      MAP_LAYER_DOOR_COLLECTION,
                      mapLayerPrefabId(
                          MAP_LAYER_DOOR_COLLECTION,
                          doorPrefabName("h", tint, "g", undefined, false, height),
                      ),
                  ]),
            glazing === undefined
                ? Promise.resolve<WallHeight[]>([1])
                : heightsWith((height) => [
                      MAP_LAYER_WINDOW_COLLECTION,
                      mapLayerPrefabId(MAP_LAYER_WINDOW_COLLECTION, windowPrefabName(tint, "mid", height)),
                  ]),
            // A glazed door of a height is offered when the catalog has it (`porte-h-<teinte>-g-vitree-hN`).
            glazedDoor === undefined
                ? Promise.resolve<WallHeight[]>([1])
                : heightsWith((height) => [
                      MAP_LAYER_DOOR_COLLECTION,
                      mapLayerPrefabId(
                          MAP_LAYER_DOOR_COLLECTION,
                          doorPrefabName("h", tint, "g", undefined, false, height, true),
                      ),
                  ]),
        ]);
        mapLayerWallHeightsAvailableStore.set(wallHeights);
        mapLayerDoorHeightsAvailableStore.set(doorHeights);
        mapLayerGlazedDoorHeightsAvailableStore.set(glazedDoorHeights);
        mapLayerWindowHeightsAvailableStore.set(windowHeights);
        // A height the catalogs do not have goes back to 1.
        mapLayerWallHeightStore.update((height) => availableHeight(height, wallHeights));
        mapLayerDoorHeightStore.update((height) => (height === "auto" ? height : availableHeight(height, doorHeights)));
        mapLayerWindowHeightStore.update((height) => availableHeight(height, windowHeights));

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

    /**
     * The level the wall modes edit: the raised floor chosen in the panel, when the room has the catalogs of the walls
     * of the floors. The floor modes of the ground always edit the ground (the floor of a raised floor is its slabs,
     * which have their own modes).
     */
    private editedLevel(): number {
        return isWallLevelMode(get(mapLayerModeStore)) && get(mapLayerUpperWallsAvailableStore)
            ? get(mapLayerLevelStore)
            : 0;
    }

    /**
     * A door, a window or a height is set on a wall already there: a click on a wall of another level than the one
     * being edited goes to the level of that wall, instead of doing nothing.
     */
    private retargetLevel(pointer: Phaser.Input.Pointer): void {
        const mode = get(mapLayerModeStore);
        if ((mode !== "door" && mode !== "window" && mode !== "height") || !get(mapLayerUpperWallsAvailableStore)) {
            return;
        }
        const current = get(mapLayerLevelStore);
        const level = levelOfWallAt(
            (at) => this.readModel(at),
            get(mapLayerLevelsStore),
            current,
            pointer.worldX,
            pointer.worldY,
        );
        if (level !== current) this.setLevel(level);
    }

    /** Edits a level: the one chosen in the panel too, unless it follows the pointer. */
    private setLevel(level: number): void {
        if (get(mapEditorPlacementLevelStore) === "auto") {
            mapLayerLevelStore.set(level);
        } else {
            mapEditorPlacementLevelStore.set(level);
            mapLayerLevelStore.set(level);
        }
        this.forgetHoverModel();
    }

    /** With the level on "auto": the level edited is the floor drawn under the pointer, the ground elsewhere. */
    private followPointerLevel(pointer: Phaser.Input.Pointer): void {
        if (get(mapEditorPlacementLevelStore) !== "auto" || !this.floorEditing) return;
        const level = this.floorEditing.levelAt({ x: pointer.worldX, y: pointer.worldY });
        if (level !== get(mapLayerLevelStore)) this.setLevel(level);
    }

    /** A point of the screen as the level being edited reads it: over the ground further south. */
    private worldOf(pointer: Phaser.Input.Pointer): Point {
        return { x: pointer.worldX, y: pointer.worldY + this.editedLevel() };
    }

    private readLevelEntities(): (LevelPlaced & { entityId: string })[] {
        const items = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            items.push({
                entityId: entity.entityId,
                x: entity.x,
                y: entity.y,
                collectionName: prefab.collectionName,
                prefabId: prefab.id,
                elevation: entity.getElevation(),
            });
        }
        return items;
    }

    /** The model of the level being edited, read as if its pieces stood on the ground. */
    private readModel(level = this.editedLevel()): MapLayerModel {
        return modelFromPlacedPrefabs(levelItems(this.readLevelEntities(), level));
    }

    private readPlacedEntities(level = this.editedLevel()): PlacedMapLayerEntity[] {
        const placed: PlacedMapLayerEntity[] = [];
        for (const entity of this.readLevelEntities()) {
            const key = levelPlacedKey(entity, level);
            if (key !== undefined) placed.push({ entityId: entity.entityId, key });
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
        // The pipette: Alt or Cmd + click, or a click armed by the panel, picks the floor under the pointer.
        if (pointer.event.altKey || pointer.event.metaKey || get(mapLayerPickLevelStore)) {
            mapLayerPickLevelStore.set(false);
            this.floorEditing?.pickLevel({ x: pointer.worldX, y: pointer.worldY });
            this.pointerCapture?.release();
            this.forgetHoverModel();
            this.redraw();
            return;
        }
        this.followPointerLevel(pointer);
        this.retargetLevel(pointer);
        const world = this.worldOf(pointer);
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
            picker: get(mapLayerModeStore) === "height" ? buildHeightPicker(baseModel) : undefined,
        };
        // Filling reacts to the click itself.
        this.redraw();
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
        const gesture = this.gesture;
        if (!gesture) {
            if (this.canDraw()) {
                this.followPointerLevel(pointer);
                // On "auto", a wall of another level under the pointer shows where its door or window would go.
                if (get(mapEditorPlacementLevelStore) === "auto") this.retargetLevel(pointer);
                this.hover = this.worldOf(pointer);
                this.redraw();
            }
            return;
        }
        if (gesture.pointerId !== pointer.id) return;
        if (!pointer.leftButtonDown() || !isPointerInsideCanvas(this.scene, pointer)) {
            this.cancelGesture();
            return;
        }
        const world = this.worldOf(pointer);
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
        const mode = get(mapLayerModeStore);
        if (isFloorMode(mode)) {
            this.gesture = undefined;
            this.pointerCapture?.release();
            this.floorEditing?.commit(gesture.startWorld, gesture.currentWorld);
            return;
        }
        if (mode === "height") {
            // A click or a drag selects, it changes nothing on the map.
            this.gesture = undefined;
            this.pointerCapture?.release();
            this.setHeightSelection(
                gesture.picker?.along(gesture.startWorld, gesture.currentWorld) ?? [],
                gesture.baseModel,
            );
            this.redraw();
            return;
        }
        const operation = this.buildOperation(gesture);
        this.gesture = undefined;
        this.pointerCapture?.release();
        this.clearPreview();
        if (operation) {
            this.commit(operation);
        } else if (mode === "door" && !this.onPlacedDoor(gesture)) {
            mapLayerStatusStore.set("doorInvalid");
        } else if (mode === "window" && !this.droppedInPlace(gesture)) {
            mapLayerStatusStore.set("windowInvalid");
        }
    }

    /** The model of the map for the hover previews, and what it picks in the height mode: read again after an edit. */
    private forgetHoverModel(): void {
        this.hoverModel = undefined;
        this.hoverPicker = undefined;
    }

    private getHoverPicker(): HeightPicker {
        this.hoverModel ??= this.readModel();
        this.hoverPicker ??= buildHeightPicker(this.hoverModel);
        return this.hoverPicker;
    }

    /** Selects the walls, doors and windows of the height mode, and tells the panel their height. */
    private setHeightSelection(targets: HeightTarget[], model: MapLayerModel | undefined): void {
        this.heightSelection = targets;
        const kinds = new Set(targets.map((target) => target.kind));
        let available: readonly WallHeight[] = MAP_LAYER_WALL_HEIGHTS;
        const keep = (heights: readonly WallHeight[]): void => {
            available = available.filter((height) => heights.includes(height));
        };
        if (kinds.has("wall")) keep(get(mapLayerWallHeightsAvailableStore));
        if (kinds.has("door")) keep(get(mapLayerDoorHeightsAvailableStore));
        if (kinds.has("window")) keep(get(mapLayerWindowHeightsAvailableStore));
        mapLayerHeightSelectionStore.set({
            count: targets.length,
            height: model && targets.length > 0 ? selectionHeight(model, targets) : undefined,
            available: targets.length > 0 ? available : [1],
        });
    }

    /** Gives the selection a height, in one command (one undo step); the selection stays. */
    private applySelectionHeight(height: WallHeight): void {
        const targets = this.heightSelection;
        if (!this.canDraw() || targets.length === 0) return;
        if (!get(mapLayerHeightSelectionStore).available.includes(height)) return;
        this.commit(
            (model) => applyHeight(model, targets, height),
            () => {
                const model = this.readModel();
                this.hoverModel = model;
                if (this.heightSelection === targets) this.setHeightSelection(targets, model);
                this.redraw();
            },
        );
    }

    /** A moved window released on its own segment: nothing to do, nothing to explain. */
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
        const wallHeight = availableHeight(get(mapLayerWallHeightStore), get(mapLayerWallHeightsAvailableStore));
        const doorSetting = this.doorHeightSetting();
        const windowHeight = availableHeight(get(mapLayerWindowHeightStore), get(mapLayerWindowHeightsAvailableStore));
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
                return edges.length === 0
                    ? undefined
                    : (model, bounds) => applyWalls(model, edges, tint, bounds, wallHeight);
            }
            case "room":
                return (model, bounds) => applyRoom(model, startCell, endCell, tint, family, bounds, wallHeight);
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
                // A new door, or the settings of the panel (height, glazed) for the door placed there, or a flip of a
                // door that has them already; the model of the commit is read again.
                const options = this.doorPlanOptions();
                const plan = planDoorAt(gesture.baseModel, worldPath.end.x, worldPath.end.y, doorSetting, options);
                return plan.action === "invalid"
                    ? undefined
                    : (model, bounds) =>
                          applyDoorPlan(
                              model,
                              planDoorAt(model, worldPath.end.x, worldPath.end.y, doorSetting, options),
                              bounds,
                          );
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
                          applyWindows(model, edges, windowHeight);
                      };
            }
            case "height":
                // The height mode selects on pointer up; a height is applied from the panel.
                return undefined;
            case "slab":
            case "slabErase":
            case "stair":
                // The floors have their own model: see MapLayerFloorEditing.
                return undefined;
            case "erase": {
                // What the press starts on decides what is erased: from a wall, the walls of its line (floors stay);
                // from a floor, the floors passed over (walls stay).
                const walls = wallEdgesToErase(gesture.baseModel, worldPath.start, worldPath.end);
                if (walls === undefined) {
                    return (model) => eraseFloorsAlong(model, worldPath.start, worldPath.end, path);
                }
                if (walls.length <= 1) {
                    // A click: what is under the cursor, a door or a window before its wall.
                    return (model) => {
                        eraseAt(model, worldPath.start.x, worldPath.start.y, new Set(), ERASER_VERTICAL_HIT_WIDTH);
                    };
                }
                return (model) => eraseWallsAlong(model, worldPath.start, worldPath.end);
            }
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
        // The previews are drawn where the pieces stand; on a raised floor they show its altitude higher.
        graphics.setY(-this.editedLevel());
        const size = MAP_LAYER_TILE_SIZE;
        const gesture = this.gesture;
        if (isFloorMode(get(mapLayerModeStore))) {
            this.floorEditing?.draw(gesture?.startWorld, gesture?.currentWorld ?? this.hover);
            return;
        }
        this.floorEditing?.draw(undefined, undefined);

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
                } else if (mode === "height") {
                    const picker = this.getHoverPicker();
                    this.drawHeightSelection(graphics, picker, this.heightSelection);
                    for (const rect of picker.rects(picker.select(picker.at(this.hover.x, this.hover.y)))) {
                        graphics.lineStyle(2, 0xffffff, 0.9).strokeRect(rect.x, rect.y, rect.width, rect.height);
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

        if (get(mapLayerModeStore) === "height") {
            if (gesture.picker) {
                this.drawHeightSelection(
                    graphics,
                    gesture.picker,
                    gesture.picker.along(gesture.startWorld, gesture.currentWorld),
                );
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

    /** The selection of the height mode, over the sprites of its walls, doors and windows. */
    private drawHeightSelection(
        graphics: Phaser.GameObjects.Graphics,
        picker: HeightPicker,
        targets: readonly HeightTarget[],
    ): void {
        for (const rect of picker.rects(targets)) {
            graphics
                .fillStyle(HEIGHT_SELECTION_COLOR, 0.3)
                .fillRect(rect.x, rect.y, rect.width, rect.height)
                .lineStyle(2, HEIGHT_SELECTION_COLOR, 0.9)
                .strokeRect(rect.x, rect.y, rect.width, rect.height);
        }
    }

    /**
     * The door a click would place (or the placed door it would change): green when the click does something, red when
     * it does not.
     */
    private drawDoorPreview(graphics: Phaser.GameObjects.Graphics, model: MapLayerModel, world: Point): void {
        const plan = planDoorAt(model, world.x, world.y, this.doorHeightSetting(), this.doorPlanOptions());
        const { x, y, width, height } = doorPixelRect(plan.door);
        graphics.fillStyle(plan.action !== "invalid" ? 0x2ecc71 : 0xff3b30, 0.45).fillRect(x, y, width, height);
    }

    /** The height setting of the doors: Auto, or the chosen height (one the catalogs lack goes back to 1 in the plan). */
    private doorHeightSetting(): DoorHeightSetting {
        return get(mapLayerDoorHeightStore);
    }

    /** The glazed switch and what the catalogs have, for the plan of a door-mode click. */
    private doorPlanOptions(): DoorPlanOptions {
        const glazedAvailable = get(mapLayerGlazedDoorsAvailableStore);
        const plain = get(mapLayerDoorHeightsAvailableStore);
        const glazedHeights = get(mapLayerGlazedDoorHeightsAvailableStore);
        return {
            glazed: get(mapLayerDoorGlazedStore) && glazedAvailable,
            glazedAvailable,
            heightsAvailable: (glazed) => (glazed ? glazedHeights : plain),
        };
    }

    /** Whether a door-mode click hit a placed horizontal door: it changes or flips it, or explains nothing when it cannot. */
    private onPlacedDoor(gesture: Gesture): boolean {
        const door = doorUnderPoint(gesture.baseModel, gesture.currentWorld.x, gesture.currentWorld.y);
        return door?.orientation === "h";
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
        const target = eraseTargetAt(model, world.x, world.y, ERASER_VERTICAL_HIT_WIDTH);
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
            case "bridge":
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

    /** Commits an edit as one undo step. `done` runs once the map has been changed. */
    private commit(operation: MapLayerOperation, done?: () => void): void {
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile) return;
        const entitiesManager = this.scene.getGameMapFrontWrapper().getEntitiesManager();
        const bounds = this.getBounds();
        const level = this.editedLevel();

        // The factory runs inside the command queue, right before execution: it reads the current state of the map.
        const factory = (): readonly FrontCommand[] => {
            const model = this.readModel(level);
            if (operation(model, bounds) === "fillTooLarge") {
                mapLayerStatusStore.set("fillTooLarge");
                return [];
            }
            const diff = diffPlacements(
                this.readPlacedEntities(level),
                levelPlacements(computePlacements(model), level),
            );
            if (diff.toCreate.length + diff.toDelete.length > MAX_ENTITIES_PER_OPERATION) {
                mapLayerStatusStore.set("tooLarge");
                return [];
            }
            const commands = buildMapLayerCommands(wamFile, entitiesManager, diff);
            if (level === 0) return commands;
            // On a raised floor, the floor of a room is slabs: laid with its walls, in the same undo step.
            const floors = [...model.getFloors()];
            const slabs =
                floors.length === 0
                    ? []
                    : this.floorEditing?.commandsFor((floorModel) => {
                          for (const floor of floors) floorModel.setSlab(level, floor.x, floor.y, floor.family);
                      });
            if (slabs === undefined) {
                mapLayerStatusStore.set("tooLarge");
                return [];
            }
            return [...commands, ...slabs];
        };

        this.forgetHoverModel();
        this.mapEditorModeManager
            .executeCommands(factory)
            .then(() => {
                this.forgetHoverModel();
                this.floorEditing?.refreshLevels();
                done?.();
            })
            .catch((error: unknown) => {
                const cause = asError(error);
                console.error("Failed to edit the map layer", cause);
                mapLayerStatusStore.set("failed");
                Sentry.captureException(cause);
            });
    }
}
