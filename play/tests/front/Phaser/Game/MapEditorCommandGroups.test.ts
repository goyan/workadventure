import { afterEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { mock } from "vitest-mock-extended";
import { Command, WamFile } from "@workadventure/map-editor";
import type { WAMEntityData } from "@workadventure/map-editor";
import { Deferred } from "@workadventure/shared-utils";
import type { EditMapCommandMessage } from "@workadventure/messages";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { RoomConnection } from "../../../../src/front/Connection/RoomConnection";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { FrontCommandInterface } from "../../../../src/front/Phaser/Game/MapEditor/Commands/FrontCommandInterface";
import type { UserInputManager } from "../../../../src/front/Phaser/UserInput/UserInputManager";
import { EditorToolName, MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import { mapEditorModeStore } from "../../../../src/front/Stores/MapEditorStore";
import { mapEditorActivated } from "../../../../src/front/Stores/MenuStore";
import { CreateEntityFrontCommand } from "../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/CreateEntityFrontCommand";
import { DeleteEntityFrontCommand } from "../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/DeleteEntityFrontCommand";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type * as AreaEditorToolModule from "../../../../src/front/Phaser/Game/MapEditor/Tools/AreaEditorTool";
import type { AreaEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/AreaEditorTool";

const editorToolMocks = vi.hoisted(() => {
    const incomingMessages: EditMapCommandMessage[] = [];
    const keyDownEvents: unknown[] = [];
    function createTool() {
        return {
            update: vi.fn(),
            clear: vi.fn(),
            activate: vi.fn(),
            destroy: vi.fn(),
            refreshSelection: vi.fn(),
            subscribeToGameMapFrontWrapperEvents: vi.fn(),
            handleKeyDownEvent: vi.fn((event: unknown) => {
                keyDownEvents.push(event);
            }),
            handleIncomingCommandMessage: vi.fn((message: EditMapCommandMessage) => {
                incomingMessages.push(message);
                return Promise.resolve();
            }),
        };
    }

    return {
        incomingMessages,
        keyDownEvents,
        AreaEditorTool: vi.fn(createTool),
        CloseTool: vi.fn().mockImplementation(createTool),
        EntityEditorTool: vi.fn().mockImplementation(createTool),
        ExplorerTool: vi.fn().mockImplementation(createTool),
        FloorEditorTool: vi.fn().mockImplementation(createTool),
        SelectionEditorTool: vi.fn().mockImplementation(createTool),
        TrashEditorTool: vi.fn().mockImplementation(createTool),
        WAMSettingsEditorTool: vi.fn().mockImplementation(createTool),
    };
});

vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/AreaEditorTool", () => ({
    AreaEditorTool: editorToolMocks.AreaEditorTool,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/CloseTool", () => ({
    CloseTool: editorToolMocks.CloseTool,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool", () => ({
    EntityEditorTool: editorToolMocks.EntityEditorTool,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/ExplorerTool", () => ({
    ExplorerTool: editorToolMocks.ExplorerTool,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool", () => ({
    FloorEditorTool: editorToolMocks.FloorEditorTool,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/SelectionEditorTool", () => ({
    SelectionEditorTool: editorToolMocks.SelectionEditorTool,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/TrashEditorTool", () => ({
    TrashEditorTool: editorToolMocks.TrashEditorTool,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Tools/WAMSettingsEditorTool", () => ({
    WAMSettingsEditorTool: editorToolMocks.WAMSettingsEditorTool,
}));

interface CommandTestState {
    value: number;
    emittedCommandIds: string[];
}

class StateCommand extends Command implements FrontCommandInterface {
    constructor(
        private readonly state: CommandTestState,
        private readonly change: number,
        commandId?: string,
        private readonly beforeExecute?: () => Promise<void>,
    ) {
        super(commandId);
    }

    public async execute(): Promise<void> {
        await this.beforeExecute?.();
        this.state.value += this.change;
    }

    public getUndoCommand(): StateCommand {
        return new StateCommand(this.state, -this.change);
    }

    public emitEvent(roomConnection: RoomConnection): void {
        this.state.emittedCommandIds.push(this.commandId);
        roomConnection.emitMapEditorDeleteEntity(this.commandId, this.commandId);
    }
}

function createCommandMessage(id: string): EditMapCommandMessage {
    return { id, editMapMessage: undefined };
}

function createErrorCommandMessage(id: string): EditMapCommandMessage {
    return {
        id,
        editMapMessage: {
            message: {
                $case: "errorCommandMessage",
                errorCommandMessage: { reason: "rejected" },
            },
        },
    };
}

function createManagerFixture(): {
    manager: MapEditorModeManager;
    connection: ReturnType<typeof mock<RoomConnection>>;
    commandStream: Subject<EditMapCommandMessage>;
    scene: ReturnType<typeof mock<GameScene>>;
    wamFile: WamFile;
} {
    const scene = mock<GameScene>();
    const userInputManager = mock<UserInputManager>();
    scene.userInputManager = userInputManager;
    const sceneInput = mock<Phaser.Input.InputPlugin>();
    sceneInput.keyboard = mock<Phaser.Input.Keyboard.KeyboardPlugin>();
    scene.input = sceneInput;
    const gameMapFrontWrapper = mock<GameMapFrontWrapper>();
    const initializedPromise = new Deferred<void>();
    initializedPromise.resolve();
    Object.defineProperty(gameMapFrontWrapper, "initializedPromise", { value: initializedPromise });
    gameMapFrontWrapper.getEntitiesManager.mockReturnValue(mock<EntitiesManager>());
    scene.getGameMapFrontWrapper.mockReturnValue(gameMapFrontWrapper);
    const wamFile = new WamFile({ version: "1", mapUrl: "test.tmj", areas: [], entities: {}, entityCollections: [] });
    const gameMap = mock<ReturnType<GameScene["getGameMap"]>>();
    gameMap.getWamFile.mockReturnValue(wamFile);
    scene.getGameMap.mockReturnValue(gameMap);

    const connection = mock<RoomConnection>();
    const commandStream = new Subject<EditMapCommandMessage>();
    Object.defineProperty(connection, "editMapCommandMessageStream", { value: commandStream.asObservable() });
    scene.connection = connection;

    const manager = new MapEditorModeManager(scene);
    manager.subscribeToRoomConnection(connection);
    return { manager, connection, commandStream, scene, wamFile };
}

describe("MapEditorModeManager command groups", () => {
    let manager: MapEditorModeManager | undefined;

    afterEach(() => {
        manager?.destroy();
        manager = undefined;
        mapEditorModeStore.set(false);
        mapEditorActivated.set(false);
        editorToolMocks.incomingMessages.length = 0;
        editorToolMocks.keyDownEvents.length = 0;
        vi.clearAllMocks();
    });

    it("tracks a preparatory upload without adding it to the resize undo history", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        await manager.executeCommand(new StateCommand(state, 1, "before"));
        await manager.executeCommands([new StateCommand(state, 2, "upload")], false);
        await manager.executeCommands([new StateCommand(state, 3, "resize")]);
        await manager.undoCommand();
        expect(state.value).toBe(3);
        await manager.undoCommand();
        expect(state.value).toBe(2);
        await manager.redoCommand();
        await manager.redoCommand();
        expect(state.value).toBe(6);
    });

    it("reads the latest state in a command factory after earlier queued operations finish", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const ready = new Deferred<void>();
        const before = manager.executeCommand(new StateCommand(state, 1, "before", () => ready.promise));
        const next = manager.executeCommands(() => [new StateCommand(state, state.value, "latest")]);
        ready.resolve();
        await Promise.all([before, next]);
        expect(state.value).toBe(2);
        await manager.undoCommand();
        expect(state.value).toBe(1);
    });

    it("preserves the instance data and other copies when resizing, undoing and redoing", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const data: WAMEntityData = {
            x: 32,
            y: 64,
            prefabRef: { collectionName: "custom entities", id: "original-image" },
            name: "Entrance",
            properties: [
                { id: "description", type: "entityDescriptionProperties", description: "Logo", searchable: true },
            ],
        };
        fixture.wamFile.getGameMapEntities().addEntity("image", structuredClone(data));
        fixture.wamFile.getGameMapEntities().addEntity("other-copy", structuredClone(data));
        const entities = mock<EntitiesManager>();
        const rendered = new Map<string, Entity>([["image", mock<Entity>({ width: 64, height: 32 })]]);
        entities.getEntities.mockReturnValue(rendered);
        entities.addEntity.mockImplementation((id, entityData) => {
            const entity = mock<Entity>({
                width: entityData.prefabRef.id === "resized-image" ? 128 : 64,
                height: entityData.prefabRef.id === "resized-image" ? 64 : 32,
            });
            rendered.set(id, entity);
            return Promise.resolve(entity);
        });
        entities.deleteEntity.mockImplementation((id) => rendered.delete(id));
        const resized = { ...data, prefabRef: { collectionName: "custom entities", id: "resized-image" } };
        await manager.executeCommands([
            new DeleteEntityFrontCommand(fixture.wamFile, "image", undefined, entities),
            new CreateEntityFrontCommand(fixture.wamFile, "image", resized, undefined, entities, {
                width: 128,
                height: 64,
            }),
        ]);
        expect(fixture.wamFile.getGameMapEntities().getEntity("image")).toEqual(resized);
        await manager.undoCommand();
        expect(fixture.wamFile.getGameMapEntities().getEntity("image")).toEqual(data);
        await manager.redoCommand();
        expect(fixture.wamFile.getGameMapEntities().getEntity("image")).toEqual(resized);
        expect(fixture.wamFile.getGameMapEntities().getEntity("other-copy")).toEqual(data);
    });

    it("undoes and redoes a multi-command group as one step between individual commands", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const before = new StateCommand(state, 1, "before");
        const first = new StateCommand(state, 2, "group-first");
        const second = new StateCommand(state, 3, "group-second");
        const after = new StateCommand(state, 4, "after");

        await manager.executeCommand(before);
        await manager.executeCommands([first, second]);
        await manager.executeCommand(after);

        expect(state.value).toBe(10);
        expect(state.emittedCommandIds).toEqual(["before", "group-first", "group-second", "after"]);

        await manager.undoCommand();
        expect(state.value).toBe(6);
        await manager.undoCommand();
        expect(state.value).toBe(1);
        await manager.undoCommand();
        expect(state.value).toBe(0);

        await manager.redoCommand();
        expect(state.value).toBe(1);
        await manager.redoCommand();
        expect(state.value).toBe(6);
        await manager.redoCommand();
        expect(state.value).toBe(10);
        expect(state.emittedCommandIds.slice(-6)).toEqual([
            expect.any(String),
            expect.any(String),
            "before",
            "group-first",
            "group-second",
            "after",
        ]);
    });

    it("discards a partially acknowledged group on remote interleaving without replaying its reverted leaf", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const first = new StateCommand(state, 1, "acknowledged");
        const second = new StateCommand(state, 2, "still-pending");

        await manager.executeCommands([first, second]);
        expect(state.emittedCommandIds).toEqual(["acknowledged", "still-pending"]);

        fixture.commandStream.next(createCommandMessage(first.commandId));
        fixture.commandStream.next({
            id: "remote-command",
            editMapMessage: {
                message: {
                    $case: "deleteEntityMessage",
                    deleteEntityMessage: { id: "remote-entity" },
                },
            },
        });
        await vi.waitFor(() => expect(editorToolMocks.incomingMessages.length).toBeGreaterThan(0));

        expect(state.value).toBe(1);
        await manager.redoCommand();
        expect(state.value).toBe(1);
        await manager.undoCommand();
        expect(state.value).toBe(0);
    });

    it("keeps acknowledged history when an undo is only partially acknowledged", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const first = new StateCommand(state, 1, "first-leaf");
        const second = new StateCommand(state, 2, "second-leaf");

        await manager.executeCommands([first, second]);
        fixture.commandStream.next(createCommandMessage(first.commandId));
        fixture.commandStream.next(createCommandMessage(second.commandId));
        await manager.undoCommand();
        expect(state.value).toBe(0);

        const undoSecondCommandId = state.emittedCommandIds[2];
        fixture.commandStream.next(createCommandMessage(undoSecondCommandId));
        fixture.commandStream.next(createCommandMessage("remote-interleaving"));
        await vi.waitFor(() => expect(editorToolMocks.incomingMessages.length).toBeGreaterThan(0));

        expect(state.value).toBe(1);
        await manager.undoCommand();
        expect(state.value).toBe(0);
        await manager.redoCommand();
        expect(state.value).toBe(1);
        await manager.redoCommand();
        expect(state.value).toBe(3);
    });

    it("matches pending history by leaf occurrence when command IDs repeat", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const first = new StateCommand(state, 1, "duplicate-id");
        const second = new StateCommand(state, 2, "duplicate-id");

        await manager.executeCommands([first, second]);
        fixture.commandStream.next(createCommandMessage(first.commandId));
        fixture.commandStream.next(createCommandMessage("remote-interleaving"));
        await vi.waitFor(() => expect(editorToolMocks.incomingMessages.length).toBeGreaterThan(0));

        expect(state.value).toBe(1);
        await manager.undoCommand();
        expect(state.value).toBe(0);
    });

    it("does not deadlock when a remote tool handler executes a local command", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        let remoteHandlerStarted = false;
        const nativeModule = await vi.importActual<typeof AreaEditorToolModule>(
            "../../../../src/front/Phaser/Game/MapEditor/Tools/AreaEditorTool",
        );
        const areaTool = mock<AreaEditorTool>();
        Object.defineProperties(areaTool, {
            scene: { value: fixture.scene },
            mapEditorModeManager: { value: fixture.manager },
        });
        const constructedTool = editorToolMocks.AreaEditorTool.mock.results.at(-1);
        if (constructedTool?.type !== "return") {
            throw new Error("Area editor tool was not constructed");
        }
        constructedTool.value.handleIncomingCommandMessage.mockImplementation(async (message) => {
            remoteHandlerStarted = true;
            await nativeModule.AreaEditorTool.prototype.handleIncomingCommandMessage.call(areaTool, message);
        });

        fixture.commandStream.next({
            id: "remote-command",
            editMapMessage: {
                message: {
                    $case: "createAreaMessage",
                    createAreaMessage: {
                        id: "remote-area",
                        name: "Remote area",
                        x: 32,
                        y: 32,
                        width: 32,
                        height: 32,
                        properties: [],
                    },
                },
            },
        });
        await vi.waitFor(() => expect(remoteHandlerStarted).toBe(true));
        const laterGroup = fixture.manager.executeCommands([new StateCommand(state, 2, "later-group")]);
        await laterGroup;

        expect(state.value).toBe(2);
        expect(fixture.wamFile.getGameMapAreas().getAreas()?.get("remote-area")).toMatchObject({
            x: 32,
            y: 32,
            width: 32,
            height: 32,
        });
    });

    it("tracks compensation acknowledgements after a failed group undo", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const first = new StateCommand(state, 1, "first");
        const second = new StateCommand(state, 2, "second");
        await manager.executeCommands([first, second]);
        fixture.commandStream.next(createCommandMessage(first.commandId));
        fixture.commandStream.next(createCommandMessage(second.commandId));

        const failure = new Error("undo first failed");
        const failingUndo = vi
            .spyOn(first, "getUndoCommand")
            .mockReturnValue(new StateCommand(state, -1, undefined, () => Promise.reject(failure)));
        await manager.undoCommand();
        expect(state.value).toBe(3);
        fixture.commandStream.next(createCommandMessage(state.emittedCommandIds[2]));
        fixture.commandStream.next(createCommandMessage(state.emittedCommandIds[3]));
        failingUndo.mockRestore();

        await manager.undoCommand();
        expect(state.value).toBe(0);
        fixture.commandStream.next(createCommandMessage("remote-interleaving"));
        await vi.waitFor(() => expect(editorToolMocks.incomingMessages.length).toBeGreaterThan(0));
        expect(state.value).toBe(3);

        await manager.undoCommand();
        expect(state.value).toBe(0);
    });

    it("invalidates the whole group when the server rejects one leaf", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const first = new StateCommand(state, 1, "rejected-leaf");
        const second = new StateCommand(state, 2, "dependent-leaf");

        await manager.executeCommands([first, second]);
        fixture.commandStream.next(createErrorCommandMessage(first.commandId));
        await vi.waitFor(() => expect(state.value).toBe(0));

        await manager.redoCommand();
        expect(state.value).toBe(0);
    });

    it("compensates completed leaves after batch failure and accepts later commands", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const first = new StateCommand(state, 5, "completed-leaf");
        const failure = new Error("second command failed");
        const second = new StateCommand(state, 10, "failing-leaf", () => Promise.reject(failure));

        await expect(manager.executeCommands([first, second])).rejects.toBe(failure);
        expect(state.value).toBe(0);
        expect(state.emittedCommandIds).toHaveLength(2);
        expect(state.emittedCommandIds[0]).toBe("completed-leaf");
        expect(state.emittedCommandIds[1]).not.toBe("failing-leaf");

        const later = new StateCommand(state, 3, "later-command");
        await manager.executeCommand(later);
        expect(state.value).toBe(3);
        await manager.undoCommand();
        expect(state.value).toBe(0);
    });

    it("reverts a partially applied native entity creation when scene entity creation fails", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const entitiesById = new Map<string, WAMEntityData>();
        const wamEntities = mock<ReturnType<WamFile["getGameMapEntities"]>>();
        wamEntities.addEntity.mockImplementation((id, data) => {
            entitiesById.set(id, data);
            return true;
        });
        wamEntities.getEntity.mockImplementation((id) => entitiesById.get(id));
        wamEntities.deleteEntity.mockImplementation((id) => entitiesById.delete(id));
        const wamFile = mock<WamFile>();
        wamFile.getGameMapEntities.mockReturnValue(wamEntities);
        const entitiesManager = mock<EntitiesManager>();
        entitiesManager.addEntity.mockRejectedValue(new Error("entity prefab is no longer available"));
        entitiesManager.getEntities.mockReturnValue(new Map());
        entitiesManager.deleteEntity.mockReturnValue(false);
        const entityData: WAMEntityData = {
            x: 0,
            y: 0,
            prefabRef: { collectionName: "missing", id: "prefab" },
        };
        const command = new CreateEntityFrontCommand(
            wamFile,
            "partially-created",
            entityData,
            "create-command",
            entitiesManager,
            { width: 1, height: 1 },
        );

        await expect(fixture.manager.executeCommands([command])).rejects.toThrow(
            "entity prefab is no longer available",
        );
        expect(entitiesById.has("partially-created")).toBe(false);
        expect(fixture.connection.emitMapEditorCreateEntity.mock.calls).toHaveLength(0);
    });

    it("serializes local commands behind the complete command group", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const events: string[] = [];
        let releaseFirst: (() => void) | undefined;
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const first = new StateCommand(state, 1, "batch-first", async () => {
            events.push("first-start");
            await firstGate;
            events.push("first-end");
        });
        const second = new StateCommand(state, 2, "batch-second", () => {
            events.push("second");
            return Promise.resolve();
        });
        const later = new StateCommand(state, 4, "queued-after-group", () => {
            events.push("later");
            return Promise.resolve();
        });

        const groupExecution = manager.executeCommands([first, second]);
        const laterExecution = manager.executeCommand(later);
        await vi.waitFor(() => expect(events).toEqual(["first-start"]));
        releaseFirst?.();
        await Promise.all([groupExecution, laterExecution]);

        expect(events).toEqual(["first-start", "first-end", "second", "later"]);
        expect(state.value).toBe(7);
    });

    it("drops the redo branch after a new individual command", async () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        const state: CommandTestState = { value: 0, emittedCommandIds: [] };
        const first = new StateCommand(state, 1, "first");
        const second = new StateCommand(state, 2, "second");
        const branch = new StateCommand(state, 5, "new-branch");

        await manager.executeCommands([first, second]);
        await manager.undoCommand();
        expect(state.value).toBe(0);
        await manager.executeCommand(branch);
        expect(state.value).toBe(5);
        await manager.redoCommand();

        expect(state.value).toBe(5);
    });

    it("equips the selection tool with shortcut 7 only when the map editor is enabled", () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        mapEditorModeStore.set(true);
        manager.handleKeyDownEvent(new KeyboardEvent("keydown", { key: "7" }));
        expect(manager.currentlyActiveTool).not.toBe(manager.getSelectionEditorTool());
        mapEditorActivated.set(true);

        expect(manager.handleKeyDownEvent(new KeyboardEvent("keydown", { key: "7" }))).toBe(true);
        expect(manager.currentlyActiveTool).toBe(manager.getSelectionEditorTool());
    });

    it("keeps selection shortcuts inside the editor and prevents duplicate global shortcuts", () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        mapEditorActivated.set(true);
        mapEditorModeStore.set(true);
        manager.equipTool(EditorToolName.SelectionEditor);
        const event = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, cancelable: true });

        expect(manager.handleKeyDownEvent(event)).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(editorToolMocks.keyDownEvents).toEqual([event]);
    });

    it("ignores editor shortcuts when focus is in a text field", () => {
        const fixture = createManagerFixture();
        manager = fixture.manager;
        mapEditorActivated.set(true);
        mapEditorModeStore.set(true);
        const activeTool = manager.currentlyActiveTool;
        const event = new KeyboardEvent("keydown", { key: "7" });
        Object.defineProperty(event, "target", { value: document.createElement("input") });

        expect(manager.handleKeyDownEvent(event)).toBe(false);
        expect(manager.currentlyActiveTool).toBe(activeTool);
        expect(editorToolMocks.keyDownEvents).toHaveLength(0);
    });
});
