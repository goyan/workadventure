import * as Phaser from "phaser";
import type { EntityPrefab } from "@workadventure/map-editor";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import type { GameScene } from "../../GameScene";
import type { EntitiesManager } from "../../GameMap/EntitiesManager";
import { EntitiesManagerEvent } from "../../GameMap/EntitiesManager";
import {
    entityPlacementBlockerStore,
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
import { UpdateEntityFrontCommand } from "../Commands/Entity/UpdateEntityFrontCommand";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import { TexturesHelper } from "../../../Helpers/TexturesHelper";
import type { Entity } from "../../../ECS/Entity";
import { isMapLayerPrefab } from "../MapLayer/MapLayerCatalog";
import { armEntityDuplicate } from "../EntityDuplicate";
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
    /** Buttons shown above the selected entity: rotate, bring forward / send backward, then duplicate. */
    private entityButtons: Phaser.GameObjects.Text[] = [];
    /** The entity the buttons are above: they follow it when it moves (drag, undo, another editor). */
    private entityButtonsOwner: Entity | undefined;
    /** Objects of the eraser stroke in progress: hidden at once, deleted as one step to undo on release. */
    private erasedEntities: Entity[] = [];

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
        this.eraseStrokeEntities();
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.eraseStrokeEntities);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.eraseStrokeEntities);
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
        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.eraseStrokeEntities);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.eraseStrokeEntities);
    }

    public destroy(): void {
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.eraseStrokeEntities);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.eraseStrokeEntities);
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
        this.destroyEntityButtons();
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
                    TexturesHelper.loadEntityImage(
                        this.scene,
                        entityPrefab.imagePath,
                        entityPrefab.imagePath,
                        entityPrefab.animation,
                    )
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
                this.entityButtons.forEach((button) => button.setVisible(!dragged));
                if (!dragged) {
                    this.entityOldPositionPreview?.destroy();
                }
            },
        );

        this.mapEditorSelectedEntityStoreUnsubscriber = mapEditorSelectedEntityStore.subscribe((entity) => {
            this.entityOldPositionPreview?.destroy();
            this.destroyEntityButtons();
            if (!entity) {
                return;
            }
            this.createEntityButtons(entity);
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

    private createEntityButtons(entity: Entity): void {
        if (!entity.canEdit) {
            return;
        }
        const buttons: { label: string; onClick: () => void }[] = [];
        if (this.getRotations(entity).length >= 2) {
            buttons.push({
                label: "⟳",
                onClick: () => {
                    this.rotateEntity(entity).catch(console.error);
                },
            });
        }
        if (!isMapLayerPrefab(entity.getPrefab().collectionName, entity.getPrefab().id)) {
            buttons.push(
                {
                    label: "▲",
                    onClick: () => {
                        this.stepEntityDepth(entity, 1).catch(console.error);
                    },
                },
                {
                    label: "▼",
                    onClick: () => {
                        this.stepEntityDepth(entity, -1).catch(console.error);
                    },
                },
            );
        }
        buttons.push({
            label: "⧉",
            onClick: () => armEntityDuplicate(entity),
        });
        this.entityButtons = buttons.map(({ label, onClick }) =>
            this.scene.add
                .text(0, 0, label, {
                    fontSize: "18px",
                    color: "#ffffff",
                    backgroundColor: "#1b2a41",
                    padding: { x: 6, y: 2 },
                })
                .setOrigin(0, 1)
                .setDepth(Number.MAX_SAFE_INTEGER)
                .setInteractive({ cursor: "pointer" })
                .on(Phaser.Input.Events.POINTER_DOWN, onClick),
        );
        this.entityButtonsOwner = entity;
        this.placeEntityButtons();
        this.scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.placeEntityButtons);
        this.scene.markDirty();
    }

    /** Centered above the entity, side by side, wherever the entity is now. */
    private readonly placeEntityButtons = (): void => {
        const entity = this.entityButtonsOwner;
        if (!entity || this.entityButtons.length === 0) {
            return;
        }
        const gap = 4;
        const totalWidth =
            this.entityButtons.reduce((width, button) => width + button.width, 0) +
            gap * (this.entityButtons.length - 1);
        let left = entity.x + entity.displayWidth / 2 - totalWidth / 2;
        for (const button of this.entityButtons) {
            button.setX(left);
            button.setY(entity.y - 8);
            left += button.width + gap;
        }
    };

    private destroyEntityButtons(): void {
        if (this.entityButtonsOwner) {
            this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.placeEntityButtons);
        }
        this.entityButtons.forEach((button) => button.destroy());
        this.entityButtons = [];
        this.entityButtonsOwner = undefined;
    }

    /**
     * Moves the entity over (`direction` 1) or under (-1) the next image it overlaps. Nothing happens when there is no
     * image left to cross in that direction.
     */
    private async stepEntityDepth(entity: Entity, direction: 1 | -1): Promise<void> {
        const range = entity.getDepthStepRange();
        const current = entity.getEntityData().depthStep;
        const next = Math.min(range.up, Math.max(-range.down, current + direction));
        if (next === current) {
            return;
        }
        await this.mapEditorModeManager.executeCommand(
            new UpdateEntityFrontCommand(
                this.scene.getGameMap().getWamFile()!,
                entity.entityId,
                { depthStep: next },
                undefined,
                { depthStep: current },
                this.entitiesManager,
                this.scene,
            ),
        );
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
        entityPlacementBlockerStore.set(undefined);
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
        if (get(mapEditorEntityEraserStore) && this.scene.input.activePointer.leftButtonDown()) {
            // An eraser stroke is one step to undo: the objects disappear now and are deleted together on release.
            if (!this.erasedEntities.includes(entity)) {
                this.erasedEntities.push(entity);
                entity.setVisible(false);
                this.scene.markDirty();
            }
            return;
        }
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

    private readonly eraseStrokeEntities = (): void => {
        const erased = this.erasedEntities;
        if (erased.length === 0) {
            return;
        }
        this.erasedEntities = [];
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile) {
            erased.forEach((entity) => {
                entity.setVisible(true);
                this.entitiesManager.cancelErasing(entity.entityId);
            });
            return;
        }
        this.mapEditorModeManager
            .executeCommands(
                erased.map(
                    (entity) => new DeleteEntityFrontCommand(wamFile, entity.entityId, undefined, this.entitiesManager),
                ),
            )
            .catch((e) => {
                console.error(e);
                // Not deleted after all (deleted meanwhile by another editor, refused): shown again.
                erased
                    .filter((entity) => entity.active)
                    .forEach((entity) => {
                        entity.setVisible(true);
                        this.entitiesManager.cancelErasing(entity.entityId);
                    });
                this.scene.markDirty();
            });
    };
}
