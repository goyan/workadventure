import * as Phaser from "phaser";
import type { EntityPrefab } from "@workadventure/map-editor";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import type { GameScene } from "../../GameScene";
import type { EntitiesManager } from "../../GameMap/EntitiesManager";
import { EntitiesManagerEvent } from "../../GameMap/EntitiesManager";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorEntityFileDroppedStore,
    mapEditorEntityEraserStore,
    mapEditorEntityModeStore,
    mapEditorModeStore,
    mapEditorSelectedEntityDraggedStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
    mapEditorVisibilityStore,
} from "../../../../Stores/MapEditorStore";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import { TexturesHelper } from "../../../Helpers/TexturesHelper";
import type { Entity } from "../../../ECS/Entity";
import { MapEditorTool } from "./MapEditorTool";

import Image = Phaser.GameObjects.Image;

export abstract class EntityRelatedEditorTool extends MapEditorTool {
    private handleDeleteEntity: (entity: Entity) => void;
    protected scene: GameScene;
    protected mapEditorModeManager: MapEditorModeManager;

    protected entitiesManager: EntitiesManager;

    protected entityPrefab: EntityPrefab | undefined;
    protected entityPrefabPreview: Image | undefined;
    protected entityOldPositionPreview: Image | undefined;

    protected mapEditorSelectedEntityPrefabStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEntityEditorModeStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorSelectedEntityStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorSelectedEntityDraggedStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorEntityEraserStoreUnsubscriber: Unsubscriber | undefined;
    private rotateButton: Phaser.GameObjects.Text | undefined;

    protected constructor(mapEditorModeManager: MapEditorModeManager) {
        super();
        this.mapEditorModeManager = mapEditorModeManager;
        this.scene = this.mapEditorModeManager.getScene();

        this.entitiesManager = this.scene.getGameMapFrontWrapper().getEntitiesManager();

        this.entityPrefab = undefined;
        this.entityPrefabPreview = undefined;
        this.entityOldPositionPreview = undefined;

        this.handleDeleteEntity = this.deleteEntity.bind(this);
    }

    public update(time: number, dt: number): void {}

    public clear(): void {
        this.scene.input.topOnly = false;
        mapEditorEntityModeStore.set("ADD");
        mapEditorEntityEraserStore.set(false);
        mapEditorSelectedEntityStore.set(undefined);
        this.entitiesManager.clearAllEntitiesTint();
        this.entitiesManager.clearAllEntitiesEditOutlines();
        this.cleanPreview();
        this.unsubscribeToStores();
        this.entitiesManager.off(EntitiesManagerEvent.DeleteEntity, this.handleDeleteEntity);
    }

    public activate(): void {
        this.scene.input.topOnly = true;
        this.entitiesManager.makeAllEntitiesInteractive();
        mapEditorVisibilityStore.set(true);

        this.subscribeToStores();
        this.entitiesManager.on(EntitiesManagerEvent.DeleteEntity, this.handleDeleteEntity);
    }

    public destroy(): void {
        this.cleanPreview();
        this.unsubscribeToStores();
        this.entitiesManager.off(EntitiesManagerEvent.DeleteEntity, this.handleDeleteEntity);
    }

    public subscribeToGameMapFrontWrapperEvents(gameMapFrontWrapper: GameMapFrontWrapper): void {
        console.info("EntityEditorTool subscribeToGameMapFrontWrapperEvents");
    }

    public handleKeyDownEvent(event: KeyboardEvent): void {
        switch (event.key.toLowerCase()) {
            case "escape": {
                if (get(mapEditorEntityModeStore) === "EDIT") {
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                    mapEditorSelectedEntityStore.set(undefined);
                    mapEditorEntityModeStore.set("ADD");
                    return;
                }
                if (get(mapEditorEntityModeStore) === "ADD") {
                    this.cleanPreview();
                    return;
                }
                break;
            }
            case "backspace":
            case "delete": {
                get(mapEditorSelectedEntityStore)?.delete();
                mapEditorSelectedEntityStore.set(undefined);
                mapEditorEntityModeStore.set("ADD");
                break;
            }
        }
    }

    protected unsubscribeToStores(): void {
        this.mapEditorSelectedEntityPrefabStoreUnsubscriber?.();
        this.mapEntityEditorModeStoreUnsubscriber?.();
        this.mapEditorSelectedEntityStoreUnsubscriber?.();
        this.mapEditorSelectedEntityDraggedStoreUnsubscriber?.();
        this.mapEditorEntityEraserStoreUnsubscriber?.();
        this.destroyRotateButton();
    }

    protected subscribeToStores(): void {
        this.mapEditorSelectedEntityPrefabStoreUnsubscriber = mapEditorSelectedEntityPrefabStore.subscribe(
            (entityPrefab: EntityPrefab | undefined): void => {
                this.entityPrefab = entityPrefab;
                if (entityPrefab) {
                    // Picking an object to place leaves the eraser.
                    mapEditorEntityEraserStore.set(false);
                }
                if (!entityPrefab) {
                    this.entityPrefabPreview?.destroy();
                    this.entityPrefabPreview = undefined;
                } else {
                    TexturesHelper.loadEntityImage(this.scene, entityPrefab.imagePath, entityPrefab.imagePath)
                        .then(() => {
                            if (this.entityPrefabPreview) {
                                this.entityPrefabPreview.setTexture(entityPrefab.imagePath);
                            } else {
                                const pointer = this.scene.input.activePointer;
                                this.entityPrefabPreview = this.scene.add.image(
                                    Math.floor(pointer.worldX),
                                    Math.floor(pointer.worldY),
                                    entityPrefab.imagePath,
                                );
                            }
                            this.scene.markDirty();
                        })
                        .catch(() => {
                            console.error("COULD NOT LOAD THE ENTITY PREVIEW TEXTURE");
                        });
                }
                this.scene.markDirty();
            },
        );

        this.mapEditorEntityEraserStoreUnsubscriber = mapEditorEntityEraserStore.subscribe((eraser) => {
            if (!eraser) {
                return;
            }
            // The eraser works on the objects of the map: nothing is being placed or edited meanwhile.
            this.cleanPreview();
            mapEditorSelectedEntityStore.set(undefined);
            mapEditorEntityModeStore.set("ADD");
        });

        this.mapEditorSelectedEntityDraggedStoreUnsubscriber = mapEditorSelectedEntityDraggedStore.subscribe(
            (dragged) => {
                this.rotateButton?.setVisible(!dragged);
                if (!dragged) {
                    this.entityOldPositionPreview?.destroy();
                }
            },
        );

        this.mapEditorSelectedEntityStoreUnsubscriber = mapEditorSelectedEntityStore.subscribe((entity) => {
            this.entityOldPositionPreview?.destroy();
            this.destroyRotateButton();
            if (!entity) {
                return;
            }
            this.createRotateButton(entity);
            this.entityOldPositionPreview = this.scene.add
                .image(entity.x, entity.y, entity.texture)
                .setOrigin(0)
                .setAlpha(0.5);
        });

        this.mapEntityEditorModeStoreUnsubscriber = mapEditorEntityModeStore.subscribe((mode) => {
            if (!get(mapEditorModeStore)) {
                return;
            }
            switch (mode) {
                case "ADD": {
                    this.entitiesManager.makeAllEntitiesInteractive();
                    break;
                }
                case "EDIT": {
                    this.entitiesManager.makeAllEntitiesInteractive();
                    this.cleanPreview();
                    break;
                }
            }
        });
    }

    /**
     * Prefabs sharing the color of the entity prefab, one per available direction (e.g. the sides of a chair).
     */
    private getRotations(entity: Entity): EntityPrefab[] {
        const prefab = entity.getPrefab();
        const variant = get(this.scene.getEntitiesCollectionsManager().getEntitiesPrefabsVariantStore()).find(
            (entityVariant) => entityVariant.prefabIds.includes(prefab.id),
        );
        return variant?.getEntityPrefabsPositions(prefab.color) ?? [];
    }

    private createRotateButton(entity: Entity): void {
        if (!entity.canEdit || this.getRotations(entity).length < 2) {
            return;
        }
        this.rotateButton = this.scene.add
            .text(entity.x + entity.displayWidth / 2, entity.y - 8, "⟳", {
                fontSize: "18px",
                color: "#ffffff",
                backgroundColor: "#1b2a41",
                padding: { x: 6, y: 2 },
            })
            .setOrigin(0.5, 1)
            .setDepth(Number.MAX_SAFE_INTEGER)
            .setInteractive({ cursor: "pointer" })
            .on(Phaser.Input.Events.POINTER_DOWN, () => {
                this.rotateEntity(entity).catch((e) => console.error(e));
            });
        this.scene.markDirty();
    }

    private destroyRotateButton(): void {
        this.rotateButton?.destroy();
        this.rotateButton = undefined;
    }

    private async rotateEntity(entity: Entity): Promise<void> {
        const rotations = this.getRotations(entity);
        const wamFile = this.scene.getGameMap().getWamFile();
        if (rotations.length < 2 || !wamFile) {
            return;
        }
        const current = rotations.findIndex((rotation) => rotation.id === entity.getPrefab().id);
        const next = rotations[(current + 1) % rotations.length];
        const data = structuredClone(entity.getEntityData());
        await this.mapEditorModeManager.executeCommands([
            new DeleteEntityFrontCommand(wamFile, entity.entityId, undefined, this.entitiesManager),
            new CreateEntityFrontCommand(
                wamFile,
                entity.entityId,
                { ...data, prefabRef: { collectionName: next.collectionName, id: next.id } },
                undefined,
                this.entitiesManager,
                { width: entity.width, height: entity.height },
            ),
        ]);
        const rotated = this.entitiesManager.getEntities().get(entity.entityId);
        if (rotated) {
            mapEditorSelectedEntityStore.set(rotated);
        }
    }

    protected cleanPreview(): void {
        this.entityPrefabPreview?.destroy();
        this.entityPrefabPreview = undefined;
        this.entityPrefab = undefined;
        mapEditorCopiedEntityDataPropertiesStore.set(undefined);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorEntityFileDroppedStore.set(false);
        this.scene.markDirty();
    }

    protected getEntityPrefabAlignWithGridOffset(): { x: number; y: number } {
        if (!this.entityPrefab || !this.entityPrefabPreview) {
            return { x: 0, y: 0 };
        }
        const collisionGrid = this.entityPrefab.collisionGrid;
        if (collisionGrid && collisionGrid.length > 0) {
            return {
                x: collisionGrid[0].length % 2 === 1 ? 16 : 0,
                y: collisionGrid.length % 2 === 1 ? 16 : 0,
            };
        }
        return {
            x: Math.floor(this.entityPrefabPreview.displayWidth / 32) % 2 === 1 ? 16 : 0,
            y: Math.floor(this.entityPrefabPreview.displayHeight / 32) % 2 === 1 ? 16 : 0,
        };
    }

    private deleteEntity(entity: Entity) {
        this.mapEditorModeManager
            .executeCommand(
                new DeleteEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    entity.entityId,
                    undefined,
                    this.entitiesManager,
                ),
            )
            .catch((e) => console.error(e));
    }
}
