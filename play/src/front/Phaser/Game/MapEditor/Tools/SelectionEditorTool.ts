import * as Phaser from "phaser";
import type { AreaData, EntityDimensions, WAMEntityData, WamFile } from "@workadventure/map-editor";
import * as Sentry from "@sentry/svelte";
import type { EditMapCommandMessage } from "@workadventure/messages";
import debug from "debug";
import { asError } from "catch-unknown";
import { get } from "svelte/store";
import { v4 as uuid } from "uuid";
import { userIsAdminStore, userIsEditorStore } from "../../../../Stores/GameStore";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorVisibilityStore,
} from "../../../../Stores/MapEditorStore";
import { mapEditorSelectionStore, type MapEditorSelectionState } from "../../../../Stores/MapEditorSelectionStore";
import { TexturesHelper } from "../../../Helpers/TexturesHelper";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { EntitiesManager } from "../../GameMap/EntitiesManager";
import type { GameScene } from "../../GameScene";
import { DEPTH_MAP_EDITOR_AREAS_INDEX } from "../../DepthIndexes";
import { gameManager } from "../../GameManager";
import { isTextEditingTarget } from "../isTextEditingTarget";
import { isPointerInsideCanvas } from "../MapEditorPointer";
import { CreateAreaFrontCommand } from "../Commands/Area/CreateAreaFrontCommand";
import { DeleteAreaFrontCommand } from "../Commands/Area/DeleteAreaFrontCommand";
import { UpdateAreaFrontCommand } from "../Commands/Area/UpdateAreaFrontCommand";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import { isMapLayerPrefab } from "../MapLayer/MapLayerCatalog";
import { buildMapLayerSyncCommands, readMapLayerEntityStates } from "../MapLayer/MapLayerSync";
import type { MapLayerEntityState } from "../MapLayer/MapLayerSync";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import { UpdateEntityFrontCommand } from "../Commands/Entity/UpdateEntityFrontCommand";
import type { FrontCommand } from "../Commands/FrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { createMapPattern, getMapPattern, MapPatternApiError } from "../MapPatternApi";
import {
    patternErrorCodeOf,
    refreshMapPatterns,
    setArmedPattern,
    setMapPatternError,
    setPatternIgnoredCount,
} from "../MapPatternActions";
import { patternPayloadToPlacement, selectionToPatternPayload } from "../SelectionPattern";
import { MapEditorTool } from "./MapEditorTool";
import type { AreaEditorTool } from "./AreaEditorTool";

interface EntitySelectionItem {
    kind: "entity";
    id: string;
    data: WAMEntityData;
    dimensions: EntityDimensions;
    collisionGrid?: number[][];
    bounds: Phaser.Types.Math.RectangleLike;
}

interface AreaSelectionItem {
    kind: "area";
    id: string;
    data: AreaData;
    bounds: Phaser.Types.Math.RectangleLike;
}

type SelectionItem = EntitySelectionItem | AreaSelectionItem;

interface ClipboardSnapshot {
    items: SelectionItem[];
    bounds: Phaser.Types.Math.RectangleLike;
}

interface RectangleDrag {
    pointerId: number;
    start: Phaser.Types.Math.Vector2Like;
    current: Phaser.Types.Math.Vector2Like;
}

const logger = debug("map-editor:selection");
const SELECTION_COLOR = 0x2474e8;
const PLACEMENT_COLOR = 0x17a673;

export class SelectionEditorTool extends MapEditorTool {
    private readonly scene: GameScene;
    private readonly entitiesManager: EntitiesManager;
    private active = false;
    private selectedEntityIds: string[] = [];
    private selectedAreaIds: string[] = [];
    private selectionRectangle: Phaser.Types.Math.RectangleLike | undefined;
    private clipboard: ClipboardSnapshot | undefined;
    private rectangleDrag: RectangleDrag | undefined;
    private placementPointerId: number | undefined;
    private placementPointerPosition: Phaser.Types.Math.Vector2Like | undefined;
    private graphics: Phaser.GameObjects.Graphics;
    private previousVisualSignature = "";
    private lifecycleVersion = 0;

    private readonly pointerDownEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerDown(pointer);
    };
    private readonly pointerMoveEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerMove(pointer);
    };
    private readonly pointerUpEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerUp(pointer);
    };
    private readonly pointerUpOutsideEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerUpOutside(pointer);
    };
    private readonly gameOutEventHandler = (): void => {
        this.cancelIncompleteGesture();
    };
    private readonly windowBlurEventHandler = (): void => {
        this.cancelIncompleteGesture();
    };

    constructor(
        private readonly mapEditorModeManager: MapEditorModeManager,
        private readonly areaEditorTool: AreaEditorTool,
    ) {
        super();
        this.scene = mapEditorModeManager.getScene();
        this.entitiesManager = this.scene.getGameMapFrontWrapper().getEntitiesManager();
        this.graphics = this.scene.add.graphics().setDepth(DEPTH_MAP_EDITOR_AREAS_INDEX);
        this.graphics.setVisible(false);
    }

    public update(time: number, dt: number): void {
        if (this.active && (this.rectangleDrag || this.isPlacementArmed())) {
            this.drawVisuals();
        }
    }

    public clear(): void {
        this.active = false;
        this.lifecycleVersion += 1;
        this.cancelIncompleteGesture();
        this.cancelPlacement();
        this.selectedEntityIds = [];
        this.selectedAreaIds = [];
        this.selectionRectangle = undefined;
        this.graphics.clear().setVisible(false);
        this.scene.markDirty();
        this.previousVisualSignature = "";
        this.publishState({ entityCount: 0, areaCount: 0, hasRectangle: false, mode: "select", error: undefined });
        this.unbindEventHandlers();
        this.scene.input.setDefaultCursor("auto");
    }

    public activate(): void {
        this.active = true;
        this.graphics.setVisible(true);
        this.scene.input.setTopOnly(false);
        mapEditorVisibilityStore.set(true);
        this.bindEventHandlers();
        this.drawVisuals();
    }

    public destroy(): void {
        this.clear();
        this.clipboard = undefined;
        this.publishState({ hasClipboard: false });
        this.graphics.destroy();
    }

    public subscribeToGameMapFrontWrapperEvents(_gameMapFrontWrapper: GameMapFrontWrapper): void {}

    public handleKeyDownEvent(event: KeyboardEvent): void {
        if (isTextEditingTarget(event.target)) {
            return;
        }

        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && key === "c") {
            event.preventDefault();
            this.copySelection();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && key === "v") {
            event.preventDefault();
            this.pasteSelection();
            return;
        }
        if (key === "delete" || key === "backspace") {
            if (this.selectedEntityIds.length > 0 || this.selectedAreaIds.length > 0) {
                event.preventDefault();
                this.deleteSelection().catch((error: unknown) => {
                    this.reportFailure("delete selection shortcut", error);
                });
            }
            return;
        }
        if (key === "escape") {
            event.preventDefault();
            if (this.isPlacementArmed()) {
                this.cancelPlacement();
            } else {
                this.clearSelection();
            }
        }
    }

    public handleIncomingCommandMessage(_editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        this.refreshSelection();
        return Promise.resolve();
    }

    public copySelection(): void {
        if (this.isBusy()) {
            return;
        }
        this.clearError();
        // Areas are never copied: a copy only carries objects. Move and Delete still act on selected areas.
        const items = this.readSelectedItems()?.filter((item) => item.kind === "entity");
        const bounds = items && this.getUnionBounds(items);
        if (!items || items.length === 0 || !bounds) {
            this.setError("blocked");
            return;
        }
        this.clipboard = { items: structuredClone(items), bounds: { ...bounds } };
        this.publishState({ hasClipboard: true });
    }

    public pasteSelection(): void {
        if (this.isBusy()) {
            return;
        }
        this.clearError();
        if (!this.clipboard || this.clipboard.items.length === 0) {
            this.setError("blocked");
            return;
        }
        this.cancelIncompleteGesture();
        this.publishState({ mode: "paste" });
        this.drawVisuals();
    }

    /**
     * Saves the current selection as a pattern shared with the other editors of the world (Admin API).
     * Resolves to true once the pattern is created, even if the list refresh that follows fails (the store shows it).
     */
    public async saveSelectionAsPattern(name: string): Promise<boolean> {
        if (!this.beginOperation()) {
            return false;
        }
        let created = false;
        try {
            setMapPatternError(undefined);
            const items = this.readSelectedItems()?.filter((item) => item.kind === "entity");
            if (!items || items.length === 0) {
                this.setError("blocked");
                return false;
            }
            const roomUrl = this.getRoomUrl();
            const tileDimensions = this.scene.getGameMapFrontWrapper().getTileDimensions();
            await createMapPattern(roomUrl, name, selectionToPatternPayload(items, tileDimensions));
            created = true;
            await refreshMapPatterns(roomUrl);
        } catch (error: unknown) {
            this.reportPatternFailure("save pattern", error);
        } finally {
            this.endOperation();
        }
        return created;
    }

    /**
     * Loads a shared pattern into the internal clipboard (replacing its content) and enters the Paste mode,
     * like pasteSelection. Items whose prefab is not loaded in the map are ignored and counted.
     */
    public async pasteFromPattern(id: string): Promise<void> {
        if (!this.beginOperation()) {
            return;
        }
        const lifecycleVersion = this.lifecycleVersion;
        try {
            setMapPatternError(undefined);
            setPatternIgnoredCount(0);
            const pattern = await getMapPattern(this.getRoomUrl(), id);
            const collectionsManager = this.scene.getEntitiesCollectionsManager();
            const prefabRefs = pattern.payload.items.flatMap((item) =>
                item.kind === "entity" ? [item.data.prefabRef] : [],
            );
            const knownPrefabs = new Set<string>();
            await Promise.all(
                prefabRefs.map(async ({ collectionName, id: prefabId }) => {
                    if (await collectionsManager.getEntityPrefab(collectionName, prefabId)) {
                        knownPrefabs.add(this.getPrefabKey(collectionName, prefabId));
                    }
                }),
            );
            if (!this.active || lifecycleVersion !== this.lifecycleVersion) {
                return;
            }
            const placement = patternPayloadToPlacement(pattern.payload, {
                isPrefabKnown: (collectionName, prefabId) =>
                    knownPrefabs.has(this.getPrefabKey(collectionName, prefabId)),
            });
            setPatternIgnoredCount(placement.ignoredCount);
            if (placement.items.length === 0) {
                this.setError("blocked");
                return;
            }
            this.clipboard = { items: placement.items, bounds: placement.bounds };
            this.cancelIncompleteGesture();
            this.publishState({ hasClipboard: true, mode: "paste" });
            setArmedPattern(id);
            this.drawVisuals();
        } catch (error: unknown) {
            this.reportPatternFailure("paste pattern", error);
        } finally {
            this.endOperation();
        }
    }

    public moveSelection(): void {
        if (this.isBusy()) {
            return;
        }
        this.clearError();
        const items = this.readSelectedItems();
        if (!items || items.length === 0) {
            this.setError("blocked");
            return;
        }
        this.cancelIncompleteGesture();
        setArmedPattern(undefined);
        this.publishState({ mode: "move" });
        this.drawVisuals();
    }

    public async deleteSelection(): Promise<void> {
        if (!this.beginOperation()) {
            return;
        }
        try {
            const context = this.getMapContext();
            const items = this.readSelectedItems();
            if (!context || !items || items.length === 0) {
                this.setError("blocked");
                return;
            }
            const commands: FrontCommand[] = items.map((item) =>
                item.kind === "entity"
                    ? new DeleteEntityFrontCommand(context.wamFile, item.id, undefined, context.entitiesManager)
                    : new DeleteAreaFrontCommand(
                          context.wamFile,
                          item.id,
                          undefined,
                          this.areaEditorTool,
                          context.gameMapFrontWrapper,
                      ),
            );
            const deletedIds = new Set(items.map((item) => item.id));
            this.appendMapLayerSync(context, commands, items, (states) =>
                states.filter((state) => !deletedIds.has(state.entityId)),
            );
            await this.mapEditorModeManager.executeCommands(commands);
            this.selectedEntityIds = [];
            this.selectedAreaIds = [];
            this.publishSelectionCounts();
            this.drawVisuals();
        } catch (error: unknown) {
            this.reportFailure("delete selection", error);
        } finally {
            this.endOperation();
        }
    }

    public async fillSelection(): Promise<void> {
        if (!this.beginOperation()) {
            return;
        }
        const lifecycleVersion = this.lifecycleVersion;
        try {
            const prefab = get(mapEditorSelectedEntityPrefabStore);
            const properties = get(mapEditorCopiedEntityDataPropertiesStore);
            const copiedProperties = properties ? structuredClone(properties) : undefined;
            const rectangle = this.selectionRectangle;
            const context = this.getMapContext();
            if (!prefab || !rectangle || rectangle.width <= 0 || rectangle.height <= 0 || !context) {
                this.setError("blocked");
                return;
            }

            await TexturesHelper.loadEntityImage(this.scene, prefab.imagePath, prefab.imagePath);
            if (!this.active || lifecycleVersion !== this.lifecycleVersion) {
                return;
            }
            const texture = this.scene.textures.get(prefab.imagePath);
            const frame = texture.get();
            const source = texture.getSourceImage();
            const dimensions: EntityDimensions = {
                width: source.width || frame.width,
                height: source.height || frame.height,
            };
            if (dimensions.width <= 0 || dimensions.height <= 0) {
                this.setError("blocked");
                return;
            }

            const tileDimensions = context.gameMapFrontWrapper.getTileDimensions();
            const stepX = Math.ceil(dimensions.width / tileDimensions.width) * tileDimensions.width;
            const stepY = Math.ceil(dimensions.height / tileDimensions.height) * tileDimensions.height;
            const startX = Math.ceil(rectangle.x / tileDimensions.width) * tileDimensions.width;
            const startY = Math.ceil(rectangle.y / tileDimensions.height) * tileDimensions.height;
            const existingEntities = context.wamFile.getGameMapEntities().getEntities();
            const existingPlacementKeys = new Set(
                Object.values(existingEntities).map((data) =>
                    this.getPrefabPositionKey(data.prefabRef.collectionName, data.prefabRef.id, data.x, data.y),
                ),
            );
            const candidateItems: EntitySelectionItem[] = [];
            const pendingPlacementKeys = new Set<string>();

            for (let y = startY; y + dimensions.height <= rectangle.y + rectangle.height; y += stepY) {
                for (let x = startX; x + dimensions.width <= rectangle.x + rectangle.width; x += stepX) {
                    const placementKey = this.getPrefabPositionKey(prefab.collectionName, prefab.id, x, y);
                    if (existingPlacementKeys.has(placementKey) || pendingPlacementKeys.has(placementKey)) {
                        continue;
                    }
                    const data: WAMEntityData = {
                        x,
                        y,
                        prefabRef: { collectionName: prefab.collectionName, id: prefab.id },
                        properties: copiedProperties ?? [],
                        name: copiedProperties?.find((property) => property.type === "openFile")?.name ?? undefined,
                    };
                    if (
                        !context.gameMapFrontWrapper.canEntityBePlacedOnMap(
                            { x, y },
                            dimensions.width,
                            dimensions.height,
                            prefab.collisionGrid,
                            undefined,
                            true,
                        )
                    ) {
                        this.setError("blocked");
                        return;
                    }
                    pendingPlacementKeys.add(placementKey);
                    candidateItems.push({
                        kind: "entity",
                        id: "",
                        data,
                        dimensions: { ...dimensions },
                        collisionGrid: prefab.collisionGrid,
                        bounds: { x, y, ...dimensions },
                    });
                }
            }

            if (candidateItems.length === 0) {
                return;
            }

            const createdStates: MapLayerEntityState[] = [];
            const commands: FrontCommand[] = candidateItems.map((item) => {
                const id = uuid();
                createdStates.push(this.toMapLayerEntityState(id, item.data));
                return new CreateEntityFrontCommand(
                    context.wamFile,
                    id,
                    item.data,
                    undefined,
                    context.entitiesManager,
                    item.dimensions,
                );
            });
            this.appendMapLayerSync(context, commands, candidateItems, (states) => [...states, ...createdStates]);
            await this.mapEditorModeManager.executeCommands(commands);
            if (this.active && lifecycleVersion === this.lifecycleVersion) {
                this.selectRectangle(rectangle);
            }
        } catch (error: unknown) {
            this.reportFailure("fill selection", error);
        } finally {
            this.endOperation();
        }
    }

    private bindEventHandlers(): void {
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpOutsideEventHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.addEventListener("blur", this.windowBlurEventHandler);
    }

    private unbindEventHandlers(): void {
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpOutsideEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.removeEventListener("blur", this.windowBlurEventHandler);
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        if (!this.active || this.isBusy() || pointer.button !== 0 || !pointer.leftButtonDown()) {
            return;
        }
        if (!this.isCanvasOrigin(pointer)) {
            return;
        }
        if (this.rectangleDrag || (this.placementPointerId !== undefined && this.placementPointerId !== pointer.id)) {
            return;
        }
        if (this.isPlacementArmed()) {
            this.placementPointerId = pointer.id;
            this.placementPointerPosition = { x: pointer.worldX, y: pointer.worldY };
            return;
        }
        const position = { x: pointer.worldX, y: pointer.worldY };
        this.rectangleDrag = { pointerId: pointer.id, start: position, current: position };
        this.scene.input.setDefaultCursor("crosshair");
        this.drawVisuals();
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
        if (!this.active) {
            return;
        }
        if (this.rectangleDrag?.pointerId === pointer.id) {
            if (!pointer.leftButtonDown() || !isPointerInsideCanvas(this.scene, pointer)) {
                this.cancelIncompleteGesture();
                return;
            }
            this.rectangleDrag.current = { x: pointer.worldX, y: pointer.worldY };
            this.drawVisuals();
            return;
        }
        if (this.isPlacementArmed()) {
            if (this.placementPointerId !== undefined && this.placementPointerId !== pointer.id) {
                return;
            }
            this.placementPointerPosition = { x: pointer.worldX, y: pointer.worldY };
            this.drawVisuals();
        }
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        if (!this.active || pointer.button !== 0) {
            return;
        }
        if (this.rectangleDrag?.pointerId === pointer.id) {
            const rectangle = this.getRectangleFromPoints(this.rectangleDrag.start, {
                x: pointer.worldX,
                y: pointer.worldY,
            });
            this.rectangleDrag = undefined;
            this.scene.input.setDefaultCursor("auto");
            if (
                rectangle &&
                rectangle.width > 0 &&
                rectangle.height > 0 &&
                isPointerInsideCanvas(this.scene, pointer)
            ) {
                this.selectRectangle(rectangle);
            } else {
                this.drawVisuals();
            }
            return;
        }
        if (this.placementPointerId === pointer.id) {
            this.placementPointerId = undefined;
            this.placementPointerPosition = { x: pointer.worldX, y: pointer.worldY };
            if (!isPointerInsideCanvas(this.scene, pointer)) {
                this.cancelPlacement();
                return;
            }
            this.confirmPlacement(pointer.worldX, pointer.worldY).catch((error: unknown) => {
                this.reportFailure("place selection", error);
            });
        }
    }

    private handlePointerUpOutside(pointer: Phaser.Input.Pointer): void {
        if (this.rectangleDrag?.pointerId === pointer.id || this.placementPointerId === pointer.id) {
            this.cancelIncompleteGesture();
        }
    }

    private cancelIncompleteGesture(): void {
        const placementWasArmed = this.isPlacementArmed();
        this.rectangleDrag = undefined;
        this.placementPointerId = undefined;
        this.placementPointerPosition = undefined;
        this.scene.input.setDefaultCursor("auto");
        if (placementWasArmed) {
            this.cancelPlacement();
            return;
        }
        this.drawVisuals();
    }

    private selectRectangle(rectangle: Phaser.Types.Math.RectangleLike): void {
        const entities = Array.from(this.entitiesManager.getEntities().values()).filter((entity) => {
            return entity.canEdit && this.hasPositiveOverlap(rectangle, entity.getCollisionRectangle());
        });
        const areas = this.canEditAreas() ? (this.scene.getGameMapFrontWrapper().getAreas() ?? new Map()) : new Map();
        const areaIds = Array.from(areas.values())
            .filter((area) => this.hasPositiveOverlap(rectangle, area))
            .map((area) => area.id);
        this.selectedEntityIds = entities.map((entity) => entity.entityId);
        this.selectedAreaIds = areaIds;
        this.selectionRectangle = rectangle;
        this.clearError();
        this.publishSelectionCounts();
        this.publishState({ hasRectangle: true });
        this.drawVisuals();
    }

    private async confirmPlacement(pointerX: number, pointerY: number): Promise<void> {
        if (!this.beginOperation()) {
            return;
        }
        try {
            const context = this.getMapContext();
            if (!context) {
                this.setError("blocked");
                return;
            }

            const mode = get(mapEditorSelectionStore).mode;
            const items = mode === "move" ? this.readSelectedItems() : this.clipboard?.items;
            const bounds = mode === "move" ? items && this.getUnionBounds(items) : this.clipboard?.bounds;
            if ((mode !== "move" && mode !== "paste") || !items || items.length === 0 || !bounds) {
                this.setError("blocked");
                this.cancelPlacement();
                return;
            }

            const delta = this.getSnappedDelta(
                pointerX,
                pointerY,
                bounds,
                context.gameMapFrontWrapper.getTileDimensions(),
            );
            if (!this.areItemsValidAtDestination(items, delta, context.gameMapFrontWrapper)) {
                this.setError("blocked");
                return;
            }

            const commands: FrontCommand[] = [];
            const nextEntityIds: string[] = [];
            const nextAreaIds: string[] = [];
            // Entities of the map as they will be once the commands have run.
            const movedPositions = new Map<string, { x: number; y: number }>();
            const createdStates: MapLayerEntityState[] = [];
            for (const item of items) {
                if (mode === "move") {
                    if (item.kind === "entity") {
                        commands.push(
                            new UpdateEntityFrontCommand(
                                context.wamFile,
                                item.id,
                                { x: item.data.x + delta.x, y: item.data.y + delta.y },
                                undefined,
                                item.data,
                                context.entitiesManager,
                                this.scene,
                            ),
                        );
                        nextEntityIds.push(item.id);
                        movedPositions.set(item.id, { x: item.data.x + delta.x, y: item.data.y + delta.y });
                    } else {
                        commands.push(
                            new UpdateAreaFrontCommand(
                                context.wamFile,
                                { id: item.id, x: item.data.x + delta.x, y: item.data.y + delta.y },
                                undefined,
                                item.data,
                                this.areaEditorTool,
                                context.gameMapFrontWrapper,
                            ),
                        );
                        nextAreaIds.push(item.id);
                    }
                } else if (item.kind === "entity") {
                    const id = uuid();
                    const data: WAMEntityData = {
                        ...structuredClone(item.data),
                        x: item.data.x + delta.x,
                        y: item.data.y + delta.y,
                    };
                    commands.push(
                        new CreateEntityFrontCommand(
                            context.wamFile,
                            id,
                            data,
                            undefined,
                            context.entitiesManager,
                            item.dimensions,
                        ),
                    );
                    nextEntityIds.push(id);
                    createdStates.push(this.toMapLayerEntityState(id, data));
                } else {
                    const id = uuid();
                    const data: AreaData = {
                        ...structuredClone(item.data),
                        id,
                        x: item.data.x + delta.x,
                        y: item.data.y + delta.y,
                    };
                    commands.push(
                        new CreateAreaFrontCommand(
                            context.wamFile,
                            data,
                            undefined,
                            this.areaEditorTool,
                            false,
                            context.gameMapFrontWrapper,
                        ),
                    );
                    nextAreaIds.push(id);
                }
            }

            this.appendMapLayerSync(context, commands, items, (states) => [
                ...states.map((state) => ({ ...state, ...movedPositions.get(state.entityId) })),
                ...createdStates,
            ]);
            await this.mapEditorModeManager.executeCommands(commands);
            if (this.active) {
                this.selectedEntityIds = nextEntityIds;
                this.selectedAreaIds = nextAreaIds;
                const selectedRectangle = this.selectionRectangle;
                this.selectionRectangle =
                    mode === "move" && selectedRectangle
                        ? this.translateBounds(selectedRectangle, delta)
                        : this.translateBounds(bounds, delta);
            }
            // Paste is a stamp: the mode stays armed with the same content until Escape, Cancel or a tool change.
            if (mode !== "paste") {
                this.cancelPlacement();
            }
            if (this.active) {
                this.publishSelectionCounts();
                this.publishState({ hasRectangle: true });
            }
            this.drawVisuals();
        } catch (error: unknown) {
            this.reportFailure("place selection", error);
            if (get(mapEditorSelectionStore).mode !== "paste") {
                this.cancelPlacement();
            }
        } finally {
            this.endOperation();
        }
    }

    private toMapLayerEntityState(entityId: string, data: WAMEntityData): MapLayerEntityState {
        return {
            entityId,
            x: data.x,
            y: data.y,
            collectionName: data.prefabRef.collectionName,
            prefabId: data.prefabRef.id,
        };
    }

    /**
     * Floors and walls choose their sprites from their neighbours (joints, corners, ends). When an operation touches
     * some of them, appends the commands that re-create the right sprites around the result, so that the whole is one
     * undo step. `apply` turns the entities of the map into what they will be once `commands` have run.
     */
    private appendMapLayerSync(
        context: { wamFile: WamFile; entitiesManager: EntitiesManager },
        commands: FrontCommand[],
        involved: readonly (SelectionItem | EntitySelectionItem)[],
        apply: (states: MapLayerEntityState[]) => MapLayerEntityState[],
    ): void {
        const touchesMapLayer = involved.some(
            (item) =>
                item.kind === "entity" && isMapLayerPrefab(item.data.prefabRef.collectionName, item.data.prefabRef.id),
        );
        if (!touchesMapLayer) {
            return;
        }
        const sync = buildMapLayerSyncCommands(
            context.wamFile,
            context.entitiesManager,
            apply(readMapLayerEntityStates(context.entitiesManager)),
        );
        if (sync === undefined) {
            throw new Error("The floors and walls change is too large");
        }
        commands.push(...sync);
    }

    private areItemsValidAtDestination(
        items: SelectionItem[],
        delta: Phaser.Types.Math.Vector2Like,
        gameMapFrontWrapper: GameMapFrontWrapper,
    ): boolean {
        if (items.some((item) => item.kind === "area") && !this.canEditAreas()) {
            return false;
        }
        for (const item of items) {
            const x = item.bounds.x + delta.x;
            const y = item.bounds.y + delta.y;
            if (item.kind === "area") {
                if (gameMapFrontWrapper.isOutOfMapBounds(x, y, item.bounds.width, item.bounds.height)) {
                    return false;
                }
                continue;
            }
            if (
                !gameMapFrontWrapper.canEntityBePlacedOnMap(
                    { x, y },
                    item.dimensions.width,
                    item.dimensions.height,
                    item.collisionGrid,
                    undefined,
                    true,
                )
            ) {
                return false;
            }
        }
        return true;
    }

    private readSelectedItems(): SelectionItem[] | undefined {
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile || (this.selectedAreaIds.length > 0 && !this.canEditAreas())) {
            return undefined;
        }
        const entityConfigs = wamFile.getGameMapEntities();
        const areaConfigs = this.scene.getGameMapFrontWrapper().getAreas();
        const items: SelectionItem[] = [];

        for (const id of this.selectedEntityIds) {
            const entity = this.entitiesManager.getEntities().get(id);
            const data = entityConfigs.getEntity(id);
            if (!entity || !data || !entity.canEdit) {
                return undefined;
            }
            const bounds = entity.getCollisionRectangle();
            items.push({
                kind: "entity",
                id,
                data: structuredClone(data),
                dimensions: { width: entity.width, height: entity.height },
                collisionGrid: entity.getPrefab().collisionGrid,
                bounds: { ...bounds },
            });
        }
        for (const id of this.selectedAreaIds) {
            const data = areaConfigs?.get(id);
            if (!data) {
                return undefined;
            }
            items.push({
                kind: "area",
                id,
                data: structuredClone(data),
                bounds: { x: data.x, y: data.y, width: data.width, height: data.height },
            });
        }
        return items;
    }

    public refreshSelection(): void {
        if (this.selectedEntityIds.length === 0 && this.selectedAreaIds.length === 0) {
            this.drawVisuals();
            return;
        }
        const currentEntityIds = this.entitiesManager.getEntities();
        const currentAreas = this.scene.getGameMapFrontWrapper().getAreas();
        const entityIds = this.selectedEntityIds.filter((id) => currentEntityIds.has(id));
        const areaIds = this.selectedAreaIds.filter((id) => currentAreas?.has(id) ?? false);
        if (entityIds.length !== this.selectedEntityIds.length || areaIds.length !== this.selectedAreaIds.length) {
            this.selectedEntityIds = entityIds;
            this.selectedAreaIds = areaIds;
            if (get(mapEditorSelectionStore).mode === "move" && entityIds.length + areaIds.length === 0) {
                this.cancelPlacement();
            }
            this.publishSelectionCounts();
        }
        this.drawVisuals();
    }

    private drawVisuals(): void {
        if (!this.active) {
            return;
        }
        const state = get(mapEditorSelectionStore);
        const selectedItems = this.getSelectionVisuals();
        const visualItems: { bounds: Phaser.Types.Math.RectangleLike; color: number; alpha: number }[] =
            selectedItems.map((bounds) => ({
                bounds,
                color: SELECTION_COLOR,
                alpha: 1,
            }));
        let rectangleToDraw = this.rectangleDrag
            ? this.getRectangleFromPoints(this.rectangleDrag.start, this.rectangleDrag.current)
            : this.selectionRectangle;

        if (state.mode === "move" || state.mode === "paste") {
            const items = state.mode === "move" ? this.readSelectedItems() : this.clipboard?.items;
            const bounds = state.mode === "move" ? items && this.getUnionBounds(items) : this.clipboard?.bounds;
            if (items && items.length > 0 && bounds) {
                const pointer = this.placementPointerPosition ?? {
                    x: this.scene.input.activePointer.worldX,
                    y: this.scene.input.activePointer.worldY,
                };
                const delta = this.getSnappedDelta(
                    pointer.x,
                    pointer.y,
                    bounds,
                    this.scene.getGameMapFrontWrapper().getTileDimensions(),
                );
                visualItems.length = 0;
                for (const item of items) {
                    visualItems.push({
                        bounds: this.translateBounds(item.bounds, delta),
                        color: PLACEMENT_COLOR,
                        alpha: 1,
                    });
                }
                rectangleToDraw = this.translateBounds(bounds, delta);
            }
        }

        const signature = JSON.stringify({
            rectangleToDraw,
            visualItems,
            mode: state.mode,
            active: this.active,
        });
        if (signature === this.previousVisualSignature) {
            return;
        }
        this.previousVisualSignature = signature;
        this.graphics.clear();
        if (rectangleToDraw && rectangleToDraw.width > 0 && rectangleToDraw.height > 0) {
            this.graphics
                .fillStyle(SELECTION_COLOR, 0.22)
                .fillRect(rectangleToDraw.x, rectangleToDraw.y, rectangleToDraw.width, rectangleToDraw.height);
            this.graphics
                .lineStyle(2, SELECTION_COLOR, 1)
                .strokeRect(rectangleToDraw.x, rectangleToDraw.y, rectangleToDraw.width, rectangleToDraw.height);
        }
        for (const item of visualItems) {
            this.graphics
                .lineStyle(2, item.color, item.alpha)
                .strokeRect(item.bounds.x, item.bounds.y, item.bounds.width, item.bounds.height);
        }
        this.scene.markDirty();
    }

    private getSelectionVisuals(): Phaser.Types.Math.RectangleLike[] {
        const bounds: Phaser.Types.Math.RectangleLike[] = [];
        for (const id of this.selectedEntityIds) {
            const entity = this.entitiesManager.getEntities().get(id);
            if (entity) {
                bounds.push({ ...entity.getCollisionRectangle() });
            }
        }
        const areas = this.scene.getGameMapFrontWrapper().getAreas();
        for (const id of this.selectedAreaIds) {
            const area = areas?.get(id);
            if (area) {
                bounds.push({ x: area.x, y: area.y, width: area.width, height: area.height });
            }
        }
        return bounds;
    }

    private getRectangleFromPoints(
        start: Phaser.Types.Math.Vector2Like,
        end: Phaser.Types.Math.Vector2Like,
    ): Phaser.Types.Math.RectangleLike {
        return {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x),
            height: Math.abs(end.y - start.y),
        };
    }

    private hasPositiveOverlap(left: Phaser.Types.Math.RectangleLike, right: Phaser.Types.Math.RectangleLike): boolean {
        const intersection = Phaser.Geom.Rectangle.Intersection(
            new Phaser.Geom.Rectangle(left.x, left.y, left.width, left.height),
            new Phaser.Geom.Rectangle(right.x, right.y, right.width, right.height),
        );
        return intersection.width > 0 && intersection.height > 0;
    }

    private getUnionBounds(items: SelectionItem[]): Phaser.Types.Math.RectangleLike | undefined {
        if (items.length === 0) {
            return undefined;
        }
        let bounds = new Phaser.Geom.Rectangle(
            items[0].bounds.x,
            items[0].bounds.y,
            items[0].bounds.width,
            items[0].bounds.height,
        );
        for (const item of items.slice(1)) {
            bounds = Phaser.Geom.Rectangle.Union(
                bounds,
                new Phaser.Geom.Rectangle(item.bounds.x, item.bounds.y, item.bounds.width, item.bounds.height),
            );
        }
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }

    private translateBounds(
        bounds: Phaser.Types.Math.RectangleLike,
        delta: Phaser.Types.Math.Vector2Like,
    ): Phaser.Types.Math.RectangleLike {
        return { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y };
    }

    private getSnappedDelta(
        pointerX: number,
        pointerY: number,
        bounds: Phaser.Types.Math.RectangleLike,
        tileDimensions: { width: number; height: number },
    ): Phaser.Types.Math.Vector2Like {
        const desiredX = pointerX - bounds.x - bounds.width / 2;
        const desiredY = pointerY - bounds.y - bounds.height / 2;
        return {
            x: Math.round(desiredX / tileDimensions.width) * tileDimensions.width,
            y: Math.round(desiredY / tileDimensions.height) * tileDimensions.height,
        };
    }

    private getMapContext():
        | {
              wamFile: WamFile;
              gameMapFrontWrapper: GameMapFrontWrapper;
              entitiesManager: EntitiesManager;
          }
        | undefined {
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile) {
            return undefined;
        }
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        return {
            wamFile,
            gameMapFrontWrapper,
            entitiesManager: gameMapFrontWrapper.getEntitiesManager(),
        };
    }

    private isCanvasOrigin(pointer: Phaser.Input.Pointer): boolean {
        const canvas = this.scene.game.canvas;
        return (
            (pointer.downElement === canvas || pointer.event.target === canvas) &&
            isPointerInsideCanvas(this.scene, pointer)
        );
    }

    private canEditAreas(): boolean {
        return get(userIsAdminStore) || get(userIsEditorStore);
    }

    private getRoomUrl(): string {
        return gameManager.currentStartedRoom.href;
    }

    private getPrefabKey(collectionName: string, id: string): string {
        return JSON.stringify([collectionName, id]);
    }

    private getPrefabPositionKey(collectionName: string, id: string, x: number, y: number): string {
        return JSON.stringify([collectionName, id, x, y]);
    }

    private isPlacementArmed(): boolean {
        const mode = get(mapEditorSelectionStore).mode;
        return mode === "move" || mode === "paste";
    }

    private clearSelection(): void {
        this.selectedEntityIds = [];
        this.selectedAreaIds = [];
        this.selectionRectangle = undefined;
        this.publishSelectionCounts();
        this.publishState({ hasRectangle: false });
        this.clearError();
        this.drawVisuals();
    }

    private cancelPlacement(): void {
        this.placementPointerId = undefined;
        this.placementPointerPosition = undefined;
        setArmedPattern(undefined);
        this.publishState({ mode: "select" });
        this.drawVisuals();
    }

    private beginOperation(): boolean {
        if (this.isBusy()) {
            return false;
        }
        this.publishState({ busy: true, error: undefined });
        return true;
    }

    private endOperation(): void {
        this.publishState({ busy: false });
    }

    private isBusy(): boolean {
        return get(mapEditorSelectionStore).busy;
    }

    private publishSelectionCounts(): void {
        this.publishState({
            entityCount: this.selectedEntityIds.length,
            areaCount: this.selectedAreaIds.length,
            hasRectangle: this.selectionRectangle !== undefined,
        });
    }

    private publishState(patch: Partial<MapEditorSelectionState>): void {
        mapEditorSelectionStore.update((state) => ({ ...state, ...patch }));
    }

    private clearError(): void {
        this.publishState({ error: undefined });
    }

    private setError(error: NonNullable<MapEditorSelectionState["error"]>): void {
        this.publishState({ error });
    }

    /** An API refusal is shown by the pattern panel; anything else is an unexpected failure. */
    private reportPatternFailure(operation: string, error: unknown): void {
        if (error instanceof MapPatternApiError) {
            setMapPatternError(patternErrorCodeOf(error));
            return;
        }
        this.reportFailure(operation, error);
    }

    private reportFailure(operation: string, error: unknown): void {
        const cause = asError(error);
        logger("Selection operation failed", { operation, error: cause });
        Sentry.captureException(cause, { tags: { mapEditorOperation: operation } });
        this.setError("failed");
    }
}
