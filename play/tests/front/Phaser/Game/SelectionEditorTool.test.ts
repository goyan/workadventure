import { EntityPrefab, WamFile } from "@workadventure/map-editor";
import type { EntityPrefab as EntityPrefabType, GameMap, WAMEntityData } from "@workadventure/map-editor";
import { mock } from "vitest-mock-extended";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { AreaEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/AreaEditorTool";
import { SelectionEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/SelectionEditorTool";
import { TexturesHelper } from "../../../../src/front/Phaser/Helpers/TexturesHelper";
import { userIsAdminStore, userIsEditorStore } from "../../../../src/front/Stores/GameStore";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorVisibilityStore,
} from "../../../../src/front/Stores/MapEditorStore";
import { mapEditorSelectionStore } from "../../../../src/front/Stores/MapEditorSelectionStore";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import type { FrontCommand } from "../../../../src/front/Phaser/Game/MapEditor/Commands/FrontCommand";

const floorPrefab = EntityPrefab.parse({
    id: "tile",
    name: "Floor tile",
    tags: ["Sols"],
    imagePath: "tile.png",
    direction: "Down",
    color: "Default",
    collectionName: "Tiles",
    type: "Default",
    collisionGrid: [[0]],
});

const wallPrefab = EntityPrefab.parse({
    id: "wall",
    name: "Wall",
    tags: ["Murs"],
    imagePath: "wall.png",
    direction: "Down",
    color: "Default",
    collectionName: "Walls",
    type: "Default",
    collisionGrid: [[1]],
});

const furniturePrefab = EntityPrefab.parse({
    id: "chair",
    name: "Chair",
    tags: ["Furniture"],
    imagePath: "chair.png",
    direction: "Down",
    color: "Default",
    collectionName: "Objects",
    type: "Default",
});

const pilePrefab = EntityPrefab.parse({
    id: "pile",
    name: "Pile",
    tags: ["Piles", "Custom"],
    imagePath: "pile.png",
    direction: "Down",
    color: "Default",
    collectionName: "Objects",
    type: "Default",
});

const descriptionProperty = {
    id: "description",
    type: "entityDescriptionProperties" as const,
    description: "Keep these properties",
    searchable: true,
};

function area(id: string, x: number, y: number, width: number, height: number) {
    return {
        id,
        x,
        y,
        width,
        height,
        name: `Area ${id}`,
        visible: true,
        properties: [],
    };
}

function pointerAt(
    canvas: HTMLCanvasElement,
    worldX: number,
    worldY: number,
    options: { pointerId?: number; button?: number; canvasOrigin?: boolean; pressed?: boolean } = {},
): Phaser.Input.Pointer {
    const pointerId = options.pointerId ?? 1;
    const button = options.button ?? 0;
    const pointer = mock<Phaser.Input.Pointer>({
        id: pointerId,
        x: worldX,
        y: worldY,
        worldX,
        worldY,
        button,
    });
    Object.defineProperty(pointer, "downElement", {
        configurable: true,
        value: options.canvasOrigin === false ? document.body : canvas,
    });
    const event = new MouseEvent("mousemove", { button, clientX: worldX, clientY: worldY });
    if (options.canvasOrigin === false) {
        Object.defineProperty(event, "target", { configurable: true, value: document.body });
    } else {
        Object.defineProperty(event, "target", { configurable: true, value: canvas });
    }
    Object.defineProperty(pointer, "event", { configurable: true, value: event });
    pointer.leftButtonDown.mockReturnValue(options.pressed ?? button === 0);
    return pointer;
}

function defaultSelectionState() {
    return {
        entityCount: 0,
        areaCount: 0,
        hasClipboard: false,
        hasRectangle: false,
        mode: "select" as const,
        busy: false,
        error: undefined,
    };
}

describe("SelectionEditorTool", () => {
    let canvas: HTMLCanvasElement;
    let wamFile: WamFile;
    let entities: Map<string, Entity>;
    let entitiesManager: ReturnType<typeof mock<EntitiesManager>>;
    let gameMapFrontWrapper: ReturnType<typeof mock<GameMapFrontWrapper>>;
    let mapEditorModeManager: ReturnType<typeof mock<MapEditorModeManager>>;
    let areaEditorTool: ReturnType<typeof mock<AreaEditorTool>>;
    let scene: ReturnType<typeof mock<GameScene>>;
    let input: ReturnType<typeof mock<Phaser.Input.InputPlugin>>;
    let inputEvents: Phaser.Events.EventEmitter;
    let graphics: ReturnType<typeof mock<Phaser.GameObjects.Graphics>>;
    let textureManager: ReturnType<typeof mock<Phaser.Textures.TextureManager>>;
    let tool: SelectionEditorTool;
    let commandGroups: FrontCommand[][];
    let textureDimensions: { width: number; height: number };
    let activePointer: Phaser.Input.Pointer;

    function entityData(
        x: number,
        y: number,
        prefab: EntityPrefabType,
        name = prefab.name,
        properties: WAMEntityData["properties"] = [],
    ): WAMEntityData {
        return {
            x,
            y,
            name,
            properties,
            prefabRef: { collectionName: prefab.collectionName, id: prefab.id },
        };
    }

    function createLiveEntity(
        id: string,
        data: WAMEntityData,
        prefab: EntityPrefabType,
        width = 32,
        height = 32,
        canEdit = true,
    ): Entity {
        const liveEntity = mock<Entity>({
            entityId: id,
            x: data.x,
            y: data.y,
            width,
            height,
        });
        liveEntity.getPrefab.mockReturnValue(prefab);
        liveEntity.getOldPosition.mockReturnValue({ x: data.x, y: data.y });
        liveEntity.getCollisionRectangle.mockImplementation(() => ({
            x: liveEntity.x,
            y: liveEntity.y,
            width,
            height,
        }));
        liveEntity.updateEntity.mockImplementation((changes) => {
            liveEntity.x = changes.x ?? liveEntity.x;
            liveEntity.y = changes.y ?? liveEntity.y;
        });
        Object.defineProperty(liveEntity, "canEdit", { configurable: true, value: canEdit });
        entities.set(id, liveEntity);
        return liveEntity;
    }

    function addEntity(
        id: string,
        x: number,
        y: number,
        prefab: EntityPrefabType = floorPrefab,
        options: {
            width?: number;
            height?: number;
            canEdit?: boolean;
            name?: string;
            properties?: WAMEntityData["properties"];
        } = {},
    ): Entity {
        const data = entityData(x, y, prefab, options.name, options.properties);
        wamFile.getGameMapEntities().addEntity(id, data);
        return createLiveEntity(id, data, prefab, options.width ?? 32, options.height ?? 32, options.canEdit ?? true);
    }

    function emitPointerDown(pointer: Phaser.Input.Pointer): void {
        activePointer = pointer;
        inputEvents.emit(Phaser.Input.Events.POINTER_DOWN, pointer, []);
    }

    function emitPointerMove(pointer: Phaser.Input.Pointer): void {
        activePointer = pointer;
        inputEvents.emit(Phaser.Input.Events.POINTER_MOVE, pointer, []);
    }

    function emitPointerUp(pointer: Phaser.Input.Pointer): void {
        activePointer = pointer;
        inputEvents.emit(Phaser.Input.Events.POINTER_UP, pointer, []);
    }

    function select(startX: number, startY: number, endX: number, endY: number): void {
        emitPointerDown(pointerAt(canvas, startX, startY));
        emitPointerMove(pointerAt(canvas, endX, endY));
        emitPointerUp(pointerAt(canvas, endX, endY, { pressed: false }));
    }

    async function settle(): Promise<void> {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    }

    beforeEach(() => {
        canvas = document.createElement("canvas");
        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 500));
        wamFile = new WamFile({
            version: "1",
            mapUrl: "test.wam",
            entities: {},
            areas: [],
            entityCollections: [],
        });
        entities = new Map();
        entitiesManager = mock<EntitiesManager>();
        entitiesManager.getEntities.mockReturnValue(entities);
        entitiesManager.deleteEntity.mockImplementation((id) => entities.delete(id));
        entitiesManager.addEntity.mockImplementation((id, data) => {
            const prefab =
                [floorPrefab, wallPrefab, furniturePrefab, pilePrefab].find(
                    (candidate) =>
                        candidate.collectionName === data.prefabRef.collectionName &&
                        candidate.id === data.prefabRef.id,
                ) ?? (data.prefabRef.collectionName === furniturePrefab.collectionName ? furniturePrefab : undefined);
            if (!prefab) {
                return Promise.reject(new Error("The fixture only supports its declared prefabs"));
            }
            return Promise.resolve(createLiveEntity(id, data, prefab));
        });

        gameMapFrontWrapper = mock<GameMapFrontWrapper>();
        gameMapFrontWrapper.getEntitiesManager.mockReturnValue(entitiesManager);
        gameMapFrontWrapper.getAreas.mockImplementation(() => wamFile.getGameMapAreas().getAreas());
        gameMapFrontWrapper.getTileDimensions.mockReturnValue({ width: 32, height: 32 });
        gameMapFrontWrapper.canEntityBePlacedOnMap.mockImplementation((position, width, height) => {
            return position.x >= 0 && position.y >= 0 && position.x + width <= 500 && position.y + height <= 500;
        });
        gameMapFrontWrapper.isOutOfMapBounds.mockImplementation((x, y, width = 0, height = 0) => {
            return x < 0 || y < 0 || x + width > 500 || y + height > 500;
        });

        scene = mock<GameScene>();
        scene.game = mock<Phaser.Game>();
        scene.game.canvas = canvas;
        scene.scale = mock<Phaser.Scale.ScaleManager>({ width: 500, height: 500 });
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
        input.setDefaultCursor.mockReturnValue(input);
        Object.defineProperty(input, "activePointer", {
            configurable: true,
            get: () => activePointer,
        });
        scene.input = input;
        scene.getGameMapFrontWrapper.mockReturnValue(gameMapFrontWrapper);
        const gameMap = mock<GameMap>();
        gameMap.getWamFile.mockReturnValue(wamFile);
        scene.getGameMap.mockReturnValue(gameMap);
        scene.markDirty.mockImplementation(() => undefined);
        textureManager = mock<Phaser.Textures.TextureManager>();
        scene.textures = textureManager;

        textureDimensions = { width: 32, height: 32 };
        graphics = mock<Phaser.GameObjects.Graphics>();
        graphics.setDepth.mockReturnValue(graphics);
        graphics.setVisible.mockReturnValue(graphics);
        graphics.clear.mockReturnValue(graphics);
        graphics.fillStyle.mockReturnValue(graphics);
        graphics.lineStyle.mockReturnValue(graphics);
        const gameObjectFactory = mock<Phaser.GameObjects.GameObjectFactory>();
        gameObjectFactory.graphics.mockReturnValue(graphics);
        scene.add = gameObjectFactory;

        const texture = mock<Phaser.Textures.Texture>();
        const frame = mock<Phaser.Textures.Frame>({
            width: textureDimensions.width,
            height: textureDimensions.height,
        });
        texture.get.mockReturnValue(frame);
        const sourceImage = new Image();
        sourceImage.width = textureDimensions.width;
        sourceImage.height = textureDimensions.height;
        texture.getSourceImage.mockReturnValue(sourceImage);
        textureManager.get.mockReturnValue(texture);
        vi.spyOn(TexturesHelper, "loadEntityImage").mockResolvedValue();

        areaEditorTool = mock<AreaEditorTool>();
        mapEditorModeManager = mock<MapEditorModeManager>();
        mapEditorModeManager.getScene.mockReturnValue(scene);
        commandGroups = [];
        mapEditorModeManager.executeCommands.mockImplementation(async (commands) => {
            const group = [...commands];
            commandGroups.push(group);
            await group.reduce(
                (previous, command) => previous.then(() => command.execute()).then(() => undefined),
                Promise.resolve(),
            );
        });

        userIsAdminStore.set(false);
        userIsEditorStore.set(false);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorCopiedEntityDataPropertiesStore.set(undefined);
        mapEditorVisibilityStore.set(false);
        mapEditorSelectionStore.set(defaultSelectionState());
        activePointer = pointerAt(canvas, 0, 0);
        tool = new SelectionEditorTool(mapEditorModeManager, areaEditorTool);
        tool.activate();
    });

    afterEach(() => {
        tool?.destroy();
        userIsAdminStore.set(false);
        userIsEditorStore.set(false);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorCopiedEntityDataPropertiesStore.set(undefined);
        mapEditorVisibilityStore.set(false);
        mapEditorSelectionStore.set(defaultSelectionState());
        vi.restoreAllMocks();
    });

    it("selects editable overlapping entities of every tag and authorized areas in either drag direction", async () => {
        addEntity("floor", 16, 16, floorPrefab);
        addEntity("wall", 36, 36, wallPrefab, { width: 64 });
        addEntity("furniture", 64, 64, furniturePrefab);
        addEntity("custom-pile", 80, 16, pilePrefab);
        addEntity("not-editable", 48, 16, floorPrefab, { canEdit: false });
        addEntity("edge-touching", 120, 40, floorPrefab);
        addEntity("outside", 180, 180, furniturePrefab);
        wamFile.getGameMapAreas().addArea(area("selected-area", 24, 24, 30, 30), true);
        userIsEditorStore.set(true);

        select(120, 120, 0, 0);

        expect(get(mapEditorSelectionStore)).toMatchObject({
            entityCount: 4,
            areaCount: 1,
            hasRectangle: true,
            mode: "select",
        });
        expect(graphics.fillRect.mock.calls).toContainEqual([0, 0, 120, 120]);

        await tool.deleteSelection();
        expect(Object.keys(wamFile.getGameMapEntities().getEntities()).sort()).toEqual([
            "edge-touching",
            "not-editable",
            "outside",
        ]);
        expect(wamFile.getGameMapAreas().getAreas()?.has("selected-area")).toBe(false);
    });

    it("does not start a rectangle from outside the canvas and cancels interrupted drags", () => {
        addEntity("inside", 16, 16);
        emitPointerDown(pointerAt(canvas, 0, 0, { canvasOrigin: false }));
        emitPointerMove(pointerAt(canvas, 64, 64));
        emitPointerUp(pointerAt(canvas, 64, 64, { pressed: false }));
        expect(get(mapEditorSelectionStore).hasRectangle).toBe(false);

        emitPointerDown(pointerAt(canvas, 0, 0));
        emitPointerMove(pointerAt(canvas, 64, 64));
        inputEvents.emit(Phaser.Input.Events.POINTER_UP_OUTSIDE, pointerAt(canvas, 64, 64));
        expect(get(mapEditorSelectionStore)).toMatchObject({ entityCount: 0, hasRectangle: false });

        emitPointerDown(pointerAt(canvas, 0, 0));
        emitPointerMove(pointerAt(canvas, 64, 64));
        window.dispatchEvent(new Event("blur"));
        expect(get(mapEditorSelectionStore).hasRectangle).toBe(false);

        select(0, 0, 64, 64);
        tool.moveSelection();
        inputEvents.emit(Phaser.Input.Events.GAME_OUT);
        expect(get(mapEditorSelectionStore)).toMatchObject({ entityCount: 1, mode: "select" });
    });

    it("keeps the initiating pointer as the owner of rectangle and placement gestures", async () => {
        addEntity("first", 16, 16);
        addEntity("second", 160, 160, furniturePrefab);
        emitPointerDown(pointerAt(canvas, 0, 0, { pointerId: 1 }));
        emitPointerDown(pointerAt(canvas, 120, 120, { pointerId: 2 }));
        emitPointerMove(pointerAt(canvas, 80, 80, { pointerId: 2 }));
        emitPointerUp(pointerAt(canvas, 80, 80, { pointerId: 2, pressed: false }));
        emitPointerMove(pointerAt(canvas, 64, 64, { pointerId: 1 }));
        emitPointerUp(pointerAt(canvas, 64, 64, { pointerId: 1, pressed: false }));
        expect(get(mapEditorSelectionStore)).toMatchObject({ entityCount: 1, hasRectangle: true });

        tool.moveSelection();
        emitPointerDown(pointerAt(canvas, 192, 192, { pointerId: 1 }));
        emitPointerMove(pointerAt(canvas, 480, 480, { pointerId: 2 }));
        emitPointerUp(pointerAt(canvas, 480, 480, { pointerId: 2, pressed: false }));
        expect(wamFile.getGameMapEntities().getEntity("first")).toMatchObject({ x: 16, y: 16 });
        expect(get(mapEditorSelectionStore).mode).toBe("move");

        emitPointerUp(pointerAt(canvas, 192, 192, { pointerId: 1, pressed: false }));
        await vi.waitFor(() => expect(get(mapEditorSelectionStore).busy).toBe(false));
        expect(get(mapEditorSelectionStore).mode).toBe("select");
    });

    it("keeps a deep clipboard snapshot and pastes with new IDs and preserved properties", async () => {
        addEntity("chair-original", 32, 32, furniturePrefab, {
            name: "Original chair",
            properties: [descriptionProperty],
        });
        wamFile.getGameMapAreas().addArea(area("zone-original", 32, 32, 32, 32), true);
        userIsEditorStore.set(true);
        select(0, 0, 64, 64);
        tool.copySelection();
        wamFile.getGameMapEntities().updateEntity("chair-original", { x: 400, y: 400, name: "Changed later" });

        tool.clear();
        tool.activate();
        tool.pasteSelection();
        expect(Object.keys(wamFile.getGameMapEntities().getEntities())).toEqual(["chair-original"]);
        emitPointerDown(pointerAt(canvas, 200, 200));
        expect(Object.keys(wamFile.getGameMapEntities().getEntities())).toEqual(["chair-original"]);
        emitPointerUp(pointerAt(canvas, 200, 200, { pressed: false }));
        await vi.waitFor(() => expect(get(mapEditorSelectionStore).busy).toBe(false));

        const entitiesOnMap = wamFile.getGameMapEntities().getEntities();
        const pastedEntry = Object.entries(entitiesOnMap).find(([id]) => id !== "chair-original");
        expect(pastedEntry).toBeDefined();
        expect(pastedEntry?.[1]).toMatchObject({
            name: "Original chair",
            x: 192,
            y: 192,
            prefabRef: { collectionName: "Objects", id: "chair" },
            properties: [descriptionProperty],
        });
        const pastedArea = Array.from(wamFile.getGameMapAreas().getAreas()?.values() ?? []).find(
            (value) => value.id !== "zone-original",
        );
        expect(pastedArea).toMatchObject({
            x: 192,
            y: 192,
            width: 32,
            height: 32,
            name: "Area zone-original",
            visible: true,
        });
        expect(pastedArea?.id).not.toBe("zone-original");
        expect(get(mapEditorSelectionStore)).toMatchObject({ entityCount: 1, areaCount: 1, mode: "select" });
    });

    it("moves a group by one snapped delta and leaves relative offsets intact", async () => {
        addEntity("first", 32, 32, floorPrefab);
        addEntity("second", 128, 96, wallPrefab, { width: 64 });
        wamFile.getGameMapAreas().addArea(area("zone", 48, 48, 16, 16), true);
        userIsEditorStore.set(true);
        select(0, 0, 220, 160);
        expect(get(mapEditorSelectionStore).entityCount).toBe(2);
        tool.moveSelection();
        emitPointerMove(pointerAt(canvas, 160, 128));
        graphics.strokeRect.mockClear();
        emitPointerMove(pointerAt(canvas, 192, 160));
        expect(graphics.strokeRect.mock.calls).toContainEqual([128, 128, 32, 32]);
        expect(graphics.strokeRect.mock.calls).toContainEqual([224, 192, 64, 32]);

        emitPointerDown(pointerAt(canvas, 192, 160));
        emitPointerUp(pointerAt(canvas, 192, 160, { pressed: false }));
        await vi.waitFor(() => expect(get(mapEditorSelectionStore).busy).toBe(false));

        expect(wamFile.getGameMapEntities().getEntity("first")).toMatchObject({ x: 128, y: 128 });
        expect(wamFile.getGameMapEntities().getEntity("second")).toMatchObject({ x: 224, y: 192 });
        expect(wamFile.getGameMapAreas().getAreas()?.get("zone")).toMatchObject({ x: 144, y: 144 });
        expect(get(mapEditorSelectionStore)).toMatchObject({ entityCount: 2, mode: "select" });
        expect(commandGroups).toHaveLength(1);
        expect(commandGroups[0]).toHaveLength(3);
    });

    it("refuses a group move in full when any destination is out of bounds", async () => {
        addEntity("first", 32, 32, floorPrefab);
        addEntity("second", 128, 96, wallPrefab, { width: 64 });
        select(0, 0, 220, 160);
        tool.moveSelection();

        emitPointerDown(pointerAt(canvas, 480, 480));
        emitPointerUp(pointerAt(canvas, 480, 480, { pressed: false }));
        await settle();

        expect(get(mapEditorSelectionStore).error).toBe("blocked");
        expect(commandGroups).toHaveLength(0);
        expect(wamFile.getGameMapEntities().getEntity("first")).toMatchObject({ x: 32, y: 32 });
        expect(wamFile.getGameMapEntities().getEntity("second")).toMatchObject({ x: 128, y: 96 });
    });

    it("rechecks source editing rights before deleting the selected group", async () => {
        const entity = addEntity("chair", 32, 32, furniturePrefab);
        wamFile.getGameMapAreas().addArea(area("zone", 16, 16, 64, 64), true);
        userIsEditorStore.set(true);
        select(0, 0, 96, 96);
        expect(get(mapEditorSelectionStore)).toMatchObject({ entityCount: 1, areaCount: 1 });

        userIsEditorStore.set(false);
        await tool.deleteSelection();
        expect(commandGroups).toHaveLength(0);
        expect(get(mapEditorSelectionStore).error).toBe("blocked");
        expect(wamFile.getGameMapAreas().getAreas()?.has("zone")).toBe(true);
        expect(wamFile.getGameMapEntities().getEntity("chair")).toBeDefined();

        userIsEditorStore.set(true);
        Object.defineProperty(entity, "canEdit", { value: false });
        await tool.deleteSelection();
        expect(commandGroups).toHaveLength(0);
        expect(wamFile.getGameMapEntities().getEntity("chair")).toBeDefined();
    });

    it("updates selected outlines after native undo and removes deleted selection members", async () => {
        const entity = addEntity("chair", 32, 32, furniturePrefab);
        select(0, 0, 96, 96);
        tool.moveSelection();
        emitPointerDown(pointerAt(canvas, 160, 160));
        emitPointerUp(pointerAt(canvas, 160, 160, { pressed: false }));
        await vi.waitFor(() => expect(get(mapEditorSelectionStore).busy).toBe(false));

        await commandGroups[0][0].getUndoCommand().execute();
        graphics.strokeRect.mockClear();
        tool.refreshSelection();
        expect(graphics.strokeRect.mock.calls).toContainEqual([32, 32, 32, 32]);
        expect(entity.x).toBe(32);

        wamFile.getGameMapEntities().deleteEntity("chair");
        entities.delete("chair");
        tool.refreshSelection();
        expect(get(mapEditorSelectionStore).entityCount).toBe(0);
    });

    it("deletes only the selected editable entities as one command group", async () => {
        addEntity("selected", 16, 16);
        addEntity("unselected", 180, 180, furniturePrefab);
        addEntity("protected", 48, 16, floorPrefab, { canEdit: false });
        select(0, 0, 64, 64);
        await tool.deleteSelection();

        expect(Object.keys(wamFile.getGameMapEntities().getEntities()).sort()).toEqual(["protected", "unselected"]);
        expect(commandGroups).toHaveLength(1);
        expect(commandGroups[0]).toHaveLength(1);
        expect(get(mapEditorSelectionStore)).toMatchObject({ entityCount: 0, hasRectangle: true, busy: false });
    });

    it("fills an empty rectangle with repeated arbitrary-size prefabs without overflow or duplicates", async () => {
        const largePrefab = EntityPrefab.parse({
            ...furniturePrefab,
            id: "large-tile",
            name: "Large tile",
            imagePath: "large-tile.png",
        });
        textureDimensions = { width: 64, height: 48 };
        const texture = mock<Phaser.Textures.Texture>();
        const frame = mock<Phaser.Textures.Frame>({ width: 64, height: 48 });
        texture.get.mockReturnValue(frame);
        const sourceImage = new Image();
        sourceImage.width = 64;
        sourceImage.height = 48;
        texture.getSourceImage.mockReturnValue(sourceImage);
        textureManager.get.mockReturnValue(texture);
        select(0, 0, 130, 100);
        mapEditorSelectedEntityPrefabStore.set(largePrefab);

        await tool.fillSelection();
        expect(gameMapFrontWrapper.canEntityBePlacedOnMap.mock.calls.map(([position]) => position)).toEqual([
            { x: 0, y: 0 },
            { x: 64, y: 0 },
        ]);
        expect(Object.values(wamFile.getGameMapEntities().getEntities()).map(({ x, y }) => [x, y])).toEqual([
            [0, 0],
            [64, 0],
        ]);
        expect(get(mapEditorSelectionStore).entityCount).toBe(2);
        expect(commandGroups).toHaveLength(1);
        expect(commandGroups[0]).toHaveLength(2);

        await tool.fillSelection();
        expect(Object.keys(wamFile.getGameMapEntities().getEntities())).toHaveLength(2);
        expect(commandGroups).toHaveLength(1);
        expect(get(mapEditorSelectionStore)).toMatchObject({ busy: false, error: undefined });
    });

    it("keeps the selected prefab snapshot for the whole asynchronous fill", async () => {
        const firstPrefab = floorPrefab;
        const secondPrefab = furniturePrefab;
        let resolveTexture: (() => void) | undefined;
        vi.spyOn(TexturesHelper, "loadEntityImage").mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveTexture = resolve;
                }),
        );
        select(0, 0, 32, 32);
        mapEditorSelectedEntityPrefabStore.set(firstPrefab);

        const fill = tool.fillSelection();
        expect(get(mapEditorSelectionStore).busy).toBe(true);
        mapEditorSelectedEntityPrefabStore.set(secondPrefab);
        resolveTexture?.();
        await fill;

        expect(Object.values(wamFile.getGameMapEntities().getEntities()).map(({ prefabRef }) => prefabRef)).toEqual([
            { collectionName: firstPrefab.collectionName, id: firstPrefab.id },
        ]);
    });

    it("cancels a pending fill when the tool is cleared before image loading finishes", async () => {
        let resolveTexture: (() => void) | undefined;
        vi.spyOn(TexturesHelper, "loadEntityImage").mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveTexture = resolve;
                }),
        );
        select(0, 0, 32, 32);
        mapEditorSelectedEntityPrefabStore.set(floorPrefab);

        const fill = tool.fillSelection();
        expect(get(mapEditorSelectionStore).busy).toBe(true);
        tool.clear();
        resolveTexture?.();
        await fill;

        expect(wamFile.getGameMapEntities().getEntities()).toEqual({});
        expect(get(mapEditorSelectionStore)).toMatchObject({ busy: false, entityCount: 0, hasRectangle: false });
        expect(commandGroups).toHaveLength(0);
    });
});
