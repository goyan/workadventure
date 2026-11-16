import * as Phaser from "phaser";
import { WamFile } from "@workadventure/map-editor";
import type { EntityPrefab, GameMap } from "@workadventure/map-editor";
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
import {
    MAP_LAYER_DOOR_COLLECTION,
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_WALL_COLLECTION,
    MAP_LAYER_WINDOW_COLLECTION,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import {
    mapLayerCatalogAvailableStore,
    mapLayerDoorGlazedStore,
    mapLayerDoorsAvailableStore,
    mapLayerGlazedDoorsAvailableStore,
    mapLayerModeStore,
    mapLayerStatusStore,
    mapLayerWindowsAvailableStore,
} from "../../../../src/front/Stores/MapLayerStore";

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
    let windowsInCatalog: boolean;
    let entities: Map<string, Entity>;
    let tool: MapLayerEditorTool;
    let capturedPointers: Set<number>;

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
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        factory.graphics.mockReturnValue(graphics);
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
        windowsInCatalog = true;
        collectionsManager = mock<EntitiesCollectionsManager>();
        collectionsManager.getEntityPrefab.mockImplementation((collectionName, prefabId) => {
            if (collectionName === MAP_LAYER_DOOR_COLLECTION && !doorsInCatalog) return Promise.resolve(undefined);
            if (prefabId.includes("-vitree") && !glazedDoorsInCatalog) return Promise.resolve(undefined);
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
    });

    /** A horizontal wall of three segments on the line 2: its facades fill the tile row 2 (y 64 to 96). */
    function placeWall(windowOnFirst = false): void {
        const pieces: [string, string, number][] = [
            [
                windowOnFirst ? MAP_LAYER_WINDOW_COLLECTION : MAP_LAYER_WALL_COLLECTION,
                windowOnFirst ? "fenetre-blanc-left" : "facade-blanc-left",
                -6,
            ],
            [MAP_LAYER_WALL_COLLECTION, "facade-blanc-mid", 32],
            [MAP_LAYER_WALL_COLLECTION, "facade-blanc-right", 64],
        ];
        for (const [collection, name, x] of pieces) {
            const entity = mock<Entity>({ entityId: name, x, y: 64 });
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

    it("switches a placed door to the chosen variant in one operation", async () => {
        placeDoor(false);
        await activate();
        mapLayerModeStore.set("door");
        mapLayerDoorGlazedStore.set(true);
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

    it("does nothing, without a message, on a door already of the chosen variant", async () => {
        placeDoor(true);
        await activate();
        mapLayerModeStore.set("door");
        mapLayerDoorGlazedStore.set(true);
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
});
