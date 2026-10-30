import * as Phaser from "phaser";
import type { EntityPrefab, WAMEntityData } from "@workadventure/map-editor";
import { mock } from "vitest-mock-extended";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type * as EntityModule from "../../../../src/front/Phaser/ECS/Entity";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { EditorToolName } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import {
    mapEditorModeStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
    mapEditorSelectedToolStore,
} from "../../../../src/front/Stores/MapEditorStore";

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

    beforeEach(async () => {
        mapEditorModeStore.set(true);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedToolStore.set(EditorToolName.SelectionEditor);
        canvas = document.createElement("canvas");
        const scene = mock<GameScene>();
        const wrapper = mock<GameMapFrontWrapper>();
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
        vi.restoreAllMocks();
    });

    function clickEntity(downElement: Element = canvas): void {
        const pointer = mock<Phaser.Input.Pointer>();
        Object.defineProperty(pointer, "downElement", { value: downElement });
        entityEvents.emit(Phaser.Input.Events.POINTER_DOWN, pointer);
    }

    it("keeps the group tool active when a marquee starts over furniture", () => {
        clickEntity();

        expect(manager.equipTool.mock.calls).toHaveLength(0);
        expect(get(mapEditorSelectedToolStore)).toBe(EditorToolName.SelectionEditor);
        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
    });

    it("preserves the native single object editing flow from another editor tool", () => {
        mapEditorSelectedToolStore.set(EditorToolName.AreaEditor);
        clickEntity();

        expect(manager.equipTool.mock.calls).toEqual([[EditorToolName.EntityEditor]]);
        expect(get(mapEditorSelectedEntityStore)).toBe(entity);
    });

    it("ignores a pointer pressed outside the game canvas", () => {
        mapEditorSelectedToolStore.set(EditorToolName.AreaEditor);
        clickEntity(document.createElement("button"));

        expect(manager.equipTool.mock.calls).toHaveLength(0);
        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
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
});
