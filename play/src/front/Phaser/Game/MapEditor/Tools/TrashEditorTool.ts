import * as Phaser from "phaser";
import type { AreaData } from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import * as Sentry from "@sentry/svelte";
import { asError } from "catch-unknown";
import { get } from "svelte/store";
import { userIsAdminStore, userIsEditorStore } from "../../../../Stores/GameStore";
import { mapEditorSelectedAreaPreviewStore, mapEditorVisibilityStore } from "../../../../Stores/MapEditorStore";
import { AreaPreview, AreaPreviewEvent } from "../../../Components/MapEditor/AreaPreview";
import { SizeAlteringSquare } from "../../../Components/MapEditor/SizeAlteringSquare";
import { Entity } from "../../../ECS/Entity";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { isPointerInsideCanvas } from "../MapEditorPointer";
import { EntityRelatedEditorTool } from "./EntityRelatedEditorTool";
import type { AreaEditorTool } from "./AreaEditorTool";

import Key = Phaser.Input.Keyboard.Key;
import Pointer = Phaser.Input.Pointer;
import GameObject = Phaser.GameObjects.GameObject;

interface TrashStroke {
    pointerId: number;
    lastWorldPosition: Phaser.Types.Math.Vector2Like;
    moved: boolean;
}

export class TrashEditorTool extends EntityRelatedEditorTool {
    protected ctrlKey?: Key;
    private areaPreviews: AreaPreview[] = [];
    private active = false;
    private trashStroke: TrashStroke | undefined;
    private readonly pendingEntityDeletions = new Set<string>();
    private readonly pointerDownEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerDownEvent(pointer);
    };
    private readonly pointerMoveEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerMoveEvent(pointer);
    };
    private readonly pointerUpOutsideEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.handlePointerUpOutsideEvent(pointer);
    };
    private readonly gameOutEventHandler = (): void => {
        this.stopTrashStroke();
    };
    private readonly windowBlurEventHandler = (): void => {
        this.stopTrashStroke();
    };

    constructor(
        mapEditorModeManager: MapEditorModeManager,
        private areaEditorTool: AreaEditorTool,
    ) {
        super(mapEditorModeManager);

        this.active = false;
        this.ctrlKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    }

    public handleAreaDeletion(id: string, areaData: AreaData | undefined): void {
        this.scene.getGameMapFrontWrapper().listenAreaDeletion(areaData);

        if (!this.active) {
            return;
        }

        this.deleteAreaPreview(id);
        this.scene.markDirty();
        mapEditorSelectedAreaPreviewStore.set(undefined);
    }

    public handleAreaCreation(config: AreaData, localCommand: boolean): void {
        this.scene.getGameMapFrontWrapper().listenAreaCreation(config);

        if (!this.active) {
            return;
        }

        this.createAreaPreview(config);
        this.scene.markDirty();
    }

    public handleAreaPreviewCreation(config: AreaData, localCommand: boolean): void {
        console.info("handleAreaPreviewCreation => No create area preview in trash mode");
    }

    public activate(): void {
        super.activate();
        this.areaPreviews = this.createAreaPreviews();
        this.active = true;
        this.bindEventHandlers();
        this.setAreaPreviewsVisibility(this.getAreaPreviewVisibileFromUserPermissions());
        this.updateAreaPreviews();
        this.scene.markDirty();
        mapEditorVisibilityStore.set(false);
    }

    public clear(): void {
        this.stopTrashStroke();
        this.active = false;
        this.unbindEventHandlers();
        super.clear();
        this.setAreaPreviewsVisibility(false);
        this.areaPreviews.forEach((preview) => preview.destroy());
        this.areaPreviews = [];
        this.scene.markDirty();
    }

    public destroy(): void {
        this.stopTrashStroke();
        this.active = false;
        this.unbindEventHandlers();
        this.setAreaPreviewsVisibility(false);
        this.areaPreviews.forEach((preview) => preview.destroy());
        this.areaPreviews = [];
        super.destroy();
    }

    public handleKeyDownEvent(event: KeyboardEvent): void {
        if (event.key.toLowerCase() === "escape") {
            this.stopTrashStroke();
        }
        super.handleKeyDownEvent(event);
    }

    handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        return Promise.resolve(undefined);
    }

    protected bindEventHandlers(): void {
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpOutsideEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_OVER, this.pointerHoverEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_OUT, this.pointerOutEventHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.addEventListener("blur", this.windowBlurEventHandler);
    }

    protected unbindEventHandlers(): void {
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpOutsideEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_OVER, this.pointerHoverEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_OUT, this.pointerOutEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.removeEventListener("blur", this.windowBlurEventHandler);
    }

    private createAreaPreviews(): AreaPreview[] {
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

    private createAreaPreview(areaConfig: AreaData): AreaPreview {
        // For trash tool, area previews must override depth to be always on top. The area previews has opacity that permits to see underneath.
        const areaPreview = new AreaPreview(this.scene, structuredClone(areaConfig), true, undefined, this.ctrlKey);
        this.bindAreaPreviewEventHandlers(areaPreview);
        this.areaPreviews.push(areaPreview);
        return areaPreview;
    }

    private updateAreaPreviews(): void {
        const areaConfigs = this.scene.getGameMapFrontWrapper().getAreas();

        // find previews of areas that exist no longer
        const areaPreviewsToDelete: string[] = [];
        for (const preview of this.areaPreviews) {
            if (!areaConfigs?.has(preview.getId())) {
                areaPreviewsToDelete.push(preview.getId());
            }
        }
        // destroy them
        for (const id of areaPreviewsToDelete) {
            const index = this.areaPreviews.findIndex((preview) => preview.getId() === id);
            if (index !== -1) {
                this.areaPreviews.splice(index, 1)[0]?.destroy();
            }
        }

        // create previews for new areas that were created during our absence in editor mode
        if (areaConfigs) {
            for (const config of Array.from(areaConfigs.values())) {
                const areaPreview = this.areaPreviews.find((areaPreview) => areaPreview.getId() === config.id);
                if (areaPreview) {
                    areaPreview.updatePreview(config);
                } else {
                    this.createAreaPreview(config);
                }
            }
        }
    }

    private setAreaPreviewsVisibility(visible: boolean): void {
        // NOTE: I would really like to use Phaser Layers here but it seems that there's a problem with Areas still being
        //       interactive when we hide whole Layer and thus forEach is needed.
        this.areaPreviews.forEach((area) => area.setVisible(visible));
    }

    private bindAreaPreviewEventHandlers(areaPreview: AreaPreview): void {
        areaPreview.on(AreaPreviewEvent.Delete, () =>
            this.areaEditorTool.handleDeleteAreaFrontCommandExecution(areaPreview.getAreaData().id, this),
        );
    }

    private deleteAreaPreview(id: string): boolean {
        const index = this.areaPreviews.findIndex((preview) => preview.getAreaData().id === id);
        if (index !== -1) {
            this.areaPreviews.splice(index, 1)[0].destroy();
            return true;
        }
        return false;
    }

    private pointerUpEventHandler = (pointer: Pointer, gameObjects: GameObject[]) => {
        if (!this.active) {
            return;
        }

        const stroke = this.trashStroke;
        if (!stroke || stroke.pointerId !== pointer.id || pointer.button !== 0) {
            return;
        }
        this.stopTrashStroke();

        if (stroke.moved) {
            return;
        }

        const firstGameObject = gameObjects[0];

        if (firstGameObject && firstGameObject instanceof Entity) {
            if (!this.isAllowedToRemoveGameObject(firstGameObject)) {
                return;
            }
            firstGameObject.delete();
            return;
        }

        const areaEditorToolObjects = this.getAreaEditorToolObjectsFromGameObjects(gameObjects);
        if (areaEditorToolObjects.length === 1) {
            if (this.isAreaPreview(areaEditorToolObjects[0])) {
                areaEditorToolObjects[0].delete();
            }
        }
    };

    private handlePointerDownEvent(pointer: Phaser.Input.Pointer): void {
        if (
            !this.active ||
            this.trashStroke ||
            pointer.button !== 0 ||
            !pointer.leftButtonDown() ||
            (pointer.downElement !== this.scene.game.canvas && pointer.event.target !== this.scene.game.canvas) ||
            !isPointerInsideCanvas(this.scene, pointer)
        ) {
            return;
        }

        this.trashStroke = {
            pointerId: pointer.id,
            lastWorldPosition: { x: pointer.worldX, y: pointer.worldY },
            moved: false,
        };
    }

    private handlePointerMoveEvent(pointer: Phaser.Input.Pointer): void {
        const stroke = this.trashStroke;
        if (!this.active || !stroke || stroke.pointerId !== pointer.id) {
            return;
        }
        if (!pointer.leftButtonDown() || !isPointerInsideCanvas(this.scene, pointer)) {
            this.stopTrashStroke();
            return;
        }

        const nextPosition = { x: pointer.worldX, y: pointer.worldY };
        if (nextPosition.x === stroke.lastWorldPosition.x && nextPosition.y === stroke.lastWorldPosition.y) {
            return;
        }

        stroke.moved = true;
        this.eraseEntitiesAlongSegment(stroke.lastWorldPosition, nextPosition);
        stroke.lastWorldPosition = nextPosition;
    }

    private handlePointerUpOutsideEvent(pointer: Phaser.Input.Pointer): void {
        if (this.trashStroke?.pointerId === pointer.id) {
            this.stopTrashStroke();
        }
    }

    private eraseEntitiesAlongSegment(start: Phaser.Types.Math.Vector2Like, end: Phaser.Types.Math.Vector2Like): void {
        const line = new Phaser.Geom.Line(start.x, start.y, end.x, end.y);

        for (const entity of Array.from(this.entitiesManager.getEntities().values())) {
            const tags = entity.getPrefab().tags;
            if (
                this.pendingEntityDeletions.has(entity.entityId) ||
                (!tags.includes("Sols") && !tags.includes("Murs"))
            ) {
                continue;
            }
            const collisionBounds = entity.getCollisionRectangle();
            const collisionRectangle = new Phaser.Geom.Rectangle(
                collisionBounds.x,
                collisionBounds.y,
                collisionBounds.width,
                collisionBounds.height,
            );
            if (
                !Phaser.Geom.Intersects.LineToRectangle(line, collisionRectangle) ||
                !this.isAllowedToRemoveGameObject(entity)
            ) {
                continue;
            }

            this.deleteEntityWithCommand(entity, end);
        }
    }

    private deleteEntityWithCommand(entity: Entity, position: Phaser.Types.Math.Vector2Like): void {
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile) {
            return;
        }

        const entityId = entity.entityId;
        this.pendingEntityDeletions.add(entityId);
        this.mapEditorModeManager
            .executeCommand(new DeleteEntityFrontCommand(wamFile, entityId, undefined, this.entitiesManager))
            .finally(() => {
                this.pendingEntityDeletions.delete(entityId);
            })
            .catch((error: unknown) => {
                const cause = asError(error);
                console.error("Failed to erase map entity", {
                    error: cause,
                    entityId,
                    x: position.x,
                    y: position.y,
                });
                Sentry.captureException(cause);
            });
    }

    private stopTrashStroke(): void {
        this.trashStroke = undefined;
    }

    private pointerHoverEventHandler = (pointer: Pointer, gameObjects: GameObject[]) => {
        if (!this.active) {
            return;
        }
        const areaEditorToolObjects = this.getAreaEditorToolObjectsFromGameObjects(gameObjects);
        if (areaEditorToolObjects.length === 1) {
            if (this.isAreaPreview(areaEditorToolObjects[0])) {
                areaEditorToolObjects[0].changeColor(0xff0000);
                this.scene.markDirty();
            }
        }
    };

    private pointerOutEventHandler = (pointer: Pointer, gameObjects: GameObject[]) => {
        if (!this.active) {
            return;
        }
        const areaEditorToolObjects = this.getAreaEditorToolObjectsFromGameObjects(gameObjects);
        if (areaEditorToolObjects.length === 1) {
            if (this.isAreaPreview(areaEditorToolObjects[0])) {
                areaEditorToolObjects[0].resetColor();
                this.scene.markDirty();
            }
        }
    };

    private isAreaPreview(obj: GameObject): obj is AreaPreview {
        return obj instanceof AreaPreview;
    }

    private isSizeAlteringSquare(obj: GameObject): obj is SizeAlteringSquare {
        return obj instanceof SizeAlteringSquare;
    }

    private getAreaEditorToolObjectsFromGameObjects(gameObjects: GameObject[]): (AreaPreview | SizeAlteringSquare)[] {
        const areaPreviews = gameObjects.filter((obj) => this.isAreaPreview(obj));
        const sizeAlteringSquares = gameObjects.filter((obj) => this.isSizeAlteringSquare(obj));
        return [...areaPreviews, ...sizeAlteringSquares];
    }

    private getAreaPreviewVisibileFromUserPermissions(): boolean {
        if (get(userIsAdminStore) || get(userIsEditorStore)) {
            return true;
        }
        return false;
    }

    private isAllowedToRemoveGameObject(gameObject: Entity) {
        return gameObject.canEdit;
    }
}
