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
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import {
    mapLayerCatalogAvailableStore,
    mapLayerDoorsAvailableStore,
    mapLayerModeStore,
    mapLayerStatusStore,
} from "../../../../src/front/Stores/MapLayerStore";

function prefab(collectionName: string, id: string): EntityPrefab {
    return mock<EntityPrefab>({ collectionName, id, imagePath: `${id}.png` });
}

describe("MapLayerEditorTool gestures", () => {
    let canvas: HTMLCanvasElement;
    let inputEvents: Phaser.Events.EventEmitter;
    let modeManager: ReturnType<typeof mock<MapEditorModeManager>>;
    let collectionsManager: ReturnType<typeof mock<EntitiesCollectionsManager>>;
    let doorsInCatalog: boolean;
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
        const input = mock<Phaser.Input.InputPlugin>();
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
        entitiesManager.getEntities.mockReturnValue(new Map<string, Entity>());
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
        collectionsManager = mock<EntitiesCollectionsManager>();
        collectionsManager.getEntityPrefab.mockImplementation((collectionName, prefabId) => {
            if (collectionName === MAP_LAYER_DOOR_COLLECTION && !doorsInCatalog) return Promise.resolve(undefined);
            if (
                collectionName === MAP_LAYER_FLOOR_COLLECTION ||
                collectionName === MAP_LAYER_WALL_COLLECTION ||
                collectionName === MAP_LAYER_DOOR_COLLECTION
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
        mapLayerStatusStore.set(undefined);
    });

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
});
