import { EntityPrefab, WamFile } from "@workadventure/map-editor";
import type { GameMap, WAMEntityData } from "@workadventure/map-editor";
import { asError } from "catch-unknown";
import { mock } from "vitest-mock-extended";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomConnection } from "../../../../src/front/Connection/RoomConnection";
import { AreaPreview } from "../../../../src/front/Phaser/Components/MapEditor/AreaPreview";
import { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import { EntitiesManagerEvent } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { DeleteEntityFrontCommand } from "../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/DeleteEntityFrontCommand";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import type { AreaEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/AreaEditorTool";
import { TrashEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/TrashEditorTool";
import {
    mapEditorEntityModeStore,
    mapEditorModeStore,
    mapEditorSelectedAreaPreviewStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
    mapEditorVisibilityStore,
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

const wallPrefab = EntityPrefab.parse({
    ...floorPrefab,
    id: "Infogène Murs fins:mur-vertical:Default:Down",
    name: "mur-vertical",
    tags: ["Murs"],
    imagePath: "thin-wall-vertical.png",
    collisionGrid: [[0, 0]],
    collectionName: "Infogène Murs fins",
});

const customWallPrefab = EntityPrefab.parse({
    ...wallPrefab,
    id: "Community Objects:brick-wall",
    name: "brick-wall",
    imagePath: "community-brick-wall.png",
    collectionName: "Community Objects",
});

const furniturePrefab = EntityPrefab.parse({
    ...floorPrefab,
    id: "chair",
    name: "Chair",
    tags: ["Furniture"],
    imagePath: "chair.png",
    collectionName: "Furniture",
});

function pointerAt(
    canvas: HTMLCanvasElement,
    worldX: number,
    worldY: number,
    button = 0,
    downElement: Element = canvas,
    clientX = 10,
    pointerId = 1,
): Phaser.Input.Pointer {
    const pointer = mock<Phaser.Input.Pointer>({ id: pointerId, x: 10, y: 10, worldX, worldY, button });
    Object.defineProperty(pointer, "downElement", { value: downElement });
    Object.defineProperty(pointer, "event", {
        value: new MouseEvent("mousemove", { button, clientX, clientY: 10 }),
    });
    pointer.leftButtonDown.mockReturnValue(button === 0);
    return pointer;
}

async function settleCommands(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("TrashEditorTool continuous erasing", () => {
    let canvas: HTMLCanvasElement;
    let wamFile: WamFile;
    let entities: Map<string, Entity>;
    let entitiesManager: ReturnType<typeof mock<EntitiesManager>>;
    let modeManager: ReturnType<typeof mock<MapEditorModeManager>>;
    let roomConnection: ReturnType<typeof mock<RoomConnection>>;
    let input: ReturnType<typeof mock<Phaser.Input.InputPlugin>>;
    let inputEvents: Phaser.Events.EventEmitter;
    let tool: TrashEditorTool;
    let commands: DeleteEntityFrontCommand[];

    function createEntity(id: string, x: number, y: number, prefab = floorPrefab, canEdit = true): Entity {
        const width = prefab === wallPrefab || prefab === customWallPrefab ? 64 : 32;
        const entity = mock<Entity>({ entityId: id, x, y });
        Object.defineProperty(entity, "getPrefab", { configurable: true, value: vi.fn(() => prefab) });
        Object.defineProperty(entity, "getCollisionRectangle", {
            configurable: true,
            value: vi.fn(() => ({ x, y, width, height: 32 })),
        });
        Object.defineProperty(entity, "delete", {
            configurable: true,
            value: vi.fn(() => entitiesManager.emit(EntitiesManagerEvent.DeleteEntity, entity)),
        });
        Object.setPrototypeOf(entity, Entity.prototype);
        // Entity.canEdit is a prototype getter; keep the fixture's configured permission as an own value.
        Object.defineProperty(entity, "canEdit", { configurable: true, value: canEdit });
        Object.defineProperty(entity, "width", { configurable: true, value: width });
        Object.defineProperty(entity, "height", { configurable: true, value: 32 });
        entities.set(id, entity);
        return entity;
    }

    function addEntity(id: string, x: number, y: number, prefab = floorPrefab, canEdit = true): Entity {
        const entity = createEntity(id, x, y, prefab, canEdit);
        wamFile.getGameMapEntities().addEntity(id, {
            x,
            y,
            prefabRef: prefab,
            name: id,
            properties: [],
        });
        return entity;
    }

    function mockAreaPreview() {
        const area = mock<AreaPreview>();
        const deleteArea = vi.fn();
        Object.defineProperty(area, "delete", { configurable: true, value: deleteArea });
        Object.setPrototypeOf(area, AreaPreview.prototype);
        return { area, deleteArea };
    }

    function remainingIds(): string[] {
        const ids = Object.keys(wamFile.getGameMapEntities().getEntities()).sort();
        expect([...entities.keys()].sort()).toEqual(ids);
        return ids;
    }

    function stroke(startX: number, startY: number, endX: number, endY: number): void {
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, startX, startY), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, endX, endY), []);
    }

    beforeEach(() => {
        canvas = document.createElement("canvas");
        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 500));
        wamFile = new WamFile({ version: "1", mapUrl: "test.tmj", entities: {}, areas: [], entityCollections: [] });
        entities = new Map();
        entitiesManager = mock<EntitiesManager>();
        entitiesManager.getEntities.mockReturnValue(entities);
        entitiesManager.deleteEntity.mockImplementation((id) => entities.delete(id));
        const entityEvents = new Phaser.Events.EventEmitter();
        entitiesManager.on.mockImplementation((event, listener, context) => {
            entityEvents.on(event, listener, context);
            return entitiesManager;
        });
        entitiesManager.off.mockImplementation((event, listener, context, once) => {
            entityEvents.off(event, listener, context, once);
            return entitiesManager;
        });
        entitiesManager.emit.mockImplementation((event, ...args) => entityEvents.emit(event, ...args));
        entitiesManager.addEntity.mockImplementation((id, data: WAMEntityData) => {
            const prefab = [floorPrefab, wallPrefab, customWallPrefab, furniturePrefab].find(
                (candidate) => candidate.id === data.prefabRef.id,
            );
            if (!prefab) {
                throw new Error("The fixture requires one of its declared prefabs");
            }
            const entity = createEntity(id, data.x, data.y, prefab);
            return Promise.resolve(entity);
        });

        const wrapper = mock<GameMapFrontWrapper>();
        wrapper.getEntitiesManager.mockReturnValue(entitiesManager);
        wrapper.getAreas.mockReturnValue(new Map());
        const scene = mock<GameScene>();
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
        input.emit.mockImplementation((event, ...args) => inputEvents.emit(event, ...args));
        Object.defineProperty(input, "keyboard", {
            value: { addKey: vi.fn(() => mock<Phaser.Input.Keyboard.Key>()) },
        });
        scene.input = input;
        scene.getGameMapFrontWrapper.mockReturnValue(wrapper);
        const gameMap = mock<GameMap>();
        gameMap.getWamFile.mockReturnValue(wamFile);
        scene.getGameMap.mockReturnValue(gameMap);
        scene.markDirty.mockImplementation(() => undefined);
        roomConnection = mock<RoomConnection>();
        commands = [];
        modeManager = mock<MapEditorModeManager>();
        modeManager.getScene.mockReturnValue(scene);
        modeManager.executeCommand.mockImplementation(async (command) => {
            if (!(command instanceof DeleteEntityFrontCommand)) {
                throw new Error("Erasing should use native entity deletion commands");
            }
            await command.execute();
            command.emitEvent(roomConnection);
            commands.push(command);
        });
        mapEditorModeStore.set(true);
        mapEditorEntityModeStore.set("ADD");
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorSelectedEntityStore.set(undefined);
        tool = new TrashEditorTool(modeManager, mock<AreaEditorTool>());
        tool.activate();
    });

    afterEach(() => {
        tool.clear();
        mapEditorModeStore.set(false);
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorSelectedAreaPreviewStore.set(undefined);
        mapEditorVisibilityStore.set(false);
        vi.restoreAllMocks();
    });

    it("erases every floor and wall crossed between distant pointer events", async () => {
        addEntity("start", 32, 64);
        addEntity("middle", 96, 64);
        addEntity("wall", 160, 64, wallPrefab);
        addEntity("end", 224, 64);
        addEntity("off-path", 96, 128);

        stroke(48, 80, 240, 80);
        await settleCommands();

        expect(remainingIds()).toEqual(["off-path"]);
        expect(roomConnection.emitMapEditorDeleteEntity.mock.calls.map(([, id]) => id).sort()).toEqual([
            "end",
            "middle",
            "start",
            "wall",
        ]);
    });

    it("starts over empty space and erases a tagged tile when the stroke reaches it", async () => {
        addEntity("later", 96, 64);

        stroke(0, 80, 128, 80);
        await settleCommands();

        expect(remainingIds()).toEqual([]);
        expect(roomConnection.emitMapEditorDeleteEntity.mock.calls.map(([, id]) => id)).toEqual(["later"]);
    });

    it("erases tagged tiles from custom collections regardless of their collection name", async () => {
        addEntity("community-wall", 96, 64, customWallPrefab);
        addEntity("chair", 96, 64, furniturePrefab);

        stroke(0, 80, 128, 80);
        await settleCommands();

        expect(remainingIds()).toEqual(["chair"]);
        expect(roomConnection.emitMapEditorDeleteEntity.mock.calls.map(([, id]) => id)).toEqual(["community-wall"]);
    });

    it("does not treat a TMJ tile layer as an editable WAM entity", async () => {
        const backgroundLayer = mock<Phaser.Tilemaps.TilemapLayer>();
        const removeTileAt = vi.fn();
        Object.defineProperty(backgroundLayer, "removeTileAt", { configurable: true, value: removeTileAt });
        Object.setPrototypeOf(backgroundLayer, Phaser.Tilemaps.TilemapLayer.prototype);

        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 48, 80), [backgroundLayer]);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, 144, 80), [backgroundLayer]);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 144, 80), [backgroundLayer]);
        await settleCommands();

        expect(remainingIds()).toEqual([]);
        expect(removeTileAt.mock.calls).toHaveLength(0);
    });

    it.each([
        {
            name: "vertical",
            positions: [
                [64, 32],
                [64, 96],
                [64, 160],
            ],
            end: [80, 176],
        },
        {
            name: "diagonal",
            positions: [
                [64, 32],
                [128, 96],
                [192, 160],
            ],
            end: [208, 176],
        },
    ])("erases all tiles on a $name path", async ({ positions, end }) => {
        positions.forEach(([x, y], index) => addEntity(`tile-${index}`, x, y));
        stroke(80, 48, end[0], end[1]);
        await settleCommands();
        expect(remainingIds()).toEqual([]);
    });

    it("removes overlapping tiles while leaving furniture and forbidden entities", async () => {
        addEntity("floor-a", 32, 64);
        addEntity("floor-b", 32, 64);
        const furniture = addEntity("chair", 32, 64, furniturePrefab);
        addEntity("forbidden", 96, 64, wallPrefab, false);
        const { area, deleteArea } = mockAreaPreview();

        stroke(48, 80, 144, 80);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 144, 80), [furniture, area]);
        await settleCommands();

        expect(remainingIds()).toEqual(["chair", "forbidden"]);
        expect(deleteArea.mock.calls).toHaveLength(0);
    });

    it.each([floorPrefab, wallPrefab, furniturePrefab])("preserves single-click deletion for $name", async (prefab) => {
        const top = addEntity("top", 32, 64, prefab);
        addEntity("underneath", 32, 64);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 48, 80), [top]);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, 48, 80), [top]);
        expect(remainingIds()).toEqual(["top", "underneath"]);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 48, 80), [top]);
        await settleCommands();
        expect(remainingIds()).toEqual(["underneath"]);
    });

    it("preserves single-click deletion of an area", () => {
        const { area, deleteArea } = mockAreaPreview();
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 48, 80), [area]);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 48, 80), [area]);
        expect(deleteArea.mock.calls).toHaveLength(1);
    });

    it("does not remove a forbidden entity on a single click", async () => {
        const entity = addEntity("forbidden", 32, 64, floorPrefab, false);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 48, 80), [entity]);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 48, 80), [entity]);
        await settleCommands();
        expect(remainingIds()).toEqual(["forbidden"]);
    });

    it.each(["up", "up-outside", "game-out", "blur", "escape", "clear", "destroy", "outside", "released"])(
        "stops erasing after %s until another canvas click",
        async (interruption) => {
            addEntity("first", 32, 64);
            const next = addEntity("next", 224, 64);
            stroke(48, 80, 52, 80);
            await settleCommands();
            if (interruption === "up") {
                input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 52, 80), []);
            } else if (interruption === "up-outside") {
                input.emit(Phaser.Input.Events.POINTER_UP_OUTSIDE, pointerAt(canvas, 52, 80), []);
            } else if (interruption === "game-out") {
                input.emit(Phaser.Input.Events.GAME_OUT);
            } else if (interruption === "blur") {
                window.dispatchEvent(new Event("blur"));
            } else if (interruption === "escape") {
                tool.handleKeyDownEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            } else if (interruption === "clear" || interruption === "destroy") {
                tool[interruption]();
                tool.activate();
            } else {
                input.emit(
                    Phaser.Input.Events.POINTER_MOVE,
                    pointerAt(canvas, 240, 80, interruption === "released" ? -1 : 0, canvas, 501),
                    [],
                );
            }
            input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, 240, 80), [next]);
            input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 240, 80), [next]);
            await settleCommands();
            expect(remainingIds()).toEqual(["next"]);
        },
    );

    it("ignores sidebar gestures, other buttons, and movement without a canvas press", async () => {
        const entity = addEntity("floor", 32, 64);
        for (const button of [1, 2]) {
            input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 48, 80, button), []);
            input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, 52, 80, button), []);
            input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 52, 80, button), [entity]);
        }
        const sidebar = document.createElement("button");
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 48, 80, 0, sidebar), []);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, 52, 80), []);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 52, 80), [entity]);
        await settleCommands();
        expect(remainingIds()).toEqual(["floor"]);
    });

    it("keeps the stroke owned by its initial pointer", async () => {
        addEntity("floor", 32, 64);
        const far = addEntity("far", 224, 64);
        input.emit(Phaser.Input.Events.POINTER_DOWN, pointerAt(canvas, 48, 80), []);
        const other = pointerAt(canvas, 240, 80, 0, canvas, 10, 2);
        input.emit(Phaser.Input.Events.POINTER_MOVE, other, [far]);
        input.emit(Phaser.Input.Events.POINTER_UP, other, [far]);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, 52, 80), []);
        await settleCommands();
        expect(remainingIds()).toEqual(["far"]);
    });

    it("removes pointer listeners on clear and binds one listener set on reactivation", () => {
        expect(inputEvents.listenerCount(Phaser.Input.Events.POINTER_DOWN)).toBe(1);
        expect(inputEvents.listenerCount(Phaser.Input.Events.POINTER_MOVE)).toBe(1);

        tool.clear();

        expect(inputEvents.listenerCount(Phaser.Input.Events.POINTER_DOWN)).toBe(0);
        expect(inputEvents.listenerCount(Phaser.Input.Events.POINTER_MOVE)).toBe(0);

        tool.activate();

        expect(inputEvents.listenerCount(Phaser.Input.Events.POINTER_DOWN)).toBe(1);
        expect(inputEvents.listenerCount(Phaser.Input.Events.POINTER_MOVE)).toBe(1);
    });

    it("reserves each entity until its native deletion command finishes", async () => {
        addEntity("floor", 32, 64);
        const queuedCommands: Array<() => Promise<void>> = [];
        modeManager.executeCommand.mockImplementation(
            (command) =>
                new Promise<void>((resolve, reject) => {
                    queuedCommands.push(async () => {
                        try {
                            await command.execute();
                            resolve();
                        } catch (error: unknown) {
                            reject(asError(error));
                        }
                    });
                }),
        );
        stroke(48, 80, 52, 80);
        input.emit(Phaser.Input.Events.POINTER_MOVE, pointerAt(canvas, 48, 80), []);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 48, 80), []);
        stroke(48, 80, 52, 80);
        expect(queuedCommands).toHaveLength(1);
        await Promise.all(queuedCommands.map((execute) => execute()));
        await settleCommands();
        expect(remainingIds()).toEqual([]);
    });

    it("retries an entity on a new stroke after its native deletion command fails", async () => {
        addEntity("floor", 32, 64);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        modeManager.executeCommand
            .mockRejectedValueOnce(new Error("native delete failed"))
            .mockImplementationOnce(async (command) => {
                if (!(command instanceof DeleteEntityFrontCommand)) {
                    throw new Error("Erasing should use native entity deletion commands");
                }
                await command.execute();
                command.emitEvent(roomConnection);
                commands.push(command);
            });

        stroke(48, 80, 52, 80);
        input.emit(Phaser.Input.Events.POINTER_UP, pointerAt(canvas, 52, 80), []);
        await settleCommands();
        expect(remainingIds()).toEqual(["floor"]);

        stroke(48, 80, 52, 80);
        await settleCommands();

        expect(remainingIds()).toEqual([]);
        expect(modeManager.executeCommand.mock.calls).toHaveLength(2);
        expect(roomConnection.emitMapEditorDeleteEntity.mock.calls.map(([, id]) => id)).toEqual(["floor"]);
    });

    it("restores the same entity and dimensions on undo, and can erase it again", async () => {
        addEntity("wall-instance", 32, 64, wallPrefab);
        const data = structuredClone(wamFile.getGameMapEntities().getEntity("wall-instance"));
        const command = new DeleteEntityFrontCommand(wamFile, "wall-instance", undefined, entitiesManager);
        await command.execute();
        expect(remainingIds()).toEqual([]);

        const undo = command.getUndoCommand();
        await undo.execute();
        undo.emitEvent(roomConnection);
        expect(remainingIds()).toEqual(["wall-instance"]);
        expect(wamFile.getGameMapEntities().getEntity("wall-instance")).toEqual(data);
        expect(roomConnection.emitMapEditorCreateEntity.mock.calls).toEqual([
            [undo.commandId, "wall-instance", data, { width: 64, height: 32 }],
        ]);
        stroke(48, 80, 52, 80);
        await settleCommands();
        expect(remainingIds()).toEqual([]);
        const last = commands.at(-1);
        if (!last) {
            throw new Error("The restored wall should have been erased with a native command");
        }
        await last.getUndoCommand().execute();
        expect(remainingIds()).toEqual(["wall-instance"]);
    });
});
