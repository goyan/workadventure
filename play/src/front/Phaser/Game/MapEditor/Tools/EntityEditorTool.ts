import * as Phaser from "phaser";
import type { EntityData, EntityPrefab, WAMEntityData } from "@workadventure/map-editor";
import * as Sentry from "@sentry/svelte";
import type { EditMapCommandMessage } from "@workadventure/messages";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import { v4 as uuidv4 } from "uuid";
import { entityPlacementBlockerStore } from "../../../../Stores/MapEditorStore";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorDeleteCustomEntityEventStore,
    mapEditorEntityFileDroppedStore,
    mapEditorEntityModeStore,
    mapEditorEntityUploadEventStore,
    mapEditorModifyCustomEntityEventStore,
    mapEditorSelectedEntityStore,
    mapEditorSnapEnabledStore,
} from "../../../../Stores/MapEditorStore";
import { TexturesHelper } from "../../../Helpers/TexturesHelper";
import { CopyEntityEventData, EntitiesManagerEvent } from "../../GameMap/EntitiesManager";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import { DeleteCustomEntityFrontCommand } from "../Commands/Entity/DeleteCustomEntityFrontCommand";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import { ModifyCustomEntityFrontCommand } from "../Commands/Entity/ModifyCustomEntityFrontCommand";
import { UpdateEntityFrontCommand } from "../Commands/Entity/UpdateEntityFrontCommand";
import { UploadEntityFrontCommand } from "../Commands/Entity/UploadEntityFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { isPlacementFree, shouldSnapToGrid } from "../EntityPlacementSnapping";
import { EntityRelatedEditorTool } from "./EntityRelatedEditorTool";

import Key = Phaser.Input.Keyboard.Key;
import Pointer = Phaser.Input.Pointer;
import GameObject = Phaser.GameObjects.GameObject;

export class EntityEditorTool extends EntityRelatedEditorTool {
    private handleUpdateEntity: (entityData: EntityData) => void;
    private handleCopyEntity: (data: CopyEntityEventData) => void;
    protected ctrlKey?: Key;
    protected shiftKey?: Key;
    protected pointerMoveEventHandler!: (pointer: Pointer, gameObjects: GameObject[]) => void;
    protected pointerDownEventHandler!: (pointer: Pointer, gameObjects: GameObject[]) => void;

    protected mapEditorEntityUploadStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorModifyCustomEntityEventStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorDeleteCustomEntityEventStoreUnsubscriber: Unsubscriber | undefined;

    private readonly handleShiftKeyDown = (): void => {
        this.changePreviewTint();
    };
    private readonly handleShiftKeyUp = (): void => {
        this.changePreviewTint();
    };

    constructor(mapEditorModeManager: MapEditorModeManager) {
        super(mapEditorModeManager);
        this.shiftKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.ctrlKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);

        this.handleUpdateEntity = this.updateEntity.bind(this);
        this.handleCopyEntity = this.copyEntity.bind(this);
    }

    public activate(): void {
        super.activate();
        this.subscribeToEntityUpload();
        this.subscribeToModifyCustomEntityEventStore();
        this.subscribeToDeleteCustomEntityEventStore();

        this.bindEventHandlers();
        this.bindEntitiesManagerEventHandlers();
    }

    public clear(): void {
        entityPlacementBlockerStore.set(undefined);
        super.clear();
        this.unbindEventHandlers();
        this.unsubscribeStore();
        this.unbindEntitiesManagerEventHandlers();
    }

    /**
     * React on commands coming from the outside
     */
    public async handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        const commandId = editMapCommandMessage.id;
        switch (editMapCommandMessage.editMapMessage?.message?.$case) {
            case "createEntityMessage": {
                const createEntityMessage = editMapCommandMessage.editMapMessage?.message.createEntityMessage;
                const entityPrefab = await this.scene
                    .getEntitiesCollectionsManager()
                    .getEntityPrefab(createEntityMessage.collectionName, createEntityMessage.prefabId);

                if (!entityPrefab) {
                    console.warn(
                        `NO PREFAB WAS FOUND FOR: ${createEntityMessage.collectionName} ${createEntityMessage.prefabId}`,
                    );
                    return;
                }

                TexturesHelper.loadEntityImage(
                    this.scene,
                    entityPrefab.imagePath,
                    entityPrefab.imagePath,
                    entityPrefab.animation,
                )
                    .then(() => {
                        this.entitiesManager.getEntities().get(createEntityMessage.id)?.showPrefabTexture();
                    })
                    .catch((reason) => {
                        console.warn(reason);
                    });

                const entityData: WAMEntityData = {
                    x: createEntityMessage.x,
                    y: createEntityMessage.y,
                    prefabRef: {
                        id: entityPrefab.id,
                        collectionName: entityPrefab.collectionName,
                    },
                    properties: createEntityMessage.properties,
                    name: createEntityMessage.name,
                    depthStep: createEntityMessage.depthStep,
                };
                // execute command locally
                await this.mapEditorModeManager.executeLocalCommand(
                    new CreateEntityFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        createEntityMessage.id,
                        entityData,
                        commandId,
                        this.entitiesManager,
                        { width: createEntityMessage.width, height: createEntityMessage.height },
                    ),
                );
                break;
            }
            case "deleteEntityMessage": {
                const id = editMapCommandMessage.editMapMessage?.message.deleteEntityMessage.id;
                await this.mapEditorModeManager.executeLocalCommand(
                    new DeleteEntityFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        id,
                        commandId,
                        this.entitiesManager,
                    ),
                );
                break;
            }
            case "modifyEntityMessage": {
                const modifyEntityMessage = editMapCommandMessage.editMapMessage?.message.modifyEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new UpdateEntityFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        modifyEntityMessage.id,
                        {
                            ...modifyEntityMessage,
                            properties: modifyEntityMessage.modifyProperties
                                ? modifyEntityMessage.properties
                                : undefined,
                        },
                        commandId,
                        undefined,
                        this.entitiesManager,
                        this.scene,
                    ),
                );
                break;
            }
            case "uploadEntityMessage": {
                const uploadEntityMessage = editMapCommandMessage.editMapMessage?.message.uploadEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new UploadEntityFrontCommand(
                        uploadEntityMessage,
                        this.entitiesManager,
                        this.scene.getEntitiesCollectionsManager(),
                    ),
                );
                break;
            }
            case "modifyCustomEntityMessage": {
                const modifyCustomEntityMessage =
                    editMapCommandMessage.editMapMessage?.message.modifyCustomEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new ModifyCustomEntityFrontCommand(
                        modifyCustomEntityMessage,
                        this.scene.getEntitiesCollectionsManager(),
                        this.scene.getGameMapFrontWrapper(),
                        this.entitiesManager,
                    ),
                );
                break;
            }
            case "deleteCustomEntityMessage": {
                const deleteCustomEntityMessage =
                    editMapCommandMessage.editMapMessage?.message.deleteCustomEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new DeleteCustomEntityFrontCommand(
                        deleteCustomEntityMessage,
                        this.scene.getGameMap().getWamFile(),
                        this.entitiesManager,
                        this.scene.getEntitiesCollectionsManager(),
                    ),
                );
                break;
            }
        }
    }

    public destroy() {
        super.destroy();
        this.unbindEventHandlers();
        this.unbindEntitiesManagerEventHandlers();
        this.unsubscribeStore();
    }

    protected bindEntitiesManagerEventHandlers(): void {
        this.entitiesManager.on(EntitiesManagerEvent.UpdateEntity, this.handleUpdateEntity);
        this.entitiesManager.on(EntitiesManagerEvent.CopyEntity, this.handleCopyEntity);
    }

    protected bindEventHandlers() {
        this.pointerMoveEventHandler = (pointer: Pointer, gameObjects: GameObject[]) =>
            this.handlePointerMoveEvent(pointer, gameObjects);
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);

        this.pointerDownEventHandler = (pointer: Pointer, gameObjects: GameObject[]) =>
            this.handlePointerDownEvent(pointer, gameObjects);
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);

        this.shiftKey?.on(Phaser.Input.Keyboard.Events.DOWN, this.handleShiftKeyDown);
        this.shiftKey?.on(Phaser.Input.Keyboard.Events.UP, this.handleShiftKeyUp);
    }

    protected subscribeToEntityUpload() {
        this.mapEditorEntityUploadStoreUnsubscriber = mapEditorEntityUploadEventStore.subscribe(
            (uploadEntityMessage) => {
                if (uploadEntityMessage) {
                    (async () => {
                        await this.mapEditorModeManager.executeCommand(
                            new UploadEntityFrontCommand(
                                uploadEntityMessage,
                                this.entitiesManager,
                                this.scene.getEntitiesCollectionsManager(),
                            ),
                        );
                        mapEditorEntityUploadEventStore.set(undefined);
                    })().catch((e) => {
                        console.error(e);
                        Sentry.captureException(e);
                    });
                }
            },
        );
    }

    protected subscribeToModifyCustomEntityEventStore() {
        this.mapEditorModifyCustomEntityEventStoreUnsubscriber = mapEditorModifyCustomEntityEventStore.subscribe(
            (modifyCustomEntityMessage) => {
                if (modifyCustomEntityMessage) {
                    (async () => {
                        await this.mapEditorModeManager.executeCommand(
                            new ModifyCustomEntityFrontCommand(
                                modifyCustomEntityMessage,
                                this.scene.getEntitiesCollectionsManager(),
                                this.scene.getGameMapFrontWrapper(),
                                this.entitiesManager,
                            ),
                        );
                        mapEditorModifyCustomEntityEventStore.set(undefined);
                    })().catch((e) => {
                        console.error(e);
                        Sentry.captureException(e);
                    });
                }
            },
        );
    }

    protected subscribeToDeleteCustomEntityEventStore() {
        this.mapEditorDeleteCustomEntityEventStoreUnsubscriber = mapEditorDeleteCustomEntityEventStore.subscribe(
            (deleteCustomEntityMessage) => {
                if (deleteCustomEntityMessage) {
                    (async () => {
                        await this.mapEditorModeManager.executeCommand(
                            new DeleteCustomEntityFrontCommand(
                                deleteCustomEntityMessage,
                                this.scene.getGameMap().getWamFile(),
                                this.entitiesManager,
                                this.scene.getEntitiesCollectionsManager(),
                            ),
                        );
                        mapEditorDeleteCustomEntityEventStore.set(undefined);
                    })().catch((e) => {
                        console.error(e);
                        Sentry.captureException(e);
                    });
                }
            },
        );
    }

    protected handlePointerMoveEvent(pointer: Pointer, gameObjects: GameObject[]): void {
        // TODO: add shadow when moving into the area
        // .setDropShadow(4, 4, 0x000000);
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return;
        }

        this.updateEntityPrefabPreviewPosition(pointer);
        this.changePreviewTint();
    }

    protected changePreviewTint(): void {
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return;
        }
        if (!this.canEntityBePlaced()) {
            this.entityPrefabPreview.setTint(0xff0000);
        } else {
            if (this.isFreePlacement()) {
                this.entityPrefabPreview.setTint(0xffa500);
            } else {
                this.entityPrefabPreview.clearTint();
            }
        }
        this.scene.markDirty();
    }

    protected handlePointerDownEvent(pointer: Pointer, gameObjects: GameObject[]): void {
        if (pointer.button === 2 || pointer.rightButtonDown()) {
            this.cleanPreview();
            return;
        }

        if (pointer.button !== 0 || !pointer.leftButtonDown()) {
            return;
        }

        if (get(mapEditorEntityModeStore) === "EDIT" && gameObjects.length === 0) {
            mapEditorEntityModeStore.set("ADD");
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            mapEditorSelectedEntityStore.set(undefined);
        }

        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return;
        }

        this.updateEntityPrefabPreviewPosition(pointer);

        if (!this.canEntityBePlaced()) {
            return;
        }

        let x = Math.floor(pointer.worldX);
        let y = Math.floor(pointer.worldY);

        if (this.isSnappingToGrid()) {
            const offsets = this.getEntityPrefabAlignWithGridOffset();
            x = Math.floor(pointer.worldX / 32) * 32 + offsets.x;
            y = Math.floor(pointer.worldY / 32) * 32 + offsets.y;
        }

        const entityId = uuidv4();

        const properties = get(mapEditorCopiedEntityDataPropertiesStore);

        const entityData: WAMEntityData = {
            x: Math.floor(x - this.entityPrefabPreview.displayWidth * 0.5),
            y: Math.floor(y - this.entityPrefabPreview.displayHeight * 0.5),
            prefabRef: this.entityPrefab,
            properties: properties ?? [],
            name: properties?.find((p) => p.type === "openFile")?.name ?? undefined,
        };

        this.mapEditorModeManager
            .executeCommand(
                new CreateEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    entityId,
                    entityData,
                    undefined,
                    this.entitiesManager,
                    { width: this.entityPrefabPreview.width, height: this.entityPrefabPreview.height },
                ),
            )
            .then(() => {
                const openEntity = this.entitiesManager.getEntities().get(entityId);
                if (get(mapEditorEntityFileDroppedStore)) {
                    mapEditorEntityFileDroppedStore.set(false);
                    mapEditorEntityModeStore.set("EDIT");
                    mapEditorSelectedEntityStore.set(openEntity);
                }
            })
            .catch((e) => console.error(e));
    }

    protected unbindEventHandlers(): void {
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.shiftKey?.off(Phaser.Input.Keyboard.Events.DOWN, this.handleShiftKeyDown);
        this.shiftKey?.off(Phaser.Input.Keyboard.Events.UP, this.handleShiftKeyUp);
    }

    protected unbindEntitiesManagerEventHandlers(): void {
        this.entitiesManager.off(EntitiesManagerEvent.UpdateEntity, this.handleUpdateEntity);
        this.entitiesManager.off(EntitiesManagerEvent.CopyEntity, this.handleCopyEntity);
    }

    private canEntityBePlaced(): boolean {
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return false;
        }
        return this.canEntityBePlacedAt(
            this.entityPrefabPreview.getTopLeft(),
            this.entityPrefabPreview.displayWidth,
            this.entityPrefabPreview.displayHeight,
            this.entityPrefab,
        );
    }

    private canEntityBePlacedAt(
        topLeftPos: { x: number; y: number },
        width: number,
        height: number,
        prefab: EntityPrefab,
        ignoreCollisionGrid: boolean = this.isFreePlacement(),
    ): boolean {
        const blocker = this.scene
            .getGameMapFrontWrapper()
            .getPlacementBlocker(topLeftPos, width, height, prefab.collisionGrid, undefined, ignoreCollisionGrid);
        entityPlacementBlockerStore.set(blocker);
        return blocker === undefined;
    }

    private isSnappingToGrid(): boolean {
        return shouldSnapToGrid(get(mapEditorSnapEnabledStore), this.shiftKey?.isDown ?? false);
    }

    private isFreePlacement(): boolean {
        return isPlacementFree(get(mapEditorSnapEnabledStore), this.shiftKey?.isDown ?? false);
    }

    private updateEntityPrefabPreviewPosition(pointer: Pointer): void {
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return;
        }

        if (this.isSnappingToGrid()) {
            const offset = this.getEntityPrefabAlignWithGridOffset();
            this.entityPrefabPreview.setPosition(
                Math.floor(pointer.worldX / 32) * 32 + offset.x,
                Math.floor(pointer.worldY / 32) * 32 + offset.y,
            );
        } else {
            this.entityPrefabPreview.setPosition(Math.floor(pointer.worldX), Math.floor(pointer.worldY));
        }

        this.entityPrefabPreview.setDepth(
            this.entityPrefabPreview.y +
                this.entityPrefabPreview.displayHeight * 0.5 +
                (this.entityPrefab.depthOffset ?? 0),
        );
    }

    private updateEntity(entityData: EntityData) {
        // Create commande to update entity data
        this.mapEditorModeManager
            .executeCommand(
                new UpdateEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    entityData.id,
                    {
                        ...entityData,
                    },
                    undefined,
                    undefined,
                    this.entitiesManager,
                    this.scene,
                ),
            )
            .catch((e) => console.error(e));
    }

    private copyEntity = (data: CopyEntityEventData) => {
        if (!CopyEntityEventData.parse(data)) {
            return;
        }
        const entityData: WAMEntityData = {
            x: data.position.x,
            y: data.position.y,
            prefabRef: data.prefabRef,
            properties: data.properties ?? [],
        };
        this.mapEditorModeManager
            .executeCommand(
                new CreateEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    undefined,
                    entityData,
                    undefined,
                    this.entitiesManager,
                    data.entityDimensions,
                ),
            )
            .catch((e) => console.error(e));
        this.cleanPreview();
    };

    private unsubscribeStore() {
        this.mapEditorEntityUploadStoreUnsubscriber?.();
        this.mapEditorModifyCustomEntityEventStoreUnsubscriber?.();
        this.mapEditorDeleteCustomEntityEventStoreUnsubscriber?.();
    }
}
