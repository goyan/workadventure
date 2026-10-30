import * as Phaser from "phaser";
import { EntityPrefab, WamFile } from "@workadventure/map-editor";
import type { GameMap, WAMEntityData } from "@workadventure/map-editor";
import { asError } from "catch-unknown";
import { mock } from "vitest-mock-extended";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { DeleteEntityFrontCommand } from "../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/DeleteEntityFrontCommand";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import { EntityEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool";
import { TexturesHelper } from "../../../../src/front/Phaser/Helpers/TexturesHelper";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorEntityFileDroppedStore,
    mapEditorEntityModeStore,
    mapEditorModeStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
    mapEditorSnapEnabledStore,
} from "../../../../src/front/Stores/MapEditorStore";

const floorPrefab = EntityPrefab.parse({
    id: "Infogène Sols:sol-carrelage-gris-2-1:Default:Down",
    name: "sol-carrelage-gris-2-1",
    tags: ["Sols"],
    imagePath: "thin-sol-carrelage-gris-2-1.png",
    direction: "Down",
    color: "Default",
    collisionGrid: [[0]],
    depthOffset: -32,
    collectionName: "Infogène Sols",
    type: "Default",
});

const furniturePrefab = EntityPrefab.parse({
    id: "chair",
    name: "Chair",
    tags: ["Furniture"],
    imagePath: "chair.png",
    direction: "Down",
    color: "#888888",
    collectionName: "Furniture",
    type: "Default",
});

const wallPrefab = EntityPrefab.parse({
    id: "wall",
    name: "Wall",
    tags: ["Murs"],
    imagePath: "wall.png",
    direction: "Down",
    color: "#888888",
    collisionGrid: [[1]],
    depthOffset: -32,
    collectionName: "Infogène Murs",
    type: "Default",
});

function pointerAt(
    canvas: HTMLCanvasElement,
    worldX: number,
    worldY: number,
    button = 0,
    downElement: Element = canvas,
    clientX = 10,
): Phaser.Input.Pointer {
    const pointer = mock<Phaser.Input.Pointer>({
        id: 1,
        x: 10,
        y: 10,
        worldX,
        worldY,
        button,
    });
    Object.defineProperty(pointer, "downElement", { value: downElement });
    Object.defineProperty(pointer, "event", {
        value: new MouseEvent("mousemove", { button, clientX, clientY: 10 }),
    });
    pointer.leftButtonDown.mockReturnValue(button === 0);
    pointer.rightButtonDown.mockReturnValue(button === 2);
    pointer.middleButtonDown.mockReturnValue(button === 1);
    return pointer;
}

function tileCenter(x: number, y: number): { x: number; y: number } {
    return { x: x * 32 + 16, y: y * 32 + 16 };
}

function entityPositions(wamFile: WamFile): [number, number][] {
    return Object.values(wamFile.getGameMapEntities().getEntities())
        .map(({ x, y }): [number, number] => [x, y])
        .sort(([leftX, leftY], [rightX, rightY]) => leftY - rightY || leftX - rightX);
}

async function settleCommands(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("EntityEditorTool floor painting", () => {
    let canvas: HTMLCanvasElement;
    let wamFile: WamFile;
    let entities: Map<string, Entity>;
    let entitiesManager: ReturnType<typeof mock<EntitiesManager>>;
    let gameMapFrontWrapper: ReturnType<typeof mock<GameMapFrontWrapper>>;
    let mapEditorModeManager: ReturnType<typeof mock<MapEditorModeManager>>;
    let tool: EntityEditorTool;
    let input: ReturnType<typeof mock<Phaser.Input.InputPlugin>>;

    async function selectPrefab(prefab: EntityPrefab): Promise<void> {
        mapEditorSelectedEntityPrefabStore.set(prefab);
        await settleCommands();
    }

    beforeEach(() => {
        canvas = document.createElement("canvas");
        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 500));
        vi.spyOn(TexturesHelper, "loadEntityImage").mockResolvedValue();
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
        entitiesManager.addEntity.mockImplementation((entityId: string, data: WAMEntityData) => {
            const prefab = [floorPrefab, furniturePrefab, wallPrefab].find(
                ({ collectionName, id }) =>
                    collectionName === data.prefabRef.collectionName && id === data.prefabRef.id,
            );
            if (!prefab) {
                throw new Error("The test fixture only accepts its declared prefabs");
            }
            const entity = mock<Entity>({ entityId, x: data.x, y: data.y });
            entity.getPrefab.mockReturnValue(prefab);
            entities.set(entityId, entity);
            return Promise.resolve(entity);
        });
        entitiesManager.deleteEntity.mockImplementation((entityId: string) => entities.delete(entityId));

        gameMapFrontWrapper = mock<GameMapFrontWrapper>();
        gameMapFrontWrapper.getEntitiesManager.mockReturnValue(entitiesManager);
        gameMapFrontWrapper.getAreas.mockReturnValue(new Map());
        gameMapFrontWrapper.getTileDimensions.mockReturnValue({ width: 32, height: 32 });
        gameMapFrontWrapper.getTileIndexAt.mockImplementation((x: number, y: number) => ({
            x: Math.floor(x / 32),
            y: Math.floor(y / 32),
        }));
        gameMapFrontWrapper.canEntityBePlacedOnMap.mockReturnValue(true);

        const scene = mock<GameScene>();
        scene.game = mock<Phaser.Game>();
        scene.game.canvas = canvas;
        scene.scale = mock<Phaser.Scale.ScaleManager>({ width: 500, height: 500 });
        input = mock<Phaser.Input.InputPlugin>();
        const inputEvents = new Phaser.Events.EventEmitter();
        input.on.mockImplementation((event, listener, context) => {
            inputEvents.on(event, listener, context);
            return input;
        });
        input.off.mockImplementation((event, listener, context, once) => {
            inputEvents.off(event, listener, context, once);
            return input;
        });
        input.emit.mockImplementation((event, ...args) => inputEvents.emit(event, ...args));
        Object.defineProperty(input, "activePointer", { value: pointerAt(canvas, 16, 16) });
        const keyboard = { addKey: vi.fn(() => mock<Phaser.Input.Keyboard.Key>({ isDown: false })) };
        Object.defineProperty(input, "keyboard", { value: keyboard });
        scene.input = input;
        scene.getGameMapFrontWrapper.mockReturnValue(gameMapFrontWrapper);
        const gameMap = mock<GameMap>();
        gameMap.getWamFile.mockReturnValue(wamFile);
        scene.getGameMap.mockReturnValue(gameMap);
        scene.markDirty.mockImplementation(() => undefined);

        const preview = mock<Phaser.GameObjects.Image>({
            displayWidth: 32,
            displayHeight: 32,
            width: 32,
            height: 32,
        });
        let previewPosition = { x: 16, y: 16 };
        preview.setPosition.mockImplementation((x = 0, y = 0) => {
            previewPosition = { x, y };
            return preview;
        });
        preview.getTopLeft.mockImplementation(() => ({
            x: previewPosition.x - 16,
            y: previewPosition.y - 16,
        }));
        scene.add = mock<Phaser.GameObjects.GameObjectFactory>();
        Object.defineProperty(scene.add, "image", { value: vi.fn(() => preview) });

        mapEditorModeManager = mock<MapEditorModeManager>();
        mapEditorModeManager.getScene.mockReturnValue(scene);
        mapEditorModeManager.executeCommand.mockImplementation(async (command) => {
            await command.execute();
        });

        mapEditorSnapEnabledStore.set(true);
        mapEditorModeStore.set(true);
        mapEditorEntityModeStore.set("ADD");
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorCopiedEntityDataPropertiesStore.set(undefined);
        mapEditorEntityFileDroppedStore.set(false);

        tool = new EntityEditorTool(mapEditorModeManager);
        tool.activate();
    });

    afterEach(() => {
        if (tool) {
            tool.clear();
        }
        mapEditorModeStore.set(false);
        mapEditorEntityModeStore.set("ADD");
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorCopiedEntityDataPropertiesStore.set(undefined);
        mapEditorEntityFileDroppedStore.set(false);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("places one aligned floor tile on a simple click", async () => {
        await selectPrefab(floorPrefab);
        const position = tileCenter(2, 3);

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, position.x, position.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([[64, 96]]);
        expect(entities.size).toBe(1);
    });

    it("snaps an object without collision to the tile grid by default", async () => {
        await selectPrefab(furniturePrefab);

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 100, 70), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([[96, 64]]);
    });

    it("places an object without collision at the pixel when snapping is disabled", async () => {
        mapEditorSnapEnabledStore.set(false);
        await selectPrefab(furniturePrefab);

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 100, 70), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([[84, 54]]);
    });

    it("keeps the floor brush on the tile grid even when snapping is disabled", async () => {
        mapEditorSnapEnabledStore.set(false);
        await selectPrefab(floorPrefab);
        const position = tileCenter(2, 3);

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, position.x, position.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([[64, 96]]);
    });

    it("fills every intermediate cell on a fast horizontal stroke", async () => {
        await selectPrefab(floorPrefab);

        const start = tileCenter(2, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        const horizontalEnd = tileCenter(7, 3);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, horizontalEnd.x, horizontalEnd.y), []);
        await settleCommands();
        expect(entityPositions(wamFile)).toEqual([
            [64, 96],
            [96, 96],
            [128, 96],
            [160, 96],
            [192, 96],
            [224, 96],
        ]);

        tool.clear();
    });

    it("fills every intermediate cell on a vertical stroke", async () => {
        await selectPrefab(floorPrefab);
        const verticalStart = tileCenter(4, 1);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, verticalStart.x, verticalStart.y), []);
        const verticalEnd = tileCenter(4, 4);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, verticalEnd.x, verticalEnd.y), []);
        await settleCommands();
        expect(entityPositions(wamFile)).toEqual([
            [128, 32],
            [128, 64],
            [128, 96],
            [128, 128],
        ]);

        tool.clear();
    });

    it("fills every cell on a 45-degree diagonal", async () => {
        await selectPrefab(floorPrefab);
        const start = tileCenter(1, 1);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        const end = tileCenter(4, 4);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([
            [32, 32],
            [64, 64],
            [96, 96],
            [128, 128],
        ]);
    });

    it("does not duplicate cells during pauses, repeated moves, or a return stroke", async () => {
        await selectPrefab(floorPrefab);
        vi.useFakeTimers();
        const start = tileCenter(2, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        await settleCommands();
        await vi.advanceTimersByTimeAsync(1_000);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, start.x + 4, start.y + 3), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, start.x, start.y), []);
        const next = tileCenter(3, 3);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, next.x, next.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, start.x, start.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([
            [64, 96],
            [96, 96],
        ]);
    });

    it("does not add another copy when a later stroke retraces existing floor tiles", async () => {
        await selectPrefab(floorPrefab);
        const start = tileCenter(2, 3);
        const end = tileCenter(5, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, end.x, end.y));
        await settleCommands();

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([
            [64, 96],
            [96, 96],
            [128, 96],
            [160, 96],
        ]);
        expect(entities.size).toBe(4);
    });

    it("reserves cells while native creation commands are still queued", async () => {
        const queuedCommands: Array<() => Promise<void>> = [];
        mapEditorModeManager.executeCommand.mockImplementation(
            (command) =>
                new Promise<void>((resolve, reject) => {
                    queuedCommands.push(async () => {
                        try {
                            await command.execute();
                            resolve();
                        } catch (error) {
                            reject(asError(error));
                        }
                    });
                }),
        );
        await selectPrefab(floorPrefab);

        const start = tileCenter(2, 3);
        const end = tileCenter(5, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, start.x, start.y), []);

        expect(mapEditorModeManager.executeCommand.mock.calls).toHaveLength(4);
        expect(queuedCommands).toHaveLength(4);
        await Promise.all(queuedCommands.splice(0).map((runNextCommand) => runNextCommand()));
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([
            [64, 96],
            [96, 96],
            [128, 96],
            [160, 96],
        ]);
    });

    it("allows painting a cell again after its entity is deleted", async () => {
        await selectPrefab(floorPrefab);
        const position = tileCenter(2, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, position.x, position.y), []);
        await settleCommands();

        const [entityId] = Object.keys(wamFile.getGameMapEntities().getEntities());
        expect(entityId).toBeDefined();
        if (!entityId) {
            throw new Error("The initial paint should have created an entity");
        }
        await new DeleteEntityFrontCommand(wamFile, entityId, undefined, entitiesManager).execute();

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, position.x, position.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([[64, 96]]);
        expect(entities.size).toBe(1);
    });

    it.each(["pointer-up", "pointer-up-outside", "canvas-out", "blur", "escape", "clear", "prefab-switch"] as const)(
        "stops a stroke after %s without bridging the next segment",
        async (interruption) => {
            await selectPrefab(floorPrefab);
            const start = tileCenter(2, 3);
            input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);

            if (interruption === "pointer-up") {
                input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, start.x, start.y));
            } else if (interruption === "pointer-up-outside") {
                input.emit(Phaser.Input.Events.POINTER_UP_OUTSIDE, pointerAt(canvas, start.x, start.y));
            } else if (interruption === "canvas-out") {
                input.emit(Phaser.Input.Events.GAME_OUT);
            } else if (interruption === "blur") {
                window.dispatchEvent(new Event("blur"));
            } else if (interruption === "escape") {
                tool.handleKeyDownEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            } else if (interruption === "clear") {
                tool.clear();
            } else {
                await selectPrefab(furniturePrefab);
            }

            const separatedEnd = tileCenter(7, 3);
            input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, separatedEnd.x, separatedEnd.y), []);
            await settleCommands();

            expect(entityPositions(wamFile)).toEqual([[64, 96]]);
        },
    );

    it("does not start painting from a button held in the HTML sidebar", async () => {
        await selectPrefab(floorPrefab);
        const sidebar = document.createElement("button");
        const position = tileCenter(2, 3);
        const sidebarPointer = pointerAt(canvas, position.x, position.y, 0, sidebar);
        expect(sidebarPointer.downElement).toBe(sidebar);
        input.emit(Phaser.Input.Events.POINTER_DOWN, sidebarPointer, []);
        const end = tileCenter(5, 3);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([]);
    });

    it("stops when a move leaves the canvas, even before the game-out event", async () => {
        await selectPrefab(floorPrefab);
        const start = tileCenter(2, 3);
        const end = tileCenter(7, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y, 0, canvas, 501), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([[64, 96]]);
    });

    it("keeps the stroke tied to the pointer that started it", async () => {
        await selectPrefab(floorPrefab);
        const start = tileCenter(2, 3);
        const end = tileCenter(3, 3);
        const otherPointer = pointerAt(canvas, tileCenter(7, 3).x, start.y);
        Object.defineProperty(otherPointer, "id", { value: 2 });

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, otherPointer, []);
        input.emit(Phaser.Input.Events.POINTER_UP, otherPointer);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([
            [64, 96],
            [96, 96],
        ]);
    });

    it("ignores right-click, middle-click, and movement without a held button", async () => {
        await selectPrefab(floorPrefab);
        const position = tileCenter(2, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, position.x, position.y, 2), []);
        await selectPrefab(floorPrefab);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, position.x, position.y, 1), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, tileCenter(5, 3).x, position.y, 1), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, position.x, position.y, -1), []);
        await settleCommands();

        expect(entityPositions(wamFile)).toEqual([]);
    });

    it("checks bounds and placement permission for every interpolated tile", async () => {
        await selectPrefab(floorPrefab);
        const checkedPositions: { x: number; y: number }[] = [];
        gameMapFrontWrapper.canEntityBePlacedOnMap.mockImplementation((position) => {
            checkedPositions.push(position);
            return position.x <= 160 && position.x !== 128 && position.y >= 0;
        });
        const start = tileCenter(2, 3);
        const end = tileCenter(7, 3);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
        await settleCommands();

        expect(checkedPositions.slice(0, 6)).toEqual([
            { x: 64, y: 96 },
            { x: 96, y: 96 },
            { x: 128, y: 96 },
            { x: 160, y: 96 },
            { x: 192, y: 96 },
            { x: 224, y: 96 },
        ]);
        expect(entityPositions(wamFile)).toEqual([
            [64, 96],
            [96, 96],
            [160, 96],
        ]);
    });

    it.each([furniturePrefab, wallPrefab])(
        "keeps placement of %s to one click instead of painting on pointer movement",
        async (prefab) => {
            await selectPrefab(prefab);
            const start = tileCenter(2, 3);
            input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, start.x, start.y), []);
            const end = tileCenter(7, 3);
            input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, end.x, end.y), []);
            await settleCommands();

            expect(entityPositions(wamFile)).toEqual([[64, 96]]);
        },
    );
});
