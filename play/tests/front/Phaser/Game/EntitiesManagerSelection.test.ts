import * as Phaser from "phaser";
import type { EntityPrefab, WAMEntityData } from "@workadventure/map-editor";
import { mock } from "vitest-mock-extended";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type * as EntityModule from "../../../../src/front/Phaser/ECS/Entity";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import { EntitiesManager, EntitiesManagerEvent } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { EditorToolName } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import {
    mapEditorEntityModeStore,
    mapEditorModeStore,
    mapEditorSelectedEntityDraggedStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
    mapEditorSelectedToolStore,
} from "../../../../src/front/Stores/MapEditorStore";

const pickedPrefab = {
    id: "lamp",
    name: "Lamp",
    tags: [],
    imagePath: "lamp.png",
    direction: "Down",
    color: "Default",
    collectionName: "Furniture",
    type: "Default",
} as EntityPrefab;

const entityFactory = vi.hoisted(() => vi.fn<() => Entity>());

vi.mock("../../../../src/front/Phaser/ECS/Entity", async (importOriginal) => ({
    ...(await importOriginal<typeof EntityModule>()),
    Entity: vi.fn(function () {
        return entityFactory();
    }),
}));

vi.mock("../../../../src/front/Phaser/Helpers/TexturesHelper", () => ({
    TexturesHelper: { loadEntityImage: vi.fn(() => Promise.resolve()) },
}));

describe("Native entity clicks while selecting a group", () => {
    let entitiesManager: EntitiesManager;
    let entityEvents: Phaser.Events.EventEmitter;
    let entity: ReturnType<typeof mock<Entity>>;
    let manager: ReturnType<typeof mock<MapEditorModeManager>>;
    let canvas: HTMLCanvasElement;
    let wrapper: ReturnType<typeof mock<GameMapFrontWrapper>>;

    beforeEach(async () => {
        mapEditorModeStore.set(true);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedToolStore.set(EditorToolName.SelectionEditor);
        canvas = document.createElement("canvas");
        const scene = mock<GameScene>();
        wrapper = mock<GameMapFrontWrapper>();
        scene.getGameMapFrontWrapper.mockReturnValue(wrapper);
        manager = mock<MapEditorModeManager>();
        manager.equipTool.mockImplementation((tool) => mapEditorSelectedToolStore.set(tool));
        scene.getMapEditorModeManager.mockReturnValue(manager);
        scene.input = mock<Phaser.Input.InputPlugin>();
        scene.input.keyboard = null;
        Object.defineProperty(scene, "sceneReadyToStartPromise", { value: Promise.resolve() });
        scene.getEntityPermissionsPromise.mockResolvedValue(mock());
        const prefab = mock<EntityPrefab>({
            id: "chair",
            collectionName: "Furniture",
            imagePath: "chair.png",
            collisionGrid: [[0]],
            seasonal: undefined,
        });
        const collections = mock<ReturnType<GameScene["getEntitiesCollectionsManager"]>>();
        collections.getEntityPrefab.mockResolvedValue(prefab);
        scene.getEntitiesCollectionsManager.mockReturnValue(collections);
        entityEvents = new Phaser.Events.EventEmitter();
        entity = mock<Entity>({ entityId: "chair-instance", x: 32, y: 32 });
        Object.defineProperty(entity, "canEdit", { value: true });
        entity.on.mockImplementation((event, listener, context) => {
            entityEvents.on(event, listener, context);
            return entity;
        });
        entity.setVisible.mockReturnValue(entity);
        entity.setTexture.mockReturnValue(entity);
        entity.setDepth.mockReturnValue(entity);
        entity.setInteractive.mockReturnValue(entity);
        entity.getPrefab.mockReturnValue(prefab);
        entity.getCollisionGrid.mockReturnValue([[0]]);
        entity.getOverlappingEntities.mockReturnValue([]);
        entity.showPrefabTexture.mockReturnValue(entity);
        entityFactory.mockReturnValue(entity);
        entitiesManager = new EntitiesManager(scene, wrapper);
        const data: WAMEntityData = {
            x: 32,
            y: 32,
            prefabRef: { id: prefab.id, collectionName: prefab.collectionName },
            properties: [],
        };
        await entitiesManager.addEntity("chair-instance", data, undefined, true);
    });

    afterEach(() => {
        entitiesManager.destroy();
        mapEditorModeStore.set(false);
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedToolStore.set(undefined);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorEntityModeStore.set("ADD");
        vi.restoreAllMocks();
    });

    function clickEntity(downElement: Element = canvas, button = 0): void {
        const pointer = mock<Phaser.Input.Pointer>({ button });
        Object.defineProperty(pointer, "downElement", { value: downElement });
        pointer.leftButtonDown.mockReturnValue(button === 0);
        pointer.rightButtonDown.mockReturnValue(button === 2);
        entityEvents.emit(Phaser.Input.Events.POINTER_DOWN, pointer);
    }

    it("keeps the group tool active when a marquee starts over furniture", () => {
        clickEntity();

        expect(manager.equipTool.mock.calls).toHaveLength(0);
        expect(get(mapEditorSelectedToolStore)).toBe(EditorToolName.SelectionEditor);
        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
    });

    it("preserves the native single object editing flow from another editor tool", () => {
        mapEditorSelectedToolStore.set(EditorToolName.WAMSettingsEditor);
        clickEntity();

        expect(manager.equipTool.mock.calls).toEqual([[EditorToolName.EntityEditor]]);
        expect(get(mapEditorSelectedEntityStore)).toBe(entity);
    });

    it("ignores entity clicks while the area editor tool is active", () => {
        mapEditorSelectedToolStore.set(EditorToolName.AreaEditor);
        clickEntity();

        expect(manager.equipTool.mock.calls).toHaveLength(0);
        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
    });

    it("ignores entity clicks while the floor and wall tool is active", () => {
        mapEditorSelectedToolStore.set(EditorToolName.MapLayerEditor);
        clickEntity();

        expect(manager.equipTool.mock.calls).toHaveLength(0);
        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
    });

    it("ignores a pointer pressed outside the game canvas", () => {
        mapEditorSelectedToolStore.set(EditorToolName.AreaEditor);
        clickEntity(document.createElement("button"));

        expect(manager.equipTool.mock.calls).toHaveLength(0);
        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
    });

    it("opens the clicked object while another object is picked to be placed", () => {
        mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
        mapEditorSelectedEntityPrefabStore.set({ ...pickedPrefab });
        clickEntity();

        expect(get(mapEditorSelectedEntityStore)).toBe(entity);
        expect(get(mapEditorEntityModeStore)).toBe("EDIT");
    });

    it("keeps placing the picked object on a floor object", () => {
        mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
        mapEditorSelectedEntityPrefabStore.set({ ...pickedPrefab });
        entity.getPrefab.mockReturnValue({ ...pickedPrefab, id: "rug", layer: "floor" });
        clickEntity();

        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
        expect(get(mapEditorEntityModeStore)).toBe("ADD");
    });

    it("refreshes the selected instance when resize undo/redo recreates it with the same id", async () => {
        mapEditorSelectedEntityStore.set(mock<Entity>({ entityId: "chair-instance" }));
        await entitiesManager.addEntity("chair-instance", {
            x: 32,
            y: 32,
            prefabRef: { id: "chair", collectionName: "Furniture" },
            properties: [],
        });
        expect(get(mapEditorSelectedEntityStore)).toBe(entity);
    });

    it("leaves the picked object alone on a right click on a placed object", () => {
        // A right click (or Ctrl+click on a Mac) drops the picked object: it must not open the object under it.
        mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
        mapEditorSelectedEntityPrefabStore.set({ ...pickedPrefab });
        clickEntity(canvas, 2);

        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
        expect(get(mapEditorEntityModeStore)).toBe("ADD");
    });

    it("does not open an object on a right click without a picked object either", () => {
        mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
        clickEntity(canvas, 2);

        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
    });

    it("closes the properties of an object deleted from the map", () => {
        mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
        clickEntity();
        expect(get(mapEditorEntityModeStore)).toBe("EDIT");

        entitiesManager.deleteEntity("chair-instance");
        entitiesManager.syncSelectionWithMap();

        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
        expect(get(mapEditorEntityModeStore)).toBe("ADD");
    });

    it("keeps the selection on an object replaced under the same id", async () => {
        mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
        clickEntity();
        const replacement = mock<Entity>({ entityId: "chair-instance", x: 32, y: 32 });
        replacement.on.mockReturnValue(replacement);
        replacement.setVisible.mockReturnValue(replacement);
        replacement.showPrefabTexture.mockReturnValue(replacement);
        replacement.getOverlappingEntities.mockReturnValue([]);
        replacement.getPrefab.mockReturnValue(entity.getPrefab());
        entityFactory.mockReturnValue(replacement);

        entitiesManager.deleteEntity("chair-instance");
        await entitiesManager.addEntity("chair-instance", {
            x: 32,
            y: 32,
            prefabRef: { id: "chair", collectionName: "Furniture" },
            properties: [],
        });
        entitiesManager.syncSelectionWithMap();

        expect(get(mapEditorSelectedEntityStore)).toBe(replacement);
        expect(get(mapEditorEntityModeStore)).toBe("EDIT");
    });

    describe("dragging an object with a modifier", () => {
        let copies: unknown[];
        let updates: unknown[];

        beforeEach(() => {
            mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
            wrapper.canEntityBePlacedOnMap.mockReturnValue(true);
            entity.getOldPosition.mockReturnValue({ x: 32, y: 32 });
            entity.getPosition.mockReturnValue({ x: 96, y: 32 });
            entity.getEntityData.mockReturnValue({
                x: 32,
                y: 32,
                prefabRef: { id: "chair", collectionName: "Furniture" },
                properties: [],
                name: "",
                depthStep: 0,
            });
            copies = [];
            updates = [];
            entitiesManager.on(EntitiesManagerEvent.CopyEntity, (data: unknown) => copies.push(data));
            entitiesManager.on(EntitiesManagerEvent.UpdateEntity, (data: unknown) => updates.push(data));
            clickEntity();
        });

        function releaseDrag(modifiers: MouseEventInit): void {
            const pointer = mock<Phaser.Input.Pointer>({ button: 0 });
            Object.defineProperty(pointer, "event", { value: new MouseEvent("mouseup", modifiers) });
            entityEvents.emit(Phaser.Input.Events.DRAG_END, pointer, 96, 32);
        }

        it.each([{ metaKey: true }, { altKey: true }, { ctrlKey: true }])("copies the object with %o", (modifiers) => {
            releaseDrag(modifiers);

            expect(copies).toHaveLength(1);
            expect(updates).toHaveLength(0);
        });

        it("moves the object without a modifier", () => {
            releaseDrag({});

            expect(copies).toHaveLength(0);
            expect(updates).toHaveLength(1);
            expect(get(mapEditorSelectedEntityDraggedStore)).toBe(false);
        });
    });
});
