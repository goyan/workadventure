import type { AreaData, EntityData, EntityPrefab, WAMEntityData } from "@workadventure/map-editor";
import * as Sentry from "@sentry/svelte";
import type { EditMapCommandMessage } from "@workadventure/messages";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import { v4 as uuidv4 } from "uuid";
import { asError } from "catch-unknown";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorDeleteCustomEntityEventStore,
    mapEditorEntityFileDroppedStore,
    mapEditorEntityModeStore,
    mapEditorEntityUploadEventStore,
    mapEditorModifyCustomEntityEventStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
    mapEditorSelectedToolStore,
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
import { isPointerInsideCanvas } from "../MapEditorPointer";
import { EditorToolName } from "../MapEditorModeManager";
import { AreaPreview } from "../../../Components/MapEditor/AreaPreview";
import { isPlacementFree, shouldSnapToGrid } from "../EntityPlacementSnapping";
import { mapEditorActivated } from "../../../../Stores/MenuStore";
import { EntityRelatedEditorTool } from "./EntityRelatedEditorTool";

const ENTITY_EDITOR_AREA_PREVIEW_DEPTH = -1;
const FLOOR_COLLECTION_NAME = "Infogène Sols";
const FLOOR_TAG = "Sols";
const FLOOR_DEPTH_OFFSET = -32;

interface FloorStroke {
    pointerId: number;
    prefab: EntityPrefab;
    lastTileIndex: Phaser.Types.Math.Vector2Like;
}

export class EntityEditorTool extends EntityRelatedEditorTool {
    private handleUpdateEntity: (entityData: EntityData) => void;
    private handleCopyEntity: (data: CopyEntityEventData) => void;
    /**
     * Visual representations of map Areas objects
     */
    protected areaPreviews: AreaPreview[] = [];

    protected ctrlKey?: Phaser.Input.Keyboard.Key;
    protected shiftKey?: Phaser.Input.Keyboard.Key;
    protected pointerMoveEventHandler!: (
        pointer: Phaser.Input.Pointer,
        gameObjects: Phaser.GameObjects.GameObject[],
    ) => void;
    protected pointerDownEventHandler!: (
        pointer: Phaser.Input.Pointer,
        gameObjects: Phaser.GameObjects.GameObject[],
    ) => void;
    protected readonly pointerUpEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerUpEvent(pointer);
    };
    protected readonly pointerOutEventHandler = (): void => {
        this.stopFloorStroke();
    };
    protected readonly windowBlurEventHandler = (): void => {
        this.stopFloorStroke();
    };

    protected mapEditorEntityUploadStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorModifyCustomEntityEventStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorDeleteCustomEntityEventStoreUnsubscriber: Unsubscriber | undefined;

    private floorStroke: FloorStroke | undefined;
    private floorPrefabSelectionUnsubscriber: Unsubscriber | undefined;
    private readonly pendingFloorCreations = new Set<string>();
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
        this.createAreaPreviews();
        this.setAreaPreviewsVisibility(true);
        this.subscribeToEntityUpload();
        this.subscribeToModifyCustomEntityEventStore();
        this.subscribeToDeleteCustomEntityEventStore();
        this.floorPrefabSelectionUnsubscriber = mapEditorSelectedEntityPrefabStore.subscribe(() => {
            this.stopFloorStroke();
        });

        this.bindEventHandlers();
        this.bindEntitiesManagerEventHandlers();
    }

    public clear(): void {
        this.stopFloorStroke();
        super.clear();
        this.setAreaPreviewsVisibility(false);
        this.deleteAreaPreview();
        this.unbindEventHandlers();
        this.unsubscribeStore();
        this.floorPrefabSelectionUnsubscriber?.();
        this.floorPrefabSelectionUnsubscriber = undefined;
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

                TexturesHelper.loadEntityImage(this.scene, entityPrefab.imagePath, entityPrefab.imagePath)
                    .then(() => {
                        this.entitiesManager
                            .getEntities()
                            .get(createEntityMessage.id)
                            ?.setTexture(entityPrefab.imagePath);
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
        this.stopFloorStroke();
        super.destroy();
        this.unbindEventHandlers();
        this.unbindEntitiesManagerEventHandlers();
        this.unsubscribeStore();
        this.floorPrefabSelectionUnsubscriber?.();
        this.floorPrefabSelectionUnsubscriber = undefined;
        this.setAreaPreviewsVisibility(false);
        this.deleteAreaPreview();
    }

    public handleKeyDownEvent(event: KeyboardEvent): void {
        if (event.key.toLowerCase() === "escape") {
            this.stopFloorStroke();
        }
        super.handleKeyDownEvent(event);
    }

    protected bindEntitiesManagerEventHandlers(): void {
        this.entitiesManager.on(EntitiesManagerEvent.UpdateEntity, this.handleUpdateEntity);
        this.entitiesManager.on(EntitiesManagerEvent.CopyEntity, this.handleCopyEntity);
    }

    protected bindEventHandlers() {
        this.pointerMoveEventHandler = (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) =>
            this.handlePointerMoveEvent(pointer, gameObjects);
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);

        this.pointerDownEventHandler = (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) =>
            this.handlePointerDownEvent(pointer, gameObjects);
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);

        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.pointerOutEventHandler);

        window.addEventListener("blur", this.windowBlurEventHandler);

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

    protected handlePointerMoveEvent(
        pointer: Phaser.Input.Pointer,
        gameObjects: Phaser.GameObjects.GameObject[],
    ): void {
        this.continueFloorStroke(pointer);

        // TODO: add shadow when moving into the area
        // .setDropShadow(4, 4, 0x000000);
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

    protected handlePointerDownEvent(
        pointer: Phaser.Input.Pointer,
        gameObjects: Phaser.GameObjects.GameObject[],
    ): void {
        if (pointer.button === 2 || pointer.rightButtonDown()) {
            this.stopFloorStroke();
            this.cleanPreview();
            return;
        }

        if (pointer.button !== 0 || !pointer.leftButtonDown()) {
            return;
        }

        const clickedAreaPreview = this.isAreaPreviewClicked(pointer, gameObjects);

        if (get(mapEditorEntityModeStore) === "EDIT" && gameObjects.length === 0 && !clickedAreaPreview) {
            mapEditorEntityModeStore.set("ADD");
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            mapEditorSelectedEntityStore.set(undefined);
        }

        if (!this.entityPrefabPreview || !this.entityPrefab) {
            // Check that the user can open map editor to edit an area
            if (get(mapEditorActivated)) {
                if (clickedAreaPreview && get(mapEditorSelectedToolStore) !== EditorToolName.AreaEditor) {
                    this.scene.getMapEditorModeManager().equipTool(EditorToolName.AreaEditor);
                }
            }
            return;
        }

        if (this.isFloorPrefab(this.entityPrefab)) {
            if (
                (pointer.downElement !== this.scene.game.canvas && pointer.event.target !== this.scene.game.canvas) ||
                !isPointerInsideCanvas(this.scene, pointer)
            ) {
                return;
            }
            this.startFloorStroke(pointer, this.entityPrefab);
            return;
        }

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

    protected handlePointerUpEvent(pointer: Phaser.Input.Pointer): void {
        if (this.floorStroke?.pointerId === pointer.id) {
            this.stopFloorStroke();
        }
    }

    protected unbindEventHandlers(): void {
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.pointerOutEventHandler);
        window.removeEventListener("blur", this.windowBlurEventHandler);
        this.shiftKey?.off(Phaser.Input.Keyboard.Events.DOWN, this.handleShiftKeyDown);
        this.shiftKey?.off(Phaser.Input.Keyboard.Events.UP, this.handleShiftKeyUp);
    }

    protected unbindEntitiesManagerEventHandlers(): void {
        this.entitiesManager.off(EntitiesManagerEvent.UpdateEntity, this.handleUpdateEntity);
        this.entitiesManager.off(EntitiesManagerEvent.CopyEntity, this.handleCopyEntity);
    }

    protected createAreaPreviews(): AreaPreview[] {
        this.areaPreviews = [];
        const areaConfigs = this.scene.getGameMapFrontWrapper().getAreas();

        if (areaConfigs) {
            for (const config of Array.from(areaConfigs.values())) {
                this.createAreaPreview(config);
            }
        }

        this.setAreaPreviewsVisibility(false);

        return this.areaPreviews;
    }

    protected createAreaPreview(areaConfig: AreaData): AreaPreview {
        const areaPreview = new AreaPreview(
            this.scene,
            structuredClone(areaConfig),
            false,
            this.shiftKey,
            this.ctrlKey,
        );
        areaPreview.setDepth(ENTITY_EDITOR_AREA_PREVIEW_DEPTH);
        areaPreview.disableInteractive();
        this.areaPreviews.push(areaPreview);
        return areaPreview;
    }

    protected setAreaPreviewsVisibility(visible: boolean): void {
        // NOTE: I would really like to use Phaser Layers here but it seems that there's a problem with Areas still being
        //       interactive when we hide whole Layer and thus forEach is needed.
        this.areaPreviews.forEach((area) => area.setVisible(visible));
    }

    protected deleteAreaPreview(): void {
        this.areaPreviews.forEach((preview) => preview.destroy());
    }

    protected getAreasFromPosition(x: number, y: number): AreaData[] {
        const areasPreview = this.scene.getGameMapFrontWrapper().getAreas();
        if (!areasPreview) {
            return [];
        }
        return Array.from(areasPreview.values()).filter((area: AreaData) => {
            return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
        });
    }

    private isAreaPreviewClicked(pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]): boolean {
        if (gameObjects.some((obj) => obj instanceof AreaPreview)) {
            return true;
        }

        if (gameObjects.length > 0) {
            return false;
        }

        return this.getAreasFromPosition(pointer.worldX, pointer.worldY).length > 0;
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
        return this.scene
            .getGameMapFrontWrapper()
            .canEntityBePlacedOnMap(topLeftPos, width, height, prefab.collisionGrid, undefined, ignoreCollisionGrid);
    }

    private isSnappingToGrid(): boolean {
        return shouldSnapToGrid(get(mapEditorSnapEnabledStore), this.shiftKey?.isDown ?? false);
    }

    private isFreePlacement(): boolean {
        return isPlacementFree(get(mapEditorSnapEnabledStore), this.shiftKey?.isDown ?? false);
    }

    private isFloorPrefab(prefab: EntityPrefab): boolean {
        const tileDimensions = this.scene.getGameMapFrontWrapper().getTileDimensions();
        const collisionGrid = prefab.collisionGrid;
        const preview = this.entityPrefabPreview;

        return (
            prefab.collectionName === FLOOR_COLLECTION_NAME &&
            prefab.tags.includes(FLOOR_TAG) &&
            prefab.depthOffset === FLOOR_DEPTH_OFFSET &&
            collisionGrid?.length === 1 &&
            collisionGrid[0]?.length === 1 &&
            collisionGrid[0][0] === 0 &&
            preview !== undefined &&
            preview.displayWidth === tileDimensions.width &&
            preview.displayHeight === tileDimensions.height
        );
    }

    private startFloorStroke(pointer: Phaser.Input.Pointer, prefab: EntityPrefab): void {
        const tileIndex = this.scene.getGameMapFrontWrapper().getTileIndexAt(pointer.worldX, pointer.worldY);
        this.floorStroke = {
            pointerId: pointer.id,
            prefab,
            lastTileIndex: tileIndex,
        };
        this.paintFloorTile(prefab, tileIndex);
    }

    private continueFloorStroke(pointer: Phaser.Input.Pointer): void {
        const stroke = this.floorStroke;
        if (!stroke || stroke.pointerId !== pointer.id) {
            return;
        }
        if (
            !pointer.leftButtonDown() ||
            !isPointerInsideCanvas(this.scene, pointer) ||
            this.entityPrefab !== stroke.prefab ||
            !this.isFloorPrefab(stroke.prefab)
        ) {
            this.stopFloorStroke();
            return;
        }

        const tileIndex = this.scene.getGameMapFrontWrapper().getTileIndexAt(pointer.worldX, pointer.worldY);
        const line = new Phaser.Geom.Line(stroke.lastTileIndex.x, stroke.lastTileIndex.y, tileIndex.x, tileIndex.y);
        for (const point of Phaser.Geom.Line.BresenhamPoints(line)) {
            this.paintFloorTile(stroke.prefab, point);
        }
        stroke.lastTileIndex = tileIndex;
    }

    private paintFloorTile(prefab: EntityPrefab, tileIndex: Phaser.Types.Math.Vector2Like): void {
        const tileDimensions = this.scene.getGameMapFrontWrapper().getTileDimensions();
        const topLeftPos = {
            x: tileIndex.x * tileDimensions.width,
            y: tileIndex.y * tileDimensions.height,
        };
        const reservationKey = JSON.stringify([prefab.collectionName, prefab.id, topLeftPos.x, topLeftPos.y]);
        if (this.pendingFloorCreations.has(reservationKey)) {
            return;
        }

        for (const entity of this.entitiesManager.getEntities().values()) {
            const entityPrefab = entity.getPrefab();
            if (
                entityPrefab.collectionName === prefab.collectionName &&
                entityPrefab.id === prefab.id &&
                entity.x === topLeftPos.x &&
                entity.y === topLeftPos.y
            ) {
                return;
            }
        }
        if (!this.entityPrefabPreview) {
            return;
        }

        const width = this.entityPrefabPreview.displayWidth;
        const height = this.entityPrefabPreview.displayHeight;
        // The floor brush always works on tile indexes: only Shift ignores collisions, the snapping switch does not apply.
        if (!this.canEntityBePlacedAt(topLeftPos, width, height, prefab, this.shiftKey?.isDown ?? false)) {
            return;
        }

        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile) {
            return;
        }

        const properties = get(mapEditorCopiedEntityDataPropertiesStore);
        const entityData: WAMEntityData = {
            x: topLeftPos.x,
            y: topLeftPos.y,
            prefabRef: prefab,
            properties: properties ?? [],
            name: properties?.find((property) => property.type === "openFile")?.name ?? undefined,
        };

        this.pendingFloorCreations.add(reservationKey);
        this.mapEditorModeManager
            .executeCommand(
                new CreateEntityFrontCommand(wamFile, uuidv4(), entityData, undefined, this.entitiesManager, {
                    width,
                    height,
                }),
            )
            .finally(() => {
                this.pendingFloorCreations.delete(reservationKey);
            })
            .catch((error: unknown) => {
                const cause = asError(error);
                console.error("Failed to paint floor tile", {
                    error: cause,
                    prefabRef: entityData.prefabRef,
                    x: topLeftPos.x,
                    y: topLeftPos.y,
                });
                Sentry.captureException(cause);
            });
    }

    private stopFloorStroke(): void {
        this.floorStroke = undefined;
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
