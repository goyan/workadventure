import * as Sentry from "@sentry/svelte";
import type { AreaData, Command } from "@workadventure/map-editor";
import { UpdateWAMSettingCommand } from "@workadventure/map-editor";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import type { EditMapCommandMessage } from "@workadventure/messages";
import pLimit from "p-limit";
import debug from "debug";
import { deepmergeInto } from "deepmerge-ts";
import type { RoomConnection } from "../../../Connection/RoomConnection";
import type { GameScene } from "../GameScene";
import {
    mapEditorAskToClaimPersonalAreaStore,
    mapEditorModeStore,
    mapEditorSnapEnabledStore,
    mapEditorSelectedToolStore,
} from "../../../Stores/MapEditorStore";
import { mapEditorActivated, mapEditorActivatedForThematics } from "../../../Stores/MenuStore";
import { localUserStore } from "../../../Connection/LocalUserStore";
import LL from "../../../../i18n/i18n-svelte";
import { gameManager } from "../GameManager";
import { isInsidePersonalAreaStore, personalAreaDataStore } from "../../../Stores/PersonalDeskStore";
import { analyticsClient } from "../../../Administration/AnalyticsClient";
import { warningMessageStore } from "../../../Stores/ErrorStore";
import { isTextEditingTarget } from "./isTextEditingTarget";
import { AreaEditorTool } from "./Tools/AreaEditorTool";
import type { MapEditorTool } from "./Tools/MapEditorTool";
import { FloorEditorTool } from "./Tools/FloorEditorTool";
import { EntityEditorTool } from "./Tools/EntityEditorTool";
import { WAMSettingsEditorTool } from "./Tools/WAMSettingsEditorTool";
import type { FrontCommandInterface } from "./Commands/FrontCommandInterface";
import type { FrontCommand } from "./Commands/FrontCommand";
import { TrashEditorTool } from "./Tools/TrashEditorTool";
import { ExplorerTool } from "./Tools/ExplorerTool";
import { CloseTool } from "./Tools/CloseTool";
import { CreateEntityFrontCommand } from "./Commands/Entity/CreateEntityFrontCommand";
import { UpdateAreaFrontCommand } from "./Commands/Area/UpdateAreaFrontCommand";
import { SelectionEditorTool } from "./Tools/SelectionEditorTool";

export enum EditorToolName {
    AreaEditor = "AreaEditor",
    FloorEditor = "FloorEditor",
    EntityEditor = "EntityEditor",
    WAMSettingsEditor = "WAMSettingsEditor",
    TrashEditor = "TrashEditor",
    SelectionEditor = "SelectionEditor",
    ExploreTheRoom = "ExploreTheRoom",
    CloseMapEditor = "CloseMapEditor",
}

const logger = debug("map-editor");

interface CommandHistoryGroup {
    commands: FrontCommand[];
    acknowledgedCommandIndexes: Set<number>;
    everAcknowledgedCommandIndexes: Set<number>;
}

interface PendingCommandHistoryGroup {
    group: CommandHistoryGroup;
    commandIndex: number;
    direction: "apply" | "undo";
}

interface ExecutedCommand {
    command: FrontCommand;
    emitted: boolean;
    history: PendingCommandHistoryGroup | undefined;
}

export class MapEditorModeManager {
    private scene: GameScene;

    /**
     * Is user currently in Editor Mode
     */
    private active: boolean;

    /**
     * Tools that we can work with inside Editor
     */
    private editorTools: Record<EditorToolName, MapEditorTool>;

    /**
     * What tool are we using right now
     */
    private activeTool?: EditorToolName;
    /**
     * Last tool used before closing map editor
     */
    private lastlyUsedTool?: EditorToolName;

    /**
     * We are making use of CommandPattern to implement an Undo-Redo mechanism
     */
    private localCommandsHistory: CommandHistoryGroup[];

    /**
     * Commands sent by us that are still to be acknowledged by the server
     */
    private pendingCommands: FrontCommand[];
    private pendingCommandHistoryGroups: Array<PendingCommandHistoryGroup | undefined>;
    /**
     * Which command was called most recently
     */
    private currentCommandIndex: number;

    private mapEditorModeUnsubscriber: Unsubscriber | undefined;

    private readonly selectionEditorTool: SelectionEditorTool;

    private isReverting: Promise<void> = Promise.resolve();

    private isHandlingIncomingCommand = false;

    constructor(
        scene: GameScene,
        private _isInsidePersonalAreaStore = isInsidePersonalAreaStore,
        private _personalAreaDataStore = personalAreaDataStore,
    ) {
        this.scene = scene;

        this.localCommandsHistory = [];
        this.pendingCommands = [];
        this.pendingCommandHistoryGroups = [];
        this.currentCommandIndex = -1;

        this.active = false;

        const areaEditorTool = new AreaEditorTool(this);
        this.selectionEditorTool = new SelectionEditorTool(this, areaEditorTool);

        this.editorTools = {
            [EditorToolName.AreaEditor]: areaEditorTool,
            [EditorToolName.EntityEditor]: new EntityEditorTool(this),
            [EditorToolName.FloorEditor]: new FloorEditorTool(this),
            [EditorToolName.WAMSettingsEditor]: new WAMSettingsEditorTool(this),
            [EditorToolName.TrashEditor]: new TrashEditorTool(this, areaEditorTool),
            [EditorToolName.SelectionEditor]: this.selectionEditorTool,
            [EditorToolName.ExploreTheRoom]: new ExplorerTool(this.scene),
            [EditorToolName.CloseMapEditor]: new CloseTool(),
        };
        this.activeTool = undefined;
        this.lastlyUsedTool = undefined;

        this.subscribeToStores();
        this.subscribeToGameMapFrontWrapperEvents();

        this.currentRunningCommand = this.scene.getGameMapFrontWrapper().initializedPromise.promise;
    }

    public update(time: number, dt: number): void {
        this.currentlyActiveTool?.update(time, dt);
    }

    private currentRunningCommand: Promise<void>;

    private enqueueCommand<T>(operation: () => Promise<T>): Promise<T> {
        const queuedOperation = this.currentRunningCommand
            .then(operation)
            .finally(() => this.selectionEditorTool.refreshSelection());
        this.currentRunningCommand = queuedOperation.then(
            () => undefined,
            () => undefined,
        );
        return queuedOperation;
    }

    private async applyCommands(
        commands: readonly FrontCommand[],
        trackPending: boolean,
        updateLastCommandId = true,
        historyGroup?: CommandHistoryGroup,
        historyDirection: PendingCommandHistoryGroup["direction"] = "apply",
        historyCommandIndexes: readonly number[] = commands.map((_command, index) => index),
    ): Promise<void> {
        const executedCommands: ExecutedCommand[] = [];
        try {
            await commands.reduce(async (previousCommand, command, index) => {
                await previousCommand;
                try {
                    await command.execute();
                } catch (error) {
                    if (command instanceof CreateEntityFrontCommand) {
                        try {
                            await command.getUndoCommand().execute();
                        } catch (compensationError) {
                            throw new AggregateError(
                                [error, compensationError],
                                "Create entity failed and its partial WAM change could not be reverted",
                                { cause: compensationError },
                            );
                        }
                    }
                    throw error;
                }
                const commandIndex = historyCommandIndexes[index];
                const history =
                    historyGroup !== undefined && commandIndex !== undefined
                        ? { group: historyGroup, commandIndex, direction: historyDirection }
                        : undefined;
                const executedCommand: ExecutedCommand = { command, emitted: false, history };
                executedCommands.push(executedCommand);
                this.emitMapEditorUpdate(command);
                executedCommand.emitted = true;
                if (trackPending) {
                    this.pendingCommands.push(command);
                    this.pendingCommandHistoryGroups.push(history);
                    logger("adding command to pendingList : ", command);
                }
                if (updateLastCommandId) {
                    this.scene.getGameMap().getWamFile()?.updateLastCommandIdProperty(command.commandId);
                }
            }, Promise.resolve());
        } catch (error) {
            const compensationErrors: unknown[] = [];
            await executedCommands
                .slice()
                .reverse()
                .reduce(async (previousCommand, executedCommand) => {
                    await previousCommand;
                    try {
                        const undoCommand = executedCommand.command.getUndoCommand();
                        await undoCommand.execute();
                        if (executedCommand.emitted) {
                            this.emitMapEditorUpdate(undoCommand);
                            if (trackPending) {
                                this.pendingCommands.push(undoCommand);
                                this.pendingCommandHistoryGroups.push(
                                    executedCommand.history
                                        ? {
                                              ...executedCommand.history,
                                              direction:
                                                  executedCommand.history.direction === "apply" ? "undo" : "apply",
                                          }
                                        : undefined,
                                );
                                logger("adding compensation command to pendingList : ", undoCommand);
                            }
                            if (updateLastCommandId) {
                                this.scene
                                    .getGameMap()
                                    .getWamFile()
                                    ?.updateLastCommandIdProperty(undoCommand.commandId);
                            }
                        }
                    } catch (compensationError) {
                        compensationErrors.push(compensationError);
                    }
                }, Promise.resolve());
            if (compensationErrors.length > 0) {
                throw new AggregateError(
                    [error, ...compensationErrors],
                    "Command execution failed and one or more compensating commands also failed",
                    { cause: error },
                );
            }
            throw error;
        }
    }

    private recordHistoryGroup(group: CommandHistoryGroup): void {
        // A new edit after undo discards the redo branch.
        if (this.currentCommandIndex !== this.localCommandsHistory.length - 1) {
            this.localCommandsHistory.splice(this.currentCommandIndex + 1);
        }
        this.localCommandsHistory.push(group);
        this.currentCommandIndex += 1;
    }

    private removeHistoryGroup(group: CommandHistoryGroup): void {
        const index = this.localCommandsHistory.indexOf(group);
        if (index !== -1) {
            this.localCommandsHistory.splice(index, 1);
            if (index <= this.currentCommandIndex) {
                this.currentCommandIndex -= 1;
            }
            if (this.currentCommandIndex >= this.localCommandsHistory.length) {
                this.currentCommandIndex = this.localCommandsHistory.length - 1;
            }
        }
        this.pendingCommandHistoryGroups = this.pendingCommandHistoryGroups.map((pendingGroup) =>
            pendingGroup?.group === group ? undefined : pendingGroup,
        );
    }

    private createHistoryGroup(commands: readonly FrontCommand[]): CommandHistoryGroup {
        return {
            commands: [...commands],
            acknowledgedCommandIndexes: new Set(),
            everAcknowledgedCommandIndexes: new Set(),
        };
    }

    private discardPendingHistoryGroup(group: CommandHistoryGroup): void {
        this.pendingCommandHistoryGroups = this.pendingCommandHistoryGroups.map((pendingGroup) =>
            pendingGroup?.group === group ? undefined : pendingGroup,
        );
    }

    private reconcileHistoryGroup(group: CommandHistoryGroup): void {
        const groupIndex = this.localCommandsHistory.indexOf(group);
        if (groupIndex === -1) return;

        const replacementGroups: CommandHistoryGroup[] = [];
        let segmentStart = 0;
        let segmentState: "applied" | "undone" | undefined;
        const appendSegment = (end: number): void => {
            if (segmentState === undefined) return;
            const commands = group.commands.slice(segmentStart, end);
            if (commands.length === 0) return;
            const replacement = this.createHistoryGroup(commands);
            commands.forEach((_command, index) => {
                replacement.everAcknowledgedCommandIndexes.add(index);
                if (segmentState === "applied") {
                    replacement.acknowledgedCommandIndexes.add(index);
                }
            });
            replacementGroups.push(replacement);
        };

        group.commands.forEach((_command, index) => {
            const wasAcknowledged = group.everAcknowledgedCommandIndexes.has(index);
            const isApplied = group.acknowledgedCommandIndexes.has(index);
            const state = !wasAcknowledged ? undefined : isApplied ? "applied" : "undone";
            if (state !== segmentState) {
                appendSegment(index);
                segmentStart = index;
                segmentState = state;
            }
        });
        appendSegment(group.commands.length);

        this.localCommandsHistory.splice(groupIndex, 1, ...replacementGroups);
        this.currentCommandIndex = -1;
        for (const [index, candidate] of this.localCommandsHistory.entries()) {
            const isApplied = candidate.commands.every((_command, commandIndex) =>
                candidate.acknowledgedCommandIndexes.has(commandIndex),
            );
            if (!isApplied) break;
            this.currentCommandIndex = index;
        }
    }

    /**
     * Creates new Command object from given command config and executes it
     * @param command what to execute
     *
     */
    public async executeCommand(
        command: (Command & FrontCommandInterface) | (Command & FrontCommandInterface & UpdateWAMSettingCommand),
    ): Promise<void> {
        await this.isReverting;
        return this.enqueueCommand(async () => {
            const shouldRecord = !(command instanceof UpdateWAMSettingCommand);
            const group = shouldRecord ? this.createHistoryGroup([command]) : undefined;
            try {
                await this.applyCommands([command], shouldRecord, true, group);

                if (group) {
                    this.recordHistoryGroup(group);
                }
            } catch (error) {
                if (group) this.discardPendingHistoryGroup(group);
                logger("Map editor command failed", { error });
                Sentry.captureException(error);
            }
        });
    }

    /**
     * Executes related commands as one undoable history entry while keeping each command as an
     * individual message on the native map editor protocol.
     * Preparatory assets may skip history while still tracking server acceptance/rejection.
     * A factory reads current map state inside the queue, immediately before execution.
     */
    public async executeCommands(
        commands: readonly FrontCommand[] | (() => readonly FrontCommand[]),
        recordHistory = true,
    ): Promise<void> {
        if (typeof commands !== "function" && commands.length === 0) return;

        await this.isReverting;
        return this.enqueueCommand(async () => {
            const batch = typeof commands === "function" ? commands() : commands;
            if (batch.length === 0) return;
            const group = recordHistory ? this.createHistoryGroup(batch) : undefined;
            try {
                await this.applyCommands(batch, true, true, group);
                if (group) this.recordHistoryGroup(group);
            } catch (error) {
                if (group) this.discardPendingHistoryGroup(group);
                throw error;
            }
        });
    }

    public async executeLocalCommand(command: Command & FrontCommandInterface): Promise<void> {
        if (this.isHandlingIncomingCommand) {
            try {
                await command.execute();
                this.scene.getGameMap().getWamFile()?.updateLastCommandIdProperty(command.commandId);
            } catch (error) {
                logger("Map editor command failed", { error });
                Sentry.captureException(error);
            }
            return;
        }
        await this.isReverting;
        return this.enqueueCommand(async () => {
            try {
                await command.execute();
                this.scene.getGameMap().getWamFile()?.updateLastCommandIdProperty(command.commandId);
                return;
            } catch (error) {
                logger("Map editor command failed", { error });
                Sentry.captureException(error);
                return;
            }
        });
    }

    // A simple queue to be sure we run only one undo or redo at once.
    private runningUndoRedoCommand: Promise<void> = Promise.resolve();

    public async undoCommand(): Promise<void> {
        await this.isReverting;
        return this.enqueueCommand(async () => {
            if (this.localCommandsHistory.length === 0 || this.currentCommandIndex === -1) return;
            const group = this.localCommandsHistory[this.currentCommandIndex];
            try {
                const undoCommands = group.commands
                    .slice()
                    .reverse()
                    .map((command) => command.getUndoCommand());
                const commandIndexes = group.commands.map((_command, index) => index).reverse();
                await this.applyCommands(undoCommands, true, false, group, "undo", commandIndexes);
                this.currentCommandIndex -= 1;
            } catch (error) {
                if (error instanceof AggregateError) this.removeHistoryGroup(group);
                logger("Map editor command failed", { error });
                Sentry.captureException(error);
            }
        });
    }

    public async redoCommand(): Promise<void> {
        await this.isReverting;
        return this.enqueueCommand(async () => {
            if (
                this.localCommandsHistory.length === 0 ||
                this.currentCommandIndex === this.localCommandsHistory.length - 1
            ) {
                return;
            }
            const group = this.localCommandsHistory[this.currentCommandIndex + 1];
            try {
                await this.applyCommands(group.commands, true, false, group);
                this.currentCommandIndex += 1;
            } catch (error) {
                if (error instanceof AggregateError) this.removeHistoryGroup(group);
                logger("Map editor command failed", { error });
                Sentry.captureException(error);
            }
        });
    }

    /**
     * Update local map with missing commands given from the map-storage on RoomJoinedEvent. This commands
     * are applied locally and are not being send further.
     */
    public async updateMapToNewest(commands: EditMapCommandMessage[]): Promise<void> {
        if (commands.length !== 0) {
            logger(`Map is not up to date. Updating by applying ${commands.length} missing commands.`);
            for (const command of commands) {
                for (const tool of Object.values(this.editorTools)) {
                    //eslint-disable-next-line no-await-in-loop
                    await tool.handleIncomingCommandMessage(command);
                }
            }
        }
    }

    public isActive(): boolean {
        return this.active;
    }

    public destroy(): void {
        for (const tool of Object.values(this.editorTools)) {
            tool.destroy();
        }
        this.unsubscribeFromStores();
    }

    public handleKeyDownEvent(event: KeyboardEvent): boolean {
        if (isTextEditingTarget(event.target)) return false;
        const mapEditorModeStoreValue = get(mapEditorModeStore);
        if (!mapEditorModeStoreValue) return false;

        this.currentlyActiveTool?.handleKeyDownEvent(event);
        const mapEditorModeActivated = get(mapEditorActivated);
        const key = event.key.toLowerCase();
        const selectionToolHandledKey =
            (this.activeTool === EditorToolName.SelectionEditor &&
                (event.ctrlKey || event.metaKey) &&
                (key === "c" || key === "v")) ||
            (this.activeTool === EditorToolName.SelectionEditor &&
                (key === "escape" || key === "delete" || key === "backspace"));
        if (selectionToolHandledKey) {
            event.preventDefault();
            return true;
        }
        switch (key) {
            case "dead":
            case "`": {
                this.equipTool(EditorToolName.CloseMapEditor);
                break;
            }
            case "1": {
                this.equipTool(EditorToolName.ExploreTheRoom);
                break;
            }
            case "2": {
                if (!mapEditorModeActivated) {
                    this.equipTool(EditorToolName.CloseMapEditor);
                    break;
                }
                this.equipTool(EditorToolName.AreaEditor);
                break;
            }
            case "3": {
                if (!mapEditorModeActivated) break;
                this.equipTool(EditorToolName.EntityEditor);
                break;
            }
            case "4": {
                if (!mapEditorModeActivated) break;
                this.equipTool(EditorToolName.WAMSettingsEditor);
                break;
            }
            case "5": {
                if (!mapEditorModeActivated) break;
                this.equipTool(EditorToolName.TrashEditor);
                break;
            }
            case "6": {
                if (!mapEditorModeActivated) break;
                this.equipTool(EditorToolName.CloseMapEditor);
                break;
            }
            case "7": {
                if (!mapEditorModeActivated) break;
                this.equipTool(EditorToolName.SelectionEditor);
                break;
            }
            case "z": {
                if (!mapEditorModeActivated) break;
                // Todo replace with key combo https://photonstorm.github.io/phaser3-docs/Phaser.Input.Keyboard.KeyCombo.html
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.runningUndoRedoCommand = this.runningUndoRedoCommand
                            .then(() => {
                                return this.redoCommand();
                            })
                            .catch((error: unknown) => logger("Map editor history operation failed", { error }));
                    } else {
                        this.runningUndoRedoCommand = this.runningUndoRedoCommand
                            .then(() => {
                                return this.undoCommand();
                            })
                            .catch((error: unknown) => logger("Map editor history operation failed", { error }));
                    }
                }
                break;
            }
            default: {
                return false;
                break;
            }
        }
        return true;
    }

    public subscribeToRoomConnection(connection: RoomConnection): void {
        const limit = pLimit(1);
        // The editMapCommandMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
        //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
        connection.editMapCommandMessageStream.subscribe((editMapCommandMessage) => {
            limit(() => this.enqueueCommand(() => this.handleIncomingCommandMessage(editMapCommandMessage))).catch(
                (error: unknown) => logger("Incoming map editor command failed", { error }),
            );
        });
    }

    private async handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        if (editMapCommandMessage.editMapMessage?.message?.$case === "errorCommandMessage") {
            const reason = editMapCommandMessage.editMapMessage.message.errorCommandMessage.reason;
            logger("ErrorCommandMessage received", reason);
            // The only place a map editor edit is known to have failed. The commands themselves send
            // fire-and-forget, so this is where the failure analytics belongs.
            analyticsClient.trackAdminEvent("map_editor.save.failed", { reason });
            const hasPendingCommand = this.pendingCommands.some(
                (command) => command.commandId === editMapCommandMessage.id,
            );
            if (hasPendingCommand) {
                // The server refused the command, so the optimistic local state is now wrong. Nothing is
                // reported to Sentry: map-storage already logged the cause, and a refusal is also the expected
                // answer to a command the user was not allowed to run.
                await this.revertPendingCommands();
                warningMessageStore.addWarningMessage(get(LL).mapEditor.map.editionFailed());
            }
            return;
        }

        logger("Received command from server", editMapCommandMessage.id);

        // Local command execution (undo/redo)
        if (this.pendingCommands.length > 0) {
            if (this.pendingCommands[0].commandId === editMapCommandMessage.id) {
                logger("removing command of pendingList : ", editMapCommandMessage.id);
                const command = this.pendingCommands.shift();
                const historyGroup = this.pendingCommandHistoryGroups.shift();
                if (historyGroup) {
                    historyGroup.group.everAcknowledgedCommandIndexes.add(historyGroup.commandIndex);
                    if (historyGroup.direction === "apply") {
                        historyGroup.group.acknowledgedCommandIndexes.add(historyGroup.commandIndex);
                    } else {
                        historyGroup.group.acknowledgedCommandIndexes.delete(historyGroup.commandIndex);
                    }
                }

                const message = editMapCommandMessage.editMapMessage?.message;

                if (
                    command instanceof UpdateAreaFrontCommand &&
                    message &&
                    message.$case === "modifyAreaMessage" &&
                    message.modifyAreaMessage.modifyServerData === true
                ) {
                    command.setNewConfig(message.modifyAreaMessage);
                    await command.execute();
                }

                return;
            }
            await this.revertPendingCommands();
        }

        // Remote command execution
        this.isHandlingIncomingCommand = true;
        try {
            await Object.values(this.editorTools).reduce(async (previousTool, tool) => {
                await previousTool;
                await tool.handleIncomingCommandMessage(editMapCommandMessage);
            }, Promise.resolve());
        } finally {
            this.isHandlingIncomingCommand = false;
        }
    }

    private async revertPendingCommands(): Promise<void> {
        logger("Reverting pending commands");
        const pendingSnapshot = [...this.pendingCommands];
        const pendingHistorySnapshot = [...this.pendingCommandHistoryGroups];
        const affectedGroups = new Set(
            pendingHistorySnapshot.flatMap((pendingGroup) => (pendingGroup ? [pendingGroup.group] : [])),
        );

        const reverting = (async () => {
            let revertedCount = 0;
            try {
                await pendingSnapshot
                    .map((command, index) => ({ command, index }))
                    .reverse()
                    .reduce(async (previousCommand, { command }) => {
                        await previousCommand;
                        await command.getUndoCommand().execute();
                        revertedCount += 1;
                    }, Promise.resolve());
            } catch (error) {
                this.pendingCommands = pendingSnapshot.slice(0, pendingSnapshot.length - revertedCount);
                this.pendingCommandHistoryGroups = pendingHistorySnapshot.slice(
                    0,
                    pendingHistorySnapshot.length - revertedCount,
                );
                for (const group of affectedGroups) this.removeHistoryGroup(group);
                throw error;
            }
            this.pendingCommands = [];
            this.pendingCommandHistoryGroups = [];
            for (const group of affectedGroups) this.reconcileHistoryGroup(group);
        })();
        this.isReverting = reverting;
        try {
            await reverting;
        } finally {
            if (this.isReverting === reverting) {
                this.isReverting = Promise.resolve();
            }
        }
    }

    public equipTool(tool?: EditorToolName): void {
        if (this.activeTool === tool) {
            return;
        }
        this.clearToNeutralState();
        this.activeTool = tool;

        if (tool !== undefined) {
            this.activateTool();
        }
        mapEditorSelectedToolStore.set(tool);
    }

    public returnToLastMode(): boolean {
        if (!this.active) {
            return false;
        }

        // The whole map editor has a free view: stop following the remote player, stay where the view is.
        this.scene.getCameraManager().setExplorationMode();
        return true;
    }

    private emitMapEditorUpdate(command: FrontCommandInterface, delay = 0): void {
        const func = () => {
            if (this.scene.connection === undefined) {
                throw new Error("No connection attached to room to emit map editor update");
            }
            command.emitEvent(this.scene.connection);
        };
        if (delay === 0) {
            func();
            return;
        }
        setTimeout(func, delay);
    }

    /**
     * Hide everything related to tools like Area Previews etc
     */
    private clearToNeutralState(): void {
        this.currentlyActiveTool?.clear();
    }

    /**
     * Show things necessary for tool's usage
     */
    private activateTool(): void {
        this.currentlyActiveTool?.activate();
    }

    private subscribeToStores(): void {
        this.mapEditorModeUnsubscriber = mapEditorModeStore.subscribe((active) => {
            const wasActive = this.active;
            this.active = active;
            if (!active && wasActive) {
                mapEditorSnapEnabledStore.set(true);
            }
            if (!this.active) {
                this.lastlyUsedTool = get(mapEditorSelectedToolStore);
                this.equipTool(undefined);
                return;
            }
            this.equipTool(
                this.lastlyUsedTool && this.lastlyUsedTool != EditorToolName.CloseMapEditor
                    ? this.lastlyUsedTool
                    : get(mapEditorActivated) || get(mapEditorActivatedForThematics)
                      ? EditorToolName.EntityEditor
                      : EditorToolName.ExploreTheRoom,
            );
        });
    }

    private subscribeToGameMapFrontWrapperEvents(): void {
        for (const tool of Object.values(this.editorTools)) {
            tool.subscribeToGameMapFrontWrapperEvents(this.scene.getGameMapFrontWrapper());
        }
    }

    private unsubscribeFromStores(): void {
        this.mapEditorModeUnsubscriber?.();
    }

    public get currentlyActiveTool(): MapEditorTool | undefined {
        return this.activeTool ? this.editorTools[this.activeTool] : undefined;
    }

    public getSelectionEditorTool(): SelectionEditorTool {
        return this.selectionEditorTool;
    }

    public getScene(): GameScene {
        return this.scene;
    }

    public claimPersonalArea(userName: string) {
        const areaDataToClaim = get(mapEditorAskToClaimPersonalAreaStore);
        const userUUID = localUserStore.getLocalUser()?.uuid;
        if (areaDataToClaim === undefined) {
            console.error("No area to claim");
            return;
        }
        if (userUUID === undefined) {
            console.error("Unable to claim the area, your UUID is undefined");
            return;
        }
        const areaPersonalPropertyData = areaDataToClaim.properties.find(
            (property) => property.type === "personalAreaPropertyData",
        );
        if (!areaPersonalPropertyData) {
            console.error("No area property data");
            return;
        }

        // Get and revoke the personal area of the user if it exists
        const gameMapFrontWrapper = gameManager.getCurrentGameScene().getGameMapFrontWrapper();
        for (const area of gameMapFrontWrapper.areasManager?.getAreasByPropertyType("personalAreaPropertyData") ?? []) {
            const property = area.areaData.properties.find((property) => property.type === "personalAreaPropertyData");
            if (!property || (property.type === "personalAreaPropertyData" && property?.ownerId !== userUUID)) continue;

            // The user already has a personal area, revoke it
            const oldAreaDataToRevok = structuredClone(area.areaData);
            // Define the new name of the area
            deepmergeInto(area.areaData, {
                name: get(LL).area.personalArea.claimDescription(),
            });
            // Define the new owner of the area
            deepmergeInto(property, {
                ownerId: null,
            });

            this.executeCommand(
                new UpdateAreaFrontCommand(
                    this.getScene().getGameMap().getWamFile()!,
                    area.areaData,
                    undefined,
                    oldAreaDataToRevok,
                    this.editorTools.AreaEditor as AreaEditorTool,
                    this.scene.getGameMapFrontWrapper(),
                ),
            ).catch((error) => console.error(error));
        }

        const oldAreaData = structuredClone(areaDataToClaim);
        const property = areaDataToClaim.properties.find((property) => property.type === "personalAreaPropertyData");
        if (property) {
            // Define the new name of the area
            deepmergeInto(areaDataToClaim, {
                name: get(LL).area.personalArea.personalSpaceWithNames({ name: userName }),
            });
            // Define the new owner of the area
            deepmergeInto(property, {
                ownerId: userUUID,
            });
        }

        this.executeCommand(
            new UpdateAreaFrontCommand(
                this.getScene().getGameMap().getWamFile()!,
                areaDataToClaim,
                undefined,
                oldAreaData,
                this.editorTools.AreaEditor as AreaEditorTool,
                this.scene.getGameMapFrontWrapper(),
            ),
        ).catch((error) => console.error(error));
        this._isInsidePersonalAreaStore.set(true);
        this._personalAreaDataStore.set(areaDataToClaim);
    }

    public async unclaimPersonalArea(areaData: AreaData) {
        const property = areaData.properties.find((property) => property.type === "personalAreaPropertyData");
        if (!property) {
            console.error("No area property data");
            return;
        }
        deepmergeInto(property, {
            name: get(LL).area.personalArea.claimDescription(),
            ownerId: null,
        });
        await this.executeCommand(
            new UpdateAreaFrontCommand(
                this.getScene().getGameMap().getWamFile()!,
                areaData,
                undefined,
                undefined,
                this.editorTools.AreaEditor as AreaEditorTool,
                this.scene.getGameMapFrontWrapper(),
            ),
        );
        this._isInsidePersonalAreaStore.set(false);
        this._personalAreaDataStore.set(null);
    }
}
