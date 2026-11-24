import * as Phaser from "phaser";
import { WamFile } from "@workadventure/map-editor";
import type { EntityPrefab, GameMap, WAMEntityData } from "@workadventure/map-editor";
import { mock } from "vitest-mock-extended";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import type { EntitiesCollectionsManager } from "../../../../src/front/Phaser/Game/MapEditor/EntitiesCollectionsManager";
import { MapLayerEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/MapLayerEditorTool";
import { MAP_LAYER_FLOOR_SLAB_COLLECTION } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { FloorModel, stairImagePosition } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import { computeFloorPlacements } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorOperations";
import { stairGroundBox, stairScreenBox } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
import type { StairShape } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
import { mapEditorPlacementLevelStore } from "../../../../src/front/Stores/MapEditorStore";
import {
    MAP_LAYER_DOOR_COLLECTION,
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_WALL_COLLECTION,
    MAP_LAYER_WINDOW_COLLECTION,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import {
    mapLayerCatalogAvailableStore,
    mapLayerDoorHeightStore,
    mapLayerDoorHeightsAvailableStore,
    mapLayerDoorGlazedStore,
    mapLayerDoorsAvailableStore,
    mapLayerGlazedDoorHeightsAvailableStore,
    mapLayerGlazedDoorsAvailableStore,
    mapLayerHeightRequestStore,
    mapLayerHeightSelectionStore,
    mapLayerModeStore,
    mapLayerShortStairsAvailableStore,
    mapLayerStatusStore,
    mapLayerWallHeightStore,
    mapLayerWallHeightsAvailableStore,
    mapLayerWindowHeightStore,
    mapLayerWindowHeightsAvailableStore,
    mapLayerWindowsAvailableStore,
} from "../../../../src/front/Stores/MapLayerStore";

/** The data of a placed entity, for the readers of its altitude: on the ground. */
const ENTITY_DATA = {
    x: 0,
    y: 0,
    name: "",
    properties: [],
    depthStep: 0,
    elevation: 0,
    prefabRef: { collectionName: "", id: "" },
};

function prefab(collectionName: string, id: string): EntityPrefab {
    return mock<EntityPrefab>({ collectionName, id, imagePath: `${id}.png` });
}

describe("MapLayerEditorTool gestures", () => {
    let canvas: HTMLCanvasElement;
    let inputEvents: Phaser.Events.EventEmitter;
    let input: ReturnType<typeof mock<Phaser.Input.InputPlugin>>;
    let modeManager: ReturnType<typeof mock<MapEditorModeManager>>;
    let collectionsManager: ReturnType<typeof mock<EntitiesCollectionsManager>>;
    let doorsInCatalog: boolean;
    let glazedDoorsInCatalog: boolean;
    let shortStairsInCatalog: boolean;
    let windowsInCatalog: boolean;
    /** Whether the catalogs have the pieces of the walls, doors and windows higher than 1. */
    let highPiecesInCatalog: boolean;
    let entities: Map<string, Entity>;
    let tool: MapLayerEditorTool;
    let capturedPointers: Set<number>;
    let previewGraphics: ReturnType<typeof mock<Phaser.GameObjects.Graphics>>;

    function pointer(worldX: number, worldY: number, pressed = true): Phaser.Input.Pointer {
        const result = mock<Phaser.Input.Pointer>({ id: 1, x: worldX, y: worldY, worldX, worldY, button: 0 });
        Object.defineProperty(result, "downElement", { configurable: true, value: canvas });
        const event = new MouseEvent("mousemove", { button: 0, clientX: worldX, clientY: worldY });
        Object.defineProperty(event, "target", { configurable: true, value: canvas });
        Object.defineProperty(result, "event", { configurable: true, value: event });
        result.leftButtonDown.mockReturnValue(pressed);
        return result;
    }

    /** The browser's pointerdown, which comes before the mousedown Phaser listens to. */
    function nativePointerDown(): void {
        const event = new MouseEvent("pointerdown", { button: 0, buttons: 1, bubbles: true });
        Object.defineProperty(event, "pointerId", { value: 7 });
        Object.defineProperty(event, "pointerType", { value: "mouse" });
        canvas.dispatchEvent(event);
    }

    function down(x: number, y: number): void {
        nativePointerDown();
        inputEvents.emit(Phaser.Input.Events.POINTER_DOWN, pointer(x, y), []);
    }

    function move(x: number, y: number): void {
        inputEvents.emit(Phaser.Input.Events.POINTER_MOVE, pointer(x, y), []);
    }

    function up(x: number, y: number): void {
        inputEvents.emit(Phaser.Input.Events.POINTER_UP, pointer(x, y, false), []);
    }

    async function settle(): Promise<void> {
        // The catalog checks chain several awaits: let them all run.
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    beforeEach(async () => {
        canvas = document.createElement("canvas");
        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 640, 640));
        capturedPointers = new Set();
        Object.assign(canvas, {
            setPointerCapture: vi.fn((id: number) => capturedPointers.add(id)),
            releasePointerCapture: vi.fn((id: number) => capturedPointers.delete(id)),
            hasPointerCapture: vi.fn((id: number) => capturedPointers.has(id)),
        });

        const scene = mock<GameScene>();
        scene.game = mock<Phaser.Game>();
        scene.game.canvas = canvas;
        scene.scale = mock<Phaser.Scale.ScaleManager>({ width: 640, height: 640 });
        input = mock<Phaser.Input.InputPlugin>();
        inputEvents = new Phaser.Events.EventEmitter();
        input.on.mockImplementation((event, listener, context) => {
            inputEvents.on(event, listener, context);
            return input;
        });
        input.off.mockImplementation((event, listener, context, once) => {
            inputEvents.off(event, listener, context, once);
            return input;
        });
        scene.input = input;

        const graphics = mock<Phaser.GameObjects.Graphics>();
        graphics.setDepth.mockReturnValue(graphics);
        graphics.clear.mockReturnValue(graphics);
        graphics.fillStyle.mockReturnValue(graphics);
        graphics.lineStyle.mockReturnValue(graphics);
        graphics.fillRect.mockReturnValue(graphics);
        graphics.strokeRect.mockReturnValue(graphics);
        graphics.fillCircle.mockReturnValue(graphics);
        previewGraphics = graphics;
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        factory.graphics.mockReturnValue(graphics);
        // The label of the level being edited, next to the pointer (the raised floors).
        const label = mock<Phaser.GameObjects.Text>();
        label.setDepth.mockReturnValue(label);
        label.setVisible.mockReturnValue(label);
        label.setText.mockReturnValue(label);
        label.setPosition.mockReturnValue(label);
        factory.text.mockReturnValue(label);
        scene.add = factory;
        scene.markDirty.mockImplementation(() => undefined);

        const entitiesManager = mock<EntitiesManager>();
        entities = new Map<string, Entity>();
        entitiesManager.getEntities.mockReturnValue(entities);
        const gameMapFrontWrapper = mock<GameMapFrontWrapper>();
        gameMapFrontWrapper.getEntitiesManager.mockReturnValue(entitiesManager);
        gameMapFrontWrapper.getMap.mockReturnValue(mock<ITiledMap>({ width: 20, height: 20 }));
        scene.getGameMapFrontWrapper.mockReturnValue(gameMapFrontWrapper);
        const gameMap = mock<GameMap>();
        gameMap.getWamFile.mockReturnValue(
            new WamFile({ version: "1", mapUrl: "test.tmj", entities: {}, areas: [], entityCollections: [] }),
        );
        scene.getGameMap.mockReturnValue(gameMap);

        doorsInCatalog = true;
        glazedDoorsInCatalog = true;
        shortStairsInCatalog = true;
        windowsInCatalog = true;
        highPiecesInCatalog = true;
        collectionsManager = mock<EntitiesCollectionsManager>();
        collectionsManager.getEntityPrefab.mockImplementation((collectionName, prefabId) => {
            if (!highPiecesInCatalog && /-h[2-4](?::|-)/.test(prefabId)) return Promise.resolve(undefined);
            if (collectionName === MAP_LAYER_DOOR_COLLECTION && !doorsInCatalog) return Promise.resolve(undefined);
            if (prefabId.includes("-vitree") && !glazedDoorsInCatalog) return Promise.resolve(undefined);
            if (collectionName === MAP_LAYER_FLOOR_SLAB_COLLECTION) {
                return Promise.resolve(
                    prefabId.includes("-v2") && !shortStairsInCatalog ? undefined : prefab(collectionName, prefabId),
                );
            }
            if (collectionName === MAP_LAYER_WINDOW_COLLECTION && !windowsInCatalog) return Promise.resolve(undefined);
            if (
                collectionName === MAP_LAYER_FLOOR_COLLECTION ||
                collectionName === MAP_LAYER_WALL_COLLECTION ||
                collectionName === MAP_LAYER_DOOR_COLLECTION ||
                collectionName === MAP_LAYER_WINDOW_COLLECTION
            ) {
                return Promise.resolve(prefab(collectionName, prefabId));
            }
            return Promise.resolve(undefined);
        });
        scene.getEntitiesCollectionsManager.mockReturnValue(collectionsManager);

        modeManager = mock<MapEditorModeManager>();
        modeManager.getScene.mockReturnValue(scene);
        modeManager.executeCommands.mockResolvedValue(undefined);

        mapLayerModeStore.set("floorBrush");
        mapLayerStatusStore.set(undefined);
        tool = new MapLayerEditorTool(modeManager);
        await settle();
    });

    afterEach(() => {
        tool.destroy();
        mapLayerModeStore.set("wall");
        mapLayerCatalogAvailableStore.set(undefined);
        mapLayerDoorsAvailableStore.set(false);
        mapLayerWindowsAvailableStore.set(false);
        mapLayerGlazedDoorsAvailableStore.set(false);
        mapLayerDoorGlazedStore.set(false);
        mapLayerStatusStore.set(undefined);
        mapLayerWallHeightStore.set(1);
        mapLayerDoorHeightStore.set("auto");
        mapLayerWindowHeightStore.set(1);
        mapEditorPlacementLevelStore.set("auto");
    });

    /** A horizontal wall of three segments on the line 2: its facades fill the tile row 2 (y 64 to 96). */
    function placeWall(windowOnFirst = false, height = 1): void {
        const suffix = height === 1 ? "" : `-h${height}`;
        const pieces: [string, string, number][] = [
            [
                windowOnFirst ? MAP_LAYER_WINDOW_COLLECTION : MAP_LAYER_WALL_COLLECTION,
                windowOnFirst ? `fenetre-blanc-left${suffix}` : `facade-blanc-left${suffix}`,
                -6,
            ],
            [MAP_LAYER_WALL_COLLECTION, `facade-blanc-mid${suffix}`, 32],
            [MAP_LAYER_WALL_COLLECTION, `facade-blanc-right${suffix}`, 64],
        ];
        for (const [collection, name, x] of pieces) {
            const entity = mock<Entity>({ entityId: name, x, y: 64 - 32 * (height - 1) });
            entity.getEntityData.mockReturnValue(ENTITY_DATA);
            entity.getPrefab.mockReturnValue(prefab(collection, `${collection}:${name}:Default:Down`));
            entities.set(name, entity);
        }
    }

    async function activate(): Promise<void> {
        tool.activate();
        await settle();
        expect(get(mapLayerCatalogAvailableStore)).toBe(true);
    }

    it("keeps the pointer on the canvas for the whole gesture", async () => {
        await activate();
        down(40, 40);
        expect(capturedPointers.has(7)).toBe(true);
        up(40, 40);
        expect(capturedPointers.has(7)).toBe(false);
    });

    it("commits a brush stroke that crosses an HTML overlay", async () => {
        await activate();
        down(40, 40);
        move(80, 40);
        // Without the capture, the browser reports that the pointer left the canvas over the overlay.
        inputEvents.emit(Phaser.Input.Events.GAME_OUT);
        move(120, 40);
        up(120, 40);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
    });

    it("still cancels the gesture with Escape and releases the pointer", async () => {
        await activate();
        down(40, 40);
        move(80, 40);
        tool.handleKeyDownEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape" }));
        up(80, 40);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        expect(capturedPointers.has(7)).toBe(false);
    });

    it("does not capture the pointer when there is nothing to draw with", async () => {
        doorsInCatalog = true;
        collectionsManager.getEntityPrefab.mockResolvedValue(undefined);
        tool.activate();
        await settle();
        expect(get(mapLayerCatalogAvailableStore)).toBe(false);
        nativePointerDown();
        expect(capturedPointers.size).toBe(0);
    });

    it("forgets the doors of the previous room as soon as the catalogs are checked again", () => {
        mapLayerDoorsAvailableStore.set(true);
        collectionsManager.getEntityPrefab.mockReturnValue(
            new Promise(() => {
                // Never answers: the check is still running.
            }),
        );
        tool.activate();
        expect(get(mapLayerDoorsAvailableStore)).toBe(false);
    });

    it("goes back to the wall mode when the room has no door catalog", async () => {
        doorsInCatalog = false;
        mapLayerModeStore.set("door");
        await activate();
        expect(get(mapLayerDoorsAvailableStore)).toBe(false);
        expect(get(mapLayerModeStore)).toBe("wall");
    });

    it("explains a click in the door mode when doors are unavailable", async () => {
        doorsInCatalog = false;
        await activate();
        mapLayerModeStore.set("door");
        down(40, 40);
        up(40, 40);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        expect(get(mapLayerStatusStore)).toBe("doorsUnavailable");
    });

    it("sets windows along a horizontal wall", async () => {
        placeWall();
        await activate();
        expect(get(mapLayerWindowsAvailableStore)).toBe(true);
        mapLayerModeStore.set("window");
        down(10, 70);
        move(60, 90);
        up(90, 90);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
        expect(get(mapLayerStatusStore)).toBeUndefined();
    });

    it("explains a window drag that finds no free horizontal wall", async () => {
        await activate();
        mapLayerModeStore.set("window");
        down(40, 40);
        up(80, 40);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        expect(get(mapLayerStatusStore)).toBe("windowInvalid");
    });

    it("explains a click in the window mode when windows are unavailable", async () => {
        windowsInCatalog = false;
        placeWall();
        await activate();
        mapLayerModeStore.set("window");
        down(40, 70);
        up(40, 70);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        expect(get(mapLayerStatusStore)).toBe("windowsUnavailable");
    });

    it("goes back to the wall mode when the room has no window catalog", async () => {
        windowsInCatalog = false;
        mapLayerModeStore.set("window");
        await activate();
        expect(get(mapLayerWindowsAvailableStore)).toBe(false);
        expect(get(mapLayerModeStore)).toBe("wall");
    });

    it("forgets the windows of the previous room as soon as the catalogs are checked again", () => {
        mapLayerWindowsAvailableStore.set(true);
        collectionsManager.getEntityPrefab.mockReturnValue(
            new Promise(() => {
                // Never answers: the check is still running.
            }),
        );
        tool.activate();
        expect(get(mapLayerWindowsAvailableStore)).toBe(false);
    });

    it("moves a placed window along the wall", async () => {
        placeWall(true);
        await activate();
        mapLayerModeStore.set("window");
        // From the window of the first segment to the second one.
        down(10, 80);
        move(30, 80);
        move(40, 80);
        up(40, 80);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
        expect(get(mapLayerStatusStore)).toBeUndefined();
        const factory = modeManager.executeCommands.mock.calls[0][0] as () => readonly object[];
        // The window leaves its segment (its facade comes back) and the facade of the target becomes a window.
        const deleted = factory()
            .filter((command) => command.constructor.name === "DeleteEntityFrontCommand")
            .map((command) => (command as { entityId?: string }).entityId)
            .filter((id) => id !== undefined)
            .sort();
        expect(deleted).toEqual(["facade-blanc-mid", "fenetre-blanc-left"]);
    });

    it("keeps a window dropped back on its own segment, without a message", async () => {
        placeWall(true);
        await activate();
        mapLayerModeStore.set("window");
        down(10, 80);
        move(20, 80);
        up(20, 80);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        expect(get(mapLayerStatusStore)).toBeUndefined();
    });

    it("explains a window moved where it cannot go", async () => {
        placeWall(true);
        await activate();
        mapLayerModeStore.set("window");
        down(10, 80);
        move(200, 200);
        up(200, 200);
        expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        expect(get(mapLayerStatusStore)).toBe("windowInvalid");
    });

    it("shows that a placed window can be grabbed, then dragged", async () => {
        placeWall(true);
        await activate();
        mapLayerModeStore.set("window");
        const lastCursor = (): unknown => input.setDefaultCursor.mock.calls.at(-1)?.[0];
        move(10, 80);
        expect(lastCursor()).toBe("grab");
        down(10, 80);
        move(40, 80);
        expect(lastCursor()).toBe("grabbing");
        up(40, 80);
        move(40, 80);
        expect(lastCursor()).not.toBe("grabbing");
        // Over a plain wall, nothing to grab.
        move(80, 80);
        expect(lastCursor()).toBe("");
    });

    /** Prefab names of the entities created by the first commit. */
    function createdNames(): string[] {
        const factory = modeManager.executeCommands.mock.calls[0][0] as () => readonly object[];
        return factory()
            .filter((command) => command.constructor.name === "CreateEntityFrontCommand")
            .map((command) => (command as { entityData?: WAMEntityData }).entityData?.prefabRef?.id.split(":")[1] ?? "")
            .sort();
    }

    describe("heights", () => {
        it("draws walls of the chosen height", async () => {
            await activate();
            expect(get(mapLayerWallHeightsAvailableStore)).toEqual([1, 2, 3, 4]);
            mapLayerModeStore.set("wall");
            mapLayerWallHeightStore.set(3);
            // From the vertex (1, 2) to the vertex (3, 2): two segments of the line 2.
            down(32, 96);
            move(96, 96);
            up(96, 96);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
            const walls = createdNames().filter((name) => name.startsWith("facade"));
            expect(walls).toEqual(["facade-blanc-left-h3", "facade-blanc-right-h3"]);
        });

        it("draws walls of height 1 by default", async () => {
            await activate();
            mapLayerModeStore.set("wall");
            down(32, 96);
            move(96, 96);
            up(96, 96);
            expect(createdNames().filter((name) => name.startsWith("facade"))).toEqual([
                "facade-blanc-left",
                "facade-blanc-right",
            ]);
        });

        it("draws walls of height 1 when the catalog has no high wall", async () => {
            highPiecesInCatalog = false;
            mapLayerWallHeightStore.set(3);
            await activate();
            expect(get(mapLayerWallHeightsAvailableStore)).toEqual([1]);
            expect(get(mapLayerDoorHeightsAvailableStore)).toEqual([1]);
            expect(get(mapLayerWindowHeightsAvailableStore)).toEqual([1]);
            mapLayerModeStore.set("wall");
            mapLayerWallHeightStore.set(3);
            down(32, 96);
            move(96, 96);
            up(96, 96);
            expect(createdNames().filter((name) => name.startsWith("facade"))).toEqual([
                "facade-blanc-left",
                "facade-blanc-right",
            ]);
        });

        it("sets a window of the chosen height, brought down to the height of its wall", async () => {
            placeWall();
            await activate();
            mapLayerModeStore.set("window");
            mapLayerWindowHeightStore.set(2);
            down(40, 80);
            up(40, 80);
            expect(createdNames().filter((name) => name.startsWith("fenetre"))).toEqual(["fenetre-blanc-mid"]);
        });

        it("sets a door of the chosen height in a wall as high", async () => {
            placeWall(false, 2);
            await activate();
            mapLayerModeStore.set("door");
            mapLayerDoorHeightStore.set(2);
            // The vertex (2, 2), in the middle of the wall, on the row of its foot (its facades are drawn from y = 32).
            down(64, 80);
            up(64, 80);
            expect(createdNames().filter((name) => name.startsWith("porte"))).toEqual([
                "porte-h-blanc-d-h2",
                "porte-h-blanc-g-h2",
            ]);
        });
    });

    describe("door heights", () => {
        /** The two pieces of a door of height `door` on the vertex (2, 2) of the wall of `placeWall(false, wall)`. */
        function placeHighDoor(wall: number, door: number): void {
            // The door replaces the facades of its two segments.
            for (const name of ["facade-blanc-mid", "facade-blanc-right"]) {
                entities.delete(wall === 1 ? name : `${name}-h${wall}`);
            }
            const suffix = door === 1 ? "" : `-h${door}`;
            for (const [side, x] of [
                ["g", 32],
                ["d", 64],
            ] as const) {
                const name = `porte-h-blanc-${side}${suffix}`;
                const entity = mock<Entity>({ entityId: name, x, y: 64 - 32 * (door - 1) });
                entity.getEntityData.mockReturnValue(ENTITY_DATA);
                entity.getPrefab.mockReturnValue(
                    prefab(MAP_LAYER_DOOR_COLLECTION, `${MAP_LAYER_DOOR_COLLECTION}:${name}:Default:Down`),
                );
                entities.set(name, entity);
            }
            if (wall > door) {
                for (const x of [32, 64]) {
                    const name = `linteau-blanc-${x === 64 ? "right" : "mid"}-h${wall}-o${door}`;
                    const entity = mock<Entity>({ entityId: `${name}@${x}`, x, y: 64 - 32 * (wall - 1) });
                    entity.getEntityData.mockReturnValue(ENTITY_DATA);
                    entity.getPrefab.mockReturnValue(
                        prefab(MAP_LAYER_WALL_COLLECTION, `${MAP_LAYER_WALL_COLLECTION}:${name}:Default:Down`),
                    );
                    entities.set(`${name}@${x}`, entity);
                }
            }
        }

        it("gives a door of a wall of 4 the height 2 in Auto, the default", async () => {
            placeWall(false, 4);
            await activate();
            expect(get(mapLayerDoorHeightStore)).toBe("auto");
            mapLayerModeStore.set("door");
            down(64, 80);
            up(64, 80);
            expect(createdNames().filter((name) => name.startsWith("porte"))).toEqual([
                "porte-h-blanc-d-h2",
                "porte-h-blanc-g-h2",
            ]);
        });

        it("gives a placed door another height in one command", async () => {
            placeWall(false, 4);
            placeHighDoor(4, 1);
            await activate();
            mapLayerModeStore.set("door");
            mapLayerDoorHeightStore.set(3);
            down(64, 80);
            up(64, 80);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
            expect(get(mapLayerStatusStore)).toBeUndefined();
            expect(createdNames().filter((name) => name.startsWith("porte") || name.startsWith("linteau"))).toEqual([
                "linteau-blanc-mid-h4-o3",
                "linteau-blanc-right-h4-o3",
                "porte-h-blanc-d-h3",
                "porte-h-blanc-g-h3",
            ]);
        });

        it("flips a placed door that has the settings already, glazed, keeping its height", async () => {
            placeWall(false, 4);
            placeHighDoor(4, 2);
            await activate();
            mapLayerModeStore.set("door");
            down(64, 80);
            up(64, 80);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
            expect(createdNames().filter((name) => name.startsWith("porte"))).toEqual([
                "porte-h-blanc-d-vitree-h2",
                "porte-h-blanc-g-vitree-h2",
            ]);
        });

        it("changes nothing on a placed door that has the settings already without glazed doors in the catalog", async () => {
            glazedDoorsInCatalog = false;
            placeWall(false, 4);
            placeHighDoor(4, 2);
            await activate();
            mapLayerModeStore.set("door");
            down(64, 80);
            up(64, 80);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
            expect(get(mapLayerStatusStore)).toBeUndefined();
        });

        it("gives a high glazed door the height 1 when the catalog has no glazed door of that height", async () => {
            placeWall(false, 4);
            await activate();
            // The catalog of the test has every piece: take the glazed doors of height 2 away.
            mapLayerGlazedDoorHeightsAvailableStore.set([1]);
            mapLayerModeStore.set("door");
            mapLayerDoorGlazedStore.set(true);
            down(64, 80);
            up(64, 80);
            expect(createdNames().filter((name) => name.startsWith("porte"))).toEqual([
                "porte-h-blanc-d-vitree",
                "porte-h-blanc-g-vitree",
            ]);
        });
    });

    describe("height mode", () => {
        it("selects a high wall by its raised top and shows its height", async () => {
            placeWall(false, 2);
            await activate();
            mapLayerModeStore.set("height");
            // The facades of height 2 of the line 2 are drawn from y = 32: (40, 40) is on the raised top of the second one.
            down(40, 40);
            up(40, 40);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
            expect(get(mapLayerHeightSelectionStore)).toEqual({ count: 1, height: 2, available: [1, 2, 3, 4] });
        });

        it("selects the segments of a drag along the wall, and empties the selection on a click in the void", async () => {
            placeWall(false, 2);
            await activate();
            mapLayerModeStore.set("height");
            down(10, 40);
            move(50, 40);
            move(90, 40);
            up(90, 40);
            expect(get(mapLayerHeightSelectionStore)).toMatchObject({ count: 3, height: 2 });
            down(300, 300);
            up(300, 300);
            expect(get(mapLayerHeightSelectionStore)).toMatchObject({ count: 0, height: undefined });
        });

        it("applies a height to the selection in one command, keeping the selection", async () => {
            placeWall(false, 2);
            await activate();
            mapLayerModeStore.set("height");
            down(40, 40);
            up(40, 40);
            mapLayerHeightRequestStore.set(3);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
            // Higher than its neighbours, the raised segment closes on both sides; they continue under it.
            expect(createdNames().filter((name) => name.startsWith("facade"))).toEqual(["facade-blanc-single-h3"]);
            expect(get(mapLayerHeightRequestStore)).toBeUndefined();
            expect(get(mapLayerHeightSelectionStore).count).toBe(1);
        });

        it("applies no height the catalogs do not have, and none without a selection", async () => {
            highPiecesInCatalog = false;
            placeWall();
            await activate();
            mapLayerModeStore.set("height");
            mapLayerHeightRequestStore.set(1);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
            down(40, 80);
            up(40, 80);
            expect(get(mapLayerHeightSelectionStore)).toEqual({ count: 1, height: 1, available: [1] });
            mapLayerHeightRequestStore.set(3);
            expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        });

        it("forgets the selection when another mode is chosen", async () => {
            placeWall(false, 2);
            await activate();
            mapLayerModeStore.set("height");
            down(40, 40);
            up(40, 40);
            mapLayerModeStore.set("wall");
            expect(get(mapLayerHeightSelectionStore).count).toBe(0);
        });
    });

    /** A plain or glazed horizontal door on the segments 0 and 1 of the wall of the line 2, the facade of 2 beside. */
    function placeDoor(glazed: boolean): void {
        const suffix = glazed ? "-vitree" : "";
        const pieces: [string, string, number][] = [
            [MAP_LAYER_DOOR_COLLECTION, `porte-h-blanc-g${suffix}`, 0],
            [MAP_LAYER_DOOR_COLLECTION, `porte-h-blanc-d${suffix}`, 32],
            [MAP_LAYER_WALL_COLLECTION, "facade-blanc-right", 64],
        ];
        for (const [collection, name, x] of pieces) {
            const entity = mock<Entity>({ entityId: name, x, y: 64 });
            entity.getEntityData.mockReturnValue(ENTITY_DATA);
            entity.getPrefab.mockReturnValue(prefab(collection, `${collection}:${name}:Default:Down`));
            entities.set(name, entity);
        }
    }

    /** Names of the pieces created and deleted by the only committed operation. */
    function committedPieces(): { created: string[]; deleted: string[] } {
        expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
        const factory = modeManager.executeCommands.mock.calls[0][0] as () => readonly object[];
        const commands = factory();
        return {
            created: commands
                .filter((command) => command.constructor.name === "CreateEntityFrontCommand")
                .map(
                    (command) =>
                        (command as { entityData?: { prefabRef?: { id?: string } } }).entityData?.prefabRef?.id,
                )
                .filter((id): id is string => id !== undefined)
                .map((id) => id.split(":")[1])
                .sort(),
            deleted: commands
                .filter((command) => command.constructor.name === "DeleteEntityFrontCommand")
                .map((command) => (command as { entityId?: string }).entityId)
                .filter((id): id is string => id !== undefined)
                .sort(),
        };
    }

    function clickDoor(): void {
        down(32, 80);
        move(32, 80);
        up(32, 80);
    }

    it("places a glazed door with the switch on", async () => {
        placeWall();
        await activate();
        expect(get(mapLayerGlazedDoorsAvailableStore)).toBe(true);
        mapLayerModeStore.set("door");
        mapLayerDoorGlazedStore.set(true);
        clickDoor();
        expect(committedPieces().created).toEqual(
            expect.arrayContaining(["porte-h-blanc-d-vitree", "porte-h-blanc-g-vitree"]),
        );
        expect(get(mapLayerStatusStore)).toBeUndefined();
    });

    it("flips a placed plain door to glazed in one operation, whatever the switch", async () => {
        placeDoor(false);
        await activate();
        mapLayerModeStore.set("door");
        mapLayerDoorGlazedStore.set(false);
        clickDoor();
        const { created, deleted } = committedPieces();
        // The fixture has no joint at the end of the wall: the tool adds it on the way, it is not part of the switch.
        expect(created.filter((name) => !name.startsWith("raccord-"))).toEqual([
            "porte-h-blanc-d-vitree",
            "porte-h-blanc-g-vitree",
        ]);
        expect(deleted).toEqual(["porte-h-blanc-d", "porte-h-blanc-g"]);
        expect(get(mapLayerStatusStore)).toBeUndefined();
    });

    it("flips a placed glazed door back to plain, whatever the switch", async () => {
        placeDoor(true);
        await activate();
        mapLayerModeStore.set("door");
        mapLayerDoorGlazedStore.set(true);
        clickDoor();
        const { created, deleted } = committedPieces();
        expect(created.filter((name) => !name.startsWith("raccord-"))).toEqual(["porte-h-blanc-d", "porte-h-blanc-g"]);
        expect(deleted).toEqual(["porte-h-blanc-d-vitree", "porte-h-blanc-g-vitree"]);
    });

    it("leaves a placed plain door alone, without a message, when the catalog has no glazed pieces", async () => {
        glazedDoorsInCatalog = false;
        placeDoor(false);
        await activate();
        mapLayerModeStore.set("door");
        clickDoor();
        expect(modeManager.executeCommands.mock.calls).toHaveLength(0);
        expect(get(mapLayerStatusStore)).toBeUndefined();
    });

    it("places plain doors when the room's catalog has no glazed pieces", async () => {
        glazedDoorsInCatalog = false;
        placeWall();
        await activate();
        expect(get(mapLayerGlazedDoorsAvailableStore)).toBe(false);
        mapLayerModeStore.set("door");
        mapLayerDoorGlazedStore.set(true);
        clickDoor();
        expect(committedPieces().created).toEqual(expect.arrayContaining(["porte-h-blanc-d", "porte-h-blanc-g"]));
        expect(committedPieces().created.filter((name) => name.includes("vitree"))).toEqual([]);
    });

    it("shows a door that a click would flip in green, on the door itself", async () => {
        placeDoor(false);
        await activate();
        mapLayerModeStore.set("door");
        mapLayerDoorGlazedStore.set(false);
        previewGraphics.fillStyle.mockClear();
        previewGraphics.fillRect.mockClear();
        move(40, 80);
        expect(previewGraphics.fillStyle.mock.calls.map(([color]) => color)).toEqual([0x2ecc71]);
        // The door on the segments 0 and 1 of the line 2, not a door centered on the cursor.
        expect(previewGraphics.fillRect.mock.lastCall?.slice(0, 2)).toEqual([0, 64]);
    });

    /** Floors under the wall of the line 2 and the row below it (entity ids `sol-x-y`). */
    function placeFloors(): void {
        for (const x of [0, 1, 2]) {
            for (const y of [2, 3]) {
                const entity = mock<Entity>({ entityId: `sol-${x}-${y}`, x: x * 32, y: y * 32 });
                entity.getPrefab.mockReturnValue(
                    prefab(
                        MAP_LAYER_FLOOR_COLLECTION,
                        `${MAP_LAYER_FLOOR_COLLECTION}:sol-parquet-clair-uni:Default:Down`,
                    ),
                );
                entities.set(`sol-${x}-${y}`, entity);
            }
        }
    }

    function deletedIds(): string[] {
        expect(modeManager.executeCommands.mock.calls).toHaveLength(1);
        const factory = modeManager.executeCommands.mock.calls[0][0] as () => readonly object[];
        return factory()
            .filter((command) => command.constructor.name === "DeleteEntityFrontCommand")
            .map((command) => (command as { entityId?: string }).entityId)
            .filter((id): id is string => id !== undefined)
            .sort();
    }

    it("erases the walls of a drag that starts on a wall, never the floors under them", async () => {
        placeWall();
        placeFloors();
        await activate();
        mapLayerModeStore.set("erase");
        down(40, 80);
        move(60, 84);
        move(90, 90);
        up(90, 90);
        const deleted = deletedIds();
        expect(deleted).toEqual(expect.arrayContaining(["facade-blanc-mid", "facade-blanc-right"]));
        // A floor may be redrawn (its shade under a wall changes), never removed: as many floors created as deleted.
        const floorsDeleted = deleted.filter((id) => id.startsWith("sol-")).length;
        const floorsCreated = committedPieces().created.filter((name) => name.startsWith("sol-")).length;
        expect(floorsCreated).toBe(floorsDeleted);
    });

    it("erases only floors on a drag that starts on a floor, never a wall it crosses", async () => {
        placeWall();
        placeFloors();
        await activate();
        mapLayerModeStore.set("erase");
        down(40, 110);
        move(40, 90);
        move(40, 70);
        up(40, 70);
        const deleted = deletedIds();
        expect(deleted).toEqual(expect.arrayContaining(["sol-1-3"]));
        expect(deleted.filter((id) => !id.startsWith("sol-"))).toEqual([]);
    });

    it("knows whether the room's catalog has the new short stairs", async () => {
        await activate();
        expect(get(mapLayerShortStairsAvailableStore)).toBe(true);
        tool.destroy();
        shortStairsInCatalog = false;
        tool = new MapLayerEditorTool(modeManager);
        await activate();
        expect(get(mapLayerShortStairsAvailableStore)).toBe(false);
    });
    describe("what the pointer points at", () => {
        const RED = 0xff3b30;
        const WHITE = 0xffffff;
        const north: StairShape = { direction: "n", width: 1, rise: 52, open: false };
        const ramp: StairShape = { direction: "e", width: 1, rise: 20, open: true, ramp: true };

        /** The entities of the raised floors of a model, with their altitude (ids `palier-<index>`). */
        function placeRaisedFloors(model: FloorModel): string[] {
            return computeFloorPlacements(model).map((item, index) => {
                const entityId = `palier-${index}-${item.prefabId.split(":")[1]}`;
                const entity = mock<Entity>({ entityId, x: item.x, y: item.y });
                entity.getElevation.mockReturnValue(item.elevation);
                entity.getEntityData.mockReturnValue({
                    ...ENTITY_DATA,
                    x: item.x,
                    y: item.y,
                    elevation: item.elevation,
                });
                entity.getPrefab.mockReturnValue(prefab(item.collectionName, item.prefabId));
                entities.set(entityId, entity);
                return entityId;
            });
        }

        function stairBox(shape: StairShape, foot: { x: number; y: number }, base: number) {
            const image = stairImagePosition(shape, foot, base);
            const box = stairScreenBox(shape, foot);
            return { x: image.x, y: image.y, width: box.width, height: box.height };
        }

        function strokedRects(): number[][] {
            return previewGraphics.strokeRect.mock.calls.map((call) => call.slice(0, 4));
        }

        function clearPreviewCalls(): void {
            previewGraphics.strokeRect.mockClear();
            previewGraphics.fillRect.mockClear();
            previewGraphics.lineStyle.mockClear();
            previewGraphics.fillStyle.mockClear();
        }

        it("outlines a whole stair in red under the eraser, never a tile under it", async () => {
            const floors = new FloorModel();
            floors.addStair(north, { x: 5, y: 10 }, 0);
            placeRaisedFloors(floors);
            await activate();
            mapLayerModeStore.set("erase");
            const box = stairBox(north, { x: 5, y: 10 }, 0);
            clearPreviewCalls();
            move(box.x + 10, box.y + 4);
            expect(strokedRects()).toContainEqual([box.x, box.y, box.width, box.height]);
            expect(previewGraphics.lineStyle.mock.calls.map(([, color]) => color)).toContain(RED);
            expect(strokedRects()).not.toContainEqual([160, Math.floor((box.y + 4) / 32) * 32, 32, 32]);
        });

        it("erases the stair a click of the eraser was outlining, and not the floor it stands on", async () => {
            const floors = new FloorModel();
            for (let x = 2; x < 9; x++) for (let y = 2; y < 14; y++) floors.setSlab(52, x, y, "parquet-clair");
            floors.addStair(north, { x: 5, y: 10 }, 52);
            const ids = placeRaisedFloors(floors);
            await activate();
            mapLayerModeStore.set("erase");
            // The room has the raised floors but not the walls of the raised floors: the eraser edits the floor 52.
            mapEditorPlacementLevelStore.set(52);
            const point = { x: 5 * 32 + 10, y: 10 * 32 + 10 - 52 };
            down(point.x, point.y);
            up(point.x, point.y);
            const stairId = ids.find((id) => id.includes("escalier"));
            const { created, deleted } = committedPieces();
            expect(deleted).toEqual([stairId]);
            expect(created.every((name) => name.startsWith("dalle-"))).toBe(true);
        });

        it("erases a slab of the floor edited on a click", async () => {
            const floors = new FloorModel();
            floors.setSlab(52, 4, 6, "parquet-clair");
            floors.setSlab(52, 5, 6, "parquet-clair");
            const ids = placeRaisedFloors(floors);
            await activate();
            mapLayerModeStore.set("erase");
            mapEditorPlacementLevelStore.set(52);
            down(4 * 32 + 5, 6 * 32 - 52 + 5);
            up(4 * 32 + 5, 6 * 32 - 52 + 5);
            expect(committedPieces()).toEqual({ created: [], deleted: [ids[0]] });
        });

        it("outlines the stair under the eraser on the level Auto, by the part of its image over a higher floor", async () => {
            const floors = new FloorModel();
            const ground = stairGroundBox(north, { x: 5, y: 10 });
            const south = (ground.y + ground.height) / 32;
            floors.setSlab(52, 5, south, "parquet-clair");
            floors.setSlab(52, 5, south + 1, "parquet-clair");
            floors.addStair(north, { x: 5, y: 10 }, 0);
            placeRaisedFloors(floors);
            await activate();
            mapLayerModeStore.set("erase");
            const box = stairBox(north, { x: 5, y: 10 }, 0);
            clearPreviewCalls();
            // In the image of the stair, and over the slab south of it on the floor 52.
            move(5 * 32 + 10, south * 32 - 20);
            expect(strokedRects()).toContainEqual([box.x, box.y, box.width, box.height]);
        });

        it("outlines a high wall in red by its raised top, with its whole image", async () => {
            placeWall(false, 3);
            await activate();
            mapLayerModeStore.set("erase");
            clearPreviewCalls();
            // The wall of the line 2, three tiles high: drawn from y = 0 to its foot at y = 96.
            move(40, 20);
            expect(previewGraphics.lineStyle.mock.calls.map(([, color]) => color)).toContain(RED);
            const rects = strokedRects();
            expect(rects.length).toBeGreaterThan(0);
            expect(rects.some(([, y, , height]) => y < 32 && height > 32)).toBe(true);
        });

        it("outlines a placed stair in white in the stair mode, the stair a drag moves, not a new stair", async () => {
            const floors = new FloorModel();
            floors.addStair(north, { x: 5, y: 10 }, 0);
            placeRaisedFloors(floors);
            await activate();
            mapLayerModeStore.set("stair");
            const box = stairBox(north, { x: 5, y: 10 }, 0);
            clearPreviewCalls();
            move(box.x + 10, box.y + box.height - 10);
            expect(strokedRects()).toContainEqual([box.x, box.y, box.width, box.height]);
            expect(previewGraphics.lineStyle.mock.calls.map(([, color]) => color)).toContain(WHITE);
            // No preview of a new stair (green where it fits, red where it does not).
            expect(previewGraphics.fillStyle.mock.calls.map(([color]) => color)).not.toContain(0x22c55e);
            expect(previewGraphics.fillStyle.mock.calls.map(([color]) => color)).not.toContain(0xef4444);
        });

        it("moves a ramp of a bridge dragged in the stair mode, in one command", async () => {
            const floors = new FloorModel();
            floors.addStair(ramp, { x: 3, y: 4 }, 0);
            const [rampId] = placeRaisedFloors(floors);
            await activate();
            mapLayerModeStore.set("stair");
            const box = stairBox(ramp, { x: 3, y: 4 }, 0);
            down(box.x + 10, box.y + box.height / 2);
            move(box.x + 10 + 64, box.y + box.height / 2 + 32);
            up(box.x + 10 + 64, box.y + box.height / 2 + 32);
            const { created, deleted } = committedPieces();
            expect(deleted).toEqual([rampId]);
            expect(created).toEqual([rampId.split("-").slice(2).join("-")]);
            const factory = modeManager.executeCommands.mock.calls[0][0] as () => readonly object[];
            const moved = factory().find((command) => command.constructor.name === "CreateEntityFrontCommand") as {
                entityData?: WAMEntityData;
            };
            const expected = stairImagePosition(ramp, { x: 5, y: 5 }, 0);
            expect([moved.entityData?.x, moved.entityData?.y]).toEqual([expected.x, expected.y]);
        });
        it("erases only the door a click of the eraser outlines, by either of its leaves, never its walls", async () => {
            placeDoor(false);
            await activate();
            mapLayerModeStore.set("erase");
            // The right leaf: the segment 1 of the door on the segments 0 and 1 of the line 2.
            down(40, 80);
            up(40, 80);
            const { created, deleted } = committedPieces();
            expect(deleted).toEqual(expect.arrayContaining(["porte-h-blanc-d", "porte-h-blanc-g"]));
            expect(created.filter((name) => name.startsWith("facade-")).length).toBeGreaterThanOrEqual(2);
        });

        it("outlines a slab of a raised floor where it is drawn, its altitude higher", async () => {
            const floors = new FloorModel();
            floors.setSlab(52, 4, 6, "parquet-clair");
            placeRaisedFloors(floors);
            await activate();
            mapLayerModeStore.set("erase");
            mapEditorPlacementLevelStore.set(52);
            clearPreviewCalls();
            move(4 * 32 + 5, 6 * 32 - 52 + 5);
            // The preview is drawn on a layer raised by the level edited: the slab of the tile (4, 6) is at y = 6 * 32 on it.
            expect(previewGraphics.setY.mock.lastCall).toEqual([-52]);
            expect(strokedRects()).toContainEqual([128, 6 * 32, 32, 32]);
            expect(previewGraphics.lineStyle.mock.calls.map(([, color]) => color)).toContain(RED);
        });

        it("grabs a high window by its raised pane, outlined in white, and moves it from there", async () => {
            placeWall(true, 2);
            await activate();
            mapLayerModeStore.set("window");
            input.setDefaultCursor.mockClear();
            clearPreviewCalls();
            // The window of the segment 0 of the line 2, two tiles high: drawn from y = 32 to its foot at y = 96.
            move(10, 40);
            expect(input.setDefaultCursor.mock.calls.at(-1)?.[0]).toBe("grab");
            expect(previewGraphics.lineStyle.mock.calls.map(([, color]) => color)).toContain(WHITE);
            expect(strokedRects().some(([, y]) => y < 64)).toBe(true);
            // Dragged one segment east by its pane: it goes to the segment 1, on the same wall.
            down(10, 40);
            move(42, 40);
            up(42, 40);
            const { created, deleted } = committedPieces();
            expect(deleted).toContain("fenetre-blanc-left-h2");
            expect(created.some((name) => name.startsWith("fenetre-blanc-mid"))).toBe(true);
        });

        it("shows a placed high door that a click changes over its whole height", async () => {
            const pieces: [string, string, number][] = [
                [MAP_LAYER_DOOR_COLLECTION, "porte-h-blanc-g-h2", 0],
                [MAP_LAYER_DOOR_COLLECTION, "porte-h-blanc-d-h2", 32],
                [MAP_LAYER_WALL_COLLECTION, "facade-blanc-right-h2", 64],
            ];
            for (const [collection, name, x] of pieces) {
                const entity = mock<Entity>({ entityId: name, x, y: 32 });
                entity.getEntityData.mockReturnValue(ENTITY_DATA);
                entity.getPrefab.mockReturnValue(prefab(collection, `${collection}:${name}:Default:Down`));
                entities.set(name, entity);
            }
            await activate();
            mapLayerModeStore.set("door");
            mapLayerDoorGlazedStore.set(true);
            clearPreviewCalls();
            move(40, 80);
            expect(previewGraphics.fillStyle.mock.calls.map(([color]) => color)).toEqual([0x2ecc71]);
            expect(previewGraphics.fillRect.mock.lastCall?.slice(0, 4)).toEqual([0, 32, 64, 64]);
        });
    });
});
