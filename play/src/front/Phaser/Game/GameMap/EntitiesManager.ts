import * as Phaser from "phaser";
import type { EntityData, WAMEntityData } from "@workadventure/map-editor";
import {
    Season,
    WeatherType,
    AreaDataProperties,
    EntityDataProperties,
    EntityDimensions,
    EntityPrefabRef,
} from "@workadventure/map-editor";
import type { EntityPrefab } from "@workadventure/map-editor";
import { withNewPropertyIds } from "@workadventure/map-editor/src/Utils";
import type { Observable } from "rxjs";
import { Subject } from "rxjs";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import { z } from "zod";
import * as Sentry from "@sentry/svelte";
import { treeSeasonAt } from "@wa/front/Phaser/Game/Nature/SeasonClock";
import { weatherAtTime } from "../Weather/WeatherFrame";
import { shownWeatherSettings } from "../Weather/RealWeatherClient";
import { snowCoverage } from "../Weather/SnowCover";
import { entityPlacementBlockerStore } from "../../../Stores/MapEditorStore";
import { getTileCollisionGrid, reverseCollisionGrid } from "../../../Utils/EntityHitbox";
import { actionsMenuStore } from "../../../Stores/ActionsMenuStore";
import {
    mapEditorEntityEraserStore,
    mapEditorEntityModeStore,
    mapEditorModeStore,
    mapEditorSelectedEntityDraggedStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
    mapEditorSelectedToolStore,
    mapEditorSnapEnabledStore,
} from "../../../Stores/MapEditorStore";
import { isMapLayerPrefab } from "../MapEditor/MapLayer/MapLayerCatalog";
import { isPlacementFree, shouldSnapToGrid } from "../MapEditor/EntityPlacementSnapping";
import { Entity, EntityEvent } from "../../ECS/Entity";
import { TexturesHelper } from "../../Helpers/TexturesHelper";
import type { GameScene } from "../GameScene";
import { EditorToolName } from "../MapEditor/MapEditorModeManager";
import { clickSelectsEntity } from "../MapEditor/EntityClickIntent";
import type { GameMapFrontWrapper } from "./GameMapFrontWrapper";

import EventEmitter = Phaser.Events.EventEmitter;
import Key = Phaser.Input.Keyboard.Key;
import Pointer = Phaser.Input.Pointer;

export const CopyEntityEventData = z.object({
    position: z.object({
        x: z.number(),
        y: z.number(),
    }),
    prefabRef: EntityPrefabRef,
    properties: EntityDataProperties.optional(),
    entityDimensions: EntityDimensions,
});

export const CopyAreaEventData = z.object({
    position: z.object({
        x: z.number(),
        y: z.number(),
    }),
    width: z.number(),
    height: z.number(),
    name: z.string(),
    description: z.string(),
    properties: AreaDataProperties.optional(),
});

export type CopyEntityEventData = z.infer<typeof CopyEntityEventData>;
export type CopyAreaEventData = z.infer<typeof CopyAreaEventData>;

export enum EntitiesManagerEvent {
    DeleteEntity = "EntitiesManagerEvent:DeleteEntity",
    UpdateEntity = "EntitiesManagerEvent:UpdateEntity",
    CopyEntity = "EntitiesManagerEvent:CopyEntity",
}

/**
 * Releasing a dragged object with one of these keys drops a copy of it. Cmd and Option count on a Mac, where
 * Ctrl+click is the secondary click.
 */
function isCopyModifier(event: MouseEvent | TouchEvent | WheelEvent | undefined): boolean {
    return event !== undefined && (event.ctrlKey || event.metaKey || event.altKey);
}

/** Opacity of the entities that are not the subject of the map editor tool in use. */
const DIMMED_ENTITY_ALPHA = 0.4;
// Floors and walls are made of sprites that overlap: fading each of them with an alpha stacks the opacity where they
// overlap and draws a grid. They are darkened with a tint instead, which stays uniform.
const DIMMED_MAP_LAYER_TINT = 0x808080;

export class EntitiesManager extends EventEmitter {
    private season = Season.Summer;
    private nextSeasonCheck = 0;
    private lastConfiguredWeather: WeatherType | undefined;
    private lastForcedSeason: Season | undefined;
    private lastMapSnow = true;
    private readonly erasingEntityIds = new Set<string>();
    private shouldDimEntity: ((entity: Entity) => boolean) | undefined;
    private scene: GameScene;
    private gameMapFrontWrapper: GameMapFrontWrapper;

    private shiftKey?: Key;
    private ctrlKey?: Key;

    private entities: Map<string, Entity>;
    private activatableEntities: Entity[];

    private properties: Map<string, string | boolean | number>;
    private actionsMenuStoreUnsubscriber: Unsubscriber;

    /**
     * Firing on map change, containing newest collision grid array
     */
    private pointerOverEntitySubject = new Subject<Entity>();
    private pointerOutEntitySubject = new Subject<Entity>();

    constructor(scene: GameScene, gameMapFrontWrapper: GameMapFrontWrapper) {
        super();
        this.scene = scene;
        this.gameMapFrontWrapper = gameMapFrontWrapper;
        this.shiftKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.ctrlKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
        this.entities = new Map<string, Entity>();
        this.activatableEntities = [];
        this.properties = new Map<string, string | boolean | number>();

        // clear properties immediately on every ActionsMenu change
        this.actionsMenuStoreUnsubscriber = actionsMenuStore.subscribe((data) => {
            this.clearProperties();
            this.gameMapFrontWrapper.handleEntityActionTrigger();
        });

        // When the GameScene is loaded (connection established, etc.), we update all entities
        this.scene.sceneReadyToStartPromise
            .then(() => {
                this.makeAllEntitiesInteractive(true);
            })
            .catch((e) => {
                console.error(e);
                Sentry.captureException(e);
            });

        this.bindEventHandlers();
    }

    public async addEntity(
        entityId: string,
        data: WAMEntityData,
        imagePathPrefix?: string,
        interactive?: boolean,
        withGridUpdate?: boolean,
    ): Promise<Entity> {
        const prefab = await this.scene
            .getEntitiesCollectionsManager()
            .getEntityPrefab(data.prefabRef.collectionName, data.prefabRef.id);
        if (prefab === undefined) {
            console.warn(`Could not find entity ${data.prefabRef.id} in collection ${data.prefabRef.collectionName}`);
            return Promise.reject(
                new Error(`Could not find entity ${data.prefabRef.id} in collection ${data.prefabRef.collectionName}`),
            );
        }

        const entity = new Entity(this.scene, entityId, data, prefab);
        entity.setVisible(false);
        entity.setSeason(this.season);

        TexturesHelper.loadEntityImage(
            this.scene,
            prefab.imagePath,
            `${imagePathPrefix ?? ""}${prefab.imagePath}`,
            prefab.animation,
        )
            .then(() => {
                const entity = this.entities.get(entityId);
                if (entity) {
                    entity.showPrefabTexture().setVisible(true);
                    const seasonal = entity.getPrefab().seasonal;
                    if (seasonal) {
                        for (const path of new Set(Object.values(seasonal))) {
                            this.scene.superLoad
                                .image(path, `${imagePathPrefix ?? ""}${path}`)
                                .then(() => {
                                    // A load may complete after deletion or replacement of this entity.
                                    if (entity.active && this.entities.get(entityId) === entity) {
                                        entity.setSeason(this.season);
                                        this.scene.markDirty();
                                    }
                                })
                                .catch((error: unknown) => Sentry.captureException(error));
                        }
                    }
                    entity.updateDepth();
                    this.refreshObjectsDepth(entity);
                    if (get(mapEditorSelectedEntityStore)?.entityId === entityId) {
                        mapEditorSelectedEntityStore.set(entity);
                    }
                }
            })
            .catch((e) => console.error(e));

        if (interactive) {
            entity.setInteractive({ pixelPerfect: true, cursor: "pointer" });
            this.scene.input.setDraggable(entity);
        }

        this.bindEntityEventHandlers(entity);

        // Off the grid or wandering, the object blocks with rectangles instead (EntityHitbox).
        const colGrid = this.getTileCollisionGrid(entity);
        if (colGrid) {
            this.gameMapFrontWrapper.modifyToCollisionsLayer(entity.x, entity.y, "0", colGrid, withGridUpdate);
        }
        this.gameMapFrontWrapper.addEntityCollisionRectangles(entity);

        this.entities.set(entityId, entity);
        this.applyEntityDimming(entity);

        // We use the promise to be sure that the entity is fully loaded before we check if it is activatable and push it to the activatableEntities array
        this.scene
            .getEntityPermissionsPromise()
            .then(() => {
                if (entity.isActivatable()) {
                    this.activatableEntities.push(entity);
                }
            })
            .catch((e) => {
                console.error(e);
            });

        this.scene.markDirty();
        if (get(mapEditorSelectedEntityStore)?.entityId === entityId) {
            mapEditorSelectedEntityStore.set(entity);
        }
        return entity;
    }

    /**
     * Follow shared weather each minute, and apply a live editor change immediately. The personal seasonal theme
     * colours nature for this person only; shared snow cover takes priority over it, unless `mapSnow` is false
     * (weather hidden, or a theme chosen rather than auto: see mapSnowShown).
     */
    public updateSeason(time: number, serverDate: Date | undefined, forcedSeason?: Season, mapSnow = true): void {
        if (!serverDate || !Number.isFinite(serverDate.getTime())) return;
        const settings = shownWeatherSettings(this.scene.getGameMap().getWamFile()?.getWam().settings, serverDate);
        const configured = settings?.weather ?? WeatherType.Clear;
        if (
            time < this.nextSeasonCheck &&
            configured === this.lastConfiguredWeather &&
            forcedSeason === this.lastForcedSeason &&
            mapSnow === this.lastMapSnow
        )
            return;
        this.lastConfiguredWeather = configured;
        this.lastForcedSeason = forcedSeason;
        this.lastMapSnow = mapSnow;
        this.nextSeasonCheck = time + 60_000 - (serverDate.getTime() % 60_000);
        const weatherSeason = mapSnow
            ? treeSeasonAt(
                  serverDate,
                  weatherAtTime(configured, serverDate, settings?.weatherAuto),
                  snowCoverage(
                      configured,
                      serverDate.getTime(),
                      settings?.weatherStartedAt,
                      settings?.weatherAuto,
                      settings?.snowMeltFrom,
                  ),
              )
            : treeSeasonAt(serverDate, WeatherType.Clear, 0);
        // Snow cover takes priority over autumn's personal colour palette, just as it does on the ground.
        const season = weatherSeason === Season.Winter ? Season.Winter : (forcedSeason ?? weatherSeason);
        if (season === this.season) return;
        this.season = season;
        for (const entity of this.entities.values()) entity.setSeason(season);
        this.scene.markDirty();
    }

    /** The grid written to the tile collision layer for the entity (EntityHitbox); none without a blocking cell. */
    private getTileCollisionGrid(entity: Entity): number[][] | undefined {
        const prefab = entity.getPrefab();
        if (!prefab.collisionGrid?.some((row) => row.includes(1))) {
            return undefined;
        }
        return getTileCollisionGrid(entity, prefab, this.gameMapFrontWrapper.getTileDimensions().width);
    }

    public deleteEntity(id: string): boolean {
        this.erasingEntityIds.delete(id);
        const entity = this.entities.get(id);
        if (!entity) {
            console.warn(`Entity ${id} already deleted`);
            return false;
        }

        if (entity.isActivatable()) {
            const index = this.activatableEntities.findIndex((entity) => entity.entityId === id);
            if (index !== -1) {
                this.activatableEntities.splice(index, 1);
            }
        }

        const colGrid = this.getTileCollisionGrid(entity);
        if (colGrid) {
            this.gameMapFrontWrapper.modifyToCollisionsLayer(entity.x, entity.y, "0", reverseCollisionGrid(colGrid));
        }
        this.gameMapFrontWrapper.removeEntityCollisionRectangles(id);
        const overlappingEntities = entity.getOverlappingEntities();
        entity.destroy();
        this.scene.markDirty();

        const deleted = this.entities.delete(id);
        for (const overlappingEntity of overlappingEntities) {
            overlappingEntity.updateDepth();
        }
        return deleted;
    }

    /**
     * Run once a map edit is done: an object deleted meanwhile (an undo, another editor) closes its properties, an
     * object replaced under the same id (a rotation, a resize) keeps them, on the new instance.
     */
    public syncSelectionWithMap(): void {
        const selected = get(mapEditorSelectedEntityStore);
        if (!selected) {
            return;
        }
        const current = this.entities.get(selected.entityId);
        if (current === selected) {
            return;
        }
        if (current) {
            mapEditorSelectedEntityStore.set(current);
            return;
        }
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorEntityModeStore.set("ADD");
    }

    public deleteEntities(idsToRemove: string[]): boolean {
        const removedEntitiesStatus: boolean[] = idsToRemove.map((id) => this.deleteEntity(id));
        return removedEntitiesStatus.every(Boolean);
    }

    /**
     * An object that appears, moves or disappears changes how the entities overlapping it stack against it
     * (an object sorted above its foot against a wall, an object standing on a table).
     */
    private refreshObjectsDepth(changedEntity: Entity): void {
        for (const entity of changedEntity.getOverlappingEntities()) {
            entity.updateDepth();
        }
    }

    /**
     * A custom image was edited: its placed copies take the new prefab, then their depth and their collision
     * rectangles are rebuilt from it (the 32px grid is recomputed by the caller for the whole map).
     */
    public updateEntitiesPrefab(modifiedEntityPrefabId: string, modification: Partial<EntityPrefab>) {
        for (const entity of this.getEntities().values()) {
            if (entity.getPrefab().id !== modifiedEntityPrefabId) continue;
            entity.setPrefab({ ...entity.getPrefab(), ...modification });
            this.gameMapFrontWrapper.addEntityCollisionRectangles(entity);
        }
    }

    public getProperties(): Map<string, string | boolean | number> {
        return this.properties;
    }

    /**
     * Fades the entities matching the predicate (undefined: none), so that the tool in use stands out.
     * Entities added later, e.g. by another editor, follow the same rule.
     */
    public setEntitiesDimming(shouldDim: ((entity: Entity) => boolean) | undefined): void {
        this.shouldDimEntity = shouldDim;
        this.entities.forEach((entity) => this.applyEntityDimming(entity));
        this.scene.markDirty();
    }

    private applyEntityDimming(entity: Entity): void {
        const dimmed = this.shouldDimEntity?.(entity) === true;
        const prefab = entity.getPrefab();
        if (isMapLayerPrefab(prefab.collectionName, prefab.id)) {
            entity.setAlpha(1);
            if (dimmed) {
                entity.setTint(DIMMED_MAP_LAYER_TINT);
            } else {
                entity.clearTint();
            }
            return;
        }
        entity.setAlpha(dimmed ? DIMMED_ENTITY_ALPHA : 1);
    }

    public clearAllEntitiesTint(): void {
        this.entities.forEach((entity) => {
            entity.clearTint();
            this.applyEntityDimming(entity);
        });
    }

    public clearAllEntitiesEditOutlines(): void {
        this.entities.forEach((entity) => entity.removeEditColor());
        this.entities.forEach((entity) => entity.removePointedToEditColor());
    }

    public makeAllEntitiesNonInteractive(): void {
        this.entities.forEach((entity) => {
            entity.disableInteractive();
        });
    }

    public makeAllEntitiesInteractive(activatableOnly = false): void {
        const entities = activatableOnly
            ? Array.from(this.entities.values()).filter((entity) => entity.isActivatable())
            : this.entities;
        entities.forEach((entity) => {
            entity.setInteractive({ pixelPerfect: true, cursor: "pointer" });
            this.scene.input.setDraggable(entity);
        });
    }

    private bindEventHandlers(): void {
        // Phaser unsubscribes from the keyboard events when the scene is destroyed, so we don't need to unsubscribe here
        // eslint-disable-next-line listeners/no-missing-remove-event-listener,listeners/no-inline-function-event-listener
        this.ctrlKey?.on("down", () => {
            if (!this.scene.input.activePointer.leftButtonDown()) {
                return;
            }
            const entity = get(mapEditorSelectedEntityStore);
            if (!entity) {
                return;
            }
            this.scene.input.setDefaultCursor("copy");
        });
        // Phaser unsubscribes from the keyboard events when the scene is destroyed, so we don't need to unsubscribe here
        // eslint-disable-next-line listeners/no-missing-remove-event-listener,listeners/no-inline-function-event-listener
        this.ctrlKey?.on("up", () => {
            this.scene.input.setDefaultCursor("auto");
        });

        // Phaser unsubscribes from the keyboard events when the scene is destroyed, so we don't need to unsubscribe here

        this.shiftKey?.on(Phaser.Input.Keyboard.Events.DOWN, () => {
            const entity = get(mapEditorSelectedEntityStore);
            if (!entity) {
                return;
            }
            this.changeEntityTint(entity);
        });

        // Phaser unsubscribes from the keyboard events when the scene is destroyed, so we don't need to unsubscribe here

        this.shiftKey?.on(Phaser.Input.Keyboard.Events.UP, () => {
            const entity = get(mapEditorSelectedEntityStore);
            if (!entity) {
                return;
            }
            this.changeEntityTint(entity);
        });
    }

    private bindEntityEventHandlers(entity: Entity): void {
        entity.on(EntityEvent.Delete, () => {
            this.emit(EntitiesManagerEvent.DeleteEntity, entity);
        });
        // get the type! Switch to rxjs?
        entity.on(
            EntityEvent.PropertyActivated,
            (...datas: { propertyName: string; propertyValue: string | number | boolean }[]) => {
                datas.forEach((data) => this.properties.set(data.propertyName, data.propertyValue));
                this.gameMapFrontWrapper.handleEntityActionTrigger();
            },
        );
        entity.on(EntityEvent.Updated, (data: EntityData) => {
            this.emit(EntitiesManagerEvent.UpdateEntity, data);
        });
        entity.on(Phaser.Input.Events.DRAG, (pointer: Pointer, dragX: number, dragY: number) => {
            if (!entity.canEdit) {
                return;
            }
            if (
                get(mapEditorModeStore) &&
                this.isEntityEditorToolActive() &&
                get(mapEditorEntityModeStore) === "EDIT"
            ) {
                const depthOffset = entity.getPrefab().depthOffset ?? 0;
                const tileDim = this.scene.getGameMapFrontWrapper().getTileDimensions();
                const snapToGrid = this.isSnappingToGrid();
                entity.x = snapToGrid ? Math.floor(dragX / tileDim.width) * tileDim.width : Math.floor(dragX);
                entity.y = snapToGrid ? Math.floor(dragY / tileDim.height) * tileDim.height : Math.floor(dragY);
                entity.updateDepth(depthOffset);

                this.changeEntityTint(entity);
            }
        });
        entity.on(Phaser.Input.Events.DRAG_END, (pointer: Pointer, dragX: number, dragY: number) => {
            entityPlacementBlockerStore.set(undefined);
            if (
                get(mapEditorModeStore) &&
                this.isEntityEditorToolActive() &&
                get(mapEditorEntityModeStore) === "EDIT"
            ) {
                mapEditorSelectedEntityDraggedStore.set(false);
                if (
                    !this.scene
                        .getGameMapFrontWrapper()
                        .canEntityBePlacedOnMap(
                            entity.getTopLeft(),
                            entity.displayWidth,
                            entity.displayHeight,
                            entity.getCollisionGrid(),
                            entity.getOldPosition(),
                            this.isFreePlacement(),
                        )
                ) {
                    const oldPos = entity.getOldPosition();
                    entity.setPosition(oldPos.x, oldPos.y);
                    entity.clearTint();
                } else {
                    if (this.ctrlKey?.isDown || isCopyModifier(pointer.event)) {
                        this.copyEntity(entity);
                    } else {
                        const data: Partial<EntityData> = {
                            id: entity.entityId,
                            x: entity.x,
                            y: entity.y,
                        };
                        this.emit(EntitiesManagerEvent.UpdateEntity, data);
                    }
                }
                this.refreshObjectsDepth(entity);
                this.scene.markDirty();
            }
        });
        entity.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Pointer) => {
            if (pointer.downElement?.tagName !== "CANVAS") {
                return;
            }
            // A right click (Ctrl+click on a Mac) drops the object being placed: it does not open the one under it.
            if (pointer.button !== 0 || pointer.rightButtonDown()) {
                return;
            }

            // The selection, area and floor/wall tools own the pointer: objects must not be interactive while they are active.
            const selectedTool = get(mapEditorSelectedToolStore);
            if (
                selectedTool === EditorToolName.SelectionEditor ||
                selectedTool === EditorToolName.AreaEditor ||
                selectedTool === EditorToolName.MapLayerEditor
            ) {
                return;
            }

            if (!entity.canEdit) {
                return;
            }

            // If the entity is not editable and the entity editor tool is not active, switch automatically to entity editor tool
            if (
                get(mapEditorModeStore) &&
                get(mapEditorSelectedToolStore) != EditorToolName.ExploreTheRoom &&
                this.isEntityEditorToolActive() == false
            ) {
                // Activate entity editor tool
                this.scene.getMapEditorModeManager()?.equipTool(EditorToolName.EntityEditor);
            }

            if (
                get(mapEditorModeStore) &&
                clickSelectsEntity(
                    get(mapEditorSelectedEntityPrefabStore),
                    entity.getPrefab(),
                    this.shiftKey?.isDown ?? false,
                )
            ) {
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }

                if (get(mapEditorEntityEraserStore)) {
                    // The eraser of the entity tool deletes the object instead of selecting it.
                    this.eraseEntity(entity);
                    return;
                }

                mapEditorEntityModeStore.set("EDIT");
                mapEditorSelectedEntityDraggedStore.set(true);
                mapEditorSelectedEntityStore.set(entity);
            }
        });
        entity.on(Phaser.Input.Events.POINTER_OVER, (pointer: Pointer) => {
            this.pointerOverEntitySubject.next(entity);
            if (get(mapEditorModeStore)) {
                if (!entity.canEdit) {
                    return;
                }
                if (this.isEntityEditorToolActive()) {
                    const eraser = get(mapEditorEntityEraserStore);
                    entity.setPointedToEditColor(eraser ? 0xff0000 : 0x00ff00);
                    this.scene.markDirty();
                    // Dragging over objects with the button down erases them.
                    if (eraser && pointer.leftButtonDown()) {
                        this.eraseEntity(entity);
                    }
                }
                if (this.isExplorerToolActive()) {
                    entity.setPointedToEditColor(0xf9e82d);
                    this.scene.markDirty();
                }
            }
        });
        entity.on(Phaser.Input.Events.POINTER_OUT, () => {
            this.pointerOutEntitySubject.next(entity);
            if (get(mapEditorModeStore)) {
                if (this.isEntityEditorToolActive() || this.isExplorerToolActive()) {
                    entity.removePointedToEditColor();
                    this.scene.markDirty();
                }
            }
        });
    }

    private copyEntity(entity: Entity): void {
        const positionToPlaceCopyAt = { ...entity.getPosition() };
        const oldPos = entity.getOldPosition();
        entity.setPosition(oldPos.x, oldPos.y);
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        mapEditorSelectedEntityStore.set(undefined);
        const eventData: CopyEntityEventData = {
            position: positionToPlaceCopyAt,
            prefabRef: entity.getEntityData().prefabRef,
            properties: withNewPropertyIds(entity.getEntityData().properties ?? []),
            entityDimensions: { width: entity.width, height: entity.height },
        };
        this.emit(EntitiesManagerEvent.CopyEntity, eventData);
    }

    private isSnappingToGrid(): boolean {
        return shouldSnapToGrid(get(mapEditorSnapEnabledStore), this.shiftKey?.isDown ?? false);
    }

    private isFreePlacement(): boolean {
        return isPlacementFree(get(mapEditorSnapEnabledStore), this.shiftKey?.isDown ?? false);
    }

    private changeEntityTint(entity: Entity): void {
        const blocker = this.scene
            .getGameMapFrontWrapper()
            .getPlacementBlocker(
                entity.getTopLeft(),
                entity.displayWidth,
                entity.displayHeight,
                entity.getCollisionGrid(),
                entity.getOldPosition(),
                this.isFreePlacement(),
            );
        entityPlacementBlockerStore.set(blocker);
        if (blocker !== undefined) {
            entity.setTint(0xff0000);
        } else {
            if (this.isFreePlacement()) {
                entity.setTint(0xffa500);
            } else {
                entity.clearTint();
            }
        }
        this.scene.markDirty();
    }

    private eraseEntity(entity: Entity): void {
        const prefab = entity.getPrefab();
        // Floors and walls of the map layer are erased with the Map tool, which keeps their joints consistent.
        if (isMapLayerPrefab(prefab.collectionName, prefab.id) || this.erasingEntityIds.has(entity.entityId)) {
            return;
        }
        this.erasingEntityIds.add(entity.entityId);
        entity.delete();
    }

    /** The eraser may erase this object again: its deletion did not happen. */
    public cancelErasing(entityId: string): void {
        this.erasingEntityIds.delete(entityId);
    }

    private isEntityEditorToolActive(): boolean {
        return get(mapEditorSelectedToolStore) === EditorToolName.EntityEditor;
    }

    private isExplorerToolActive(): boolean {
        return get(mapEditorSelectedToolStore) === EditorToolName.ExploreTheRoom;
    }

    public getEntities(): Map<string, Entity> {
        return this.entities;
    }

    public getEntitiesInsideArea(areaId: string): Map<string, Entity> {
        const entitiesInsideArea = new Map<string, Entity>();
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        const area = this.scene.getGameMap().getWamFile()?.getGameMapAreas().getArea(areaId);
        if (area === undefined) {
            return entitiesInsideArea;
        }

        this.entities.forEach((entity, entityId) => {
            if (
                gameMapFrontWrapper.isInsideAreaByCoordinates(
                    { x: area.x, y: area.y, width: area.width, height: area.height },
                    {
                        x: entity.getBounds().centerX,
                        y: entity.getBounds().centerY,
                    },
                )
            ) {
                entitiesInsideArea.set(entityId, entity);
            }
        });
        return entitiesInsideArea;
    }

    public getActivatableEntities(): Entity[] {
        return this.activatableEntities;
    }

    public getPointerOverEntityObservable(): Observable<Entity> {
        return this.pointerOverEntitySubject.asObservable();
    }

    public getPointerOutEntityObservable(): Observable<Entity> {
        return this.pointerOutEntitySubject.asObservable();
    }

    public clearProperties(): void {
        this.properties.clear();
    }

    public close() {
        this.actionsMenuStoreUnsubscriber();
    }
}
