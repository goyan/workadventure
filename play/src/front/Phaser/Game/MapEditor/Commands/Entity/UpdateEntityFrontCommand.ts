import type { WamFile, WAMEntityData, WAMFileFormat } from "@workadventure/map-editor";
import { UpdateEntityCommand } from "@workadventure/map-editor";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";
import type { Entity } from "../../../../ECS/Entity";
import type { GameScene } from "../../../GameScene";
import type { FrontCommandInterface } from "../FrontCommandInterface";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import { analyticsClient } from "../../../../../Administration/AnalyticsClient";
import { getTileCollisionGrid, reverseCollisionGrid } from "../../../../../Utils/EntityHitbox";

export class UpdateEntityFrontCommand extends UpdateEntityCommand implements FrontCommandInterface {
    constructor(
        wamFile: WamFile,
        entityId: string,
        dataToModify: Partial<WAMEntityData>,
        commandId: string | undefined,
        oldConfig: Partial<WAMEntityData> | undefined,
        private entitiesManager: EntitiesManager,
        private scene: GameScene,
    ) {
        super(wamFile, entityId, dataToModify, commandId, oldConfig);
    }

    public execute(): Promise<WAMFileFormat | undefined> {
        const returnVal = super.execute();
        this.handleEntityUpdate(this.newConfig);

        return returnVal;
    }

    public getUndoCommand(): UpdateEntityFrontCommand {
        return new UpdateEntityFrontCommand(
            this.wamFile,
            this.entityId,
            this.oldConfig,
            undefined,
            this.newConfig,
            this.entitiesManager,
            this.scene,
        );
    }

    public emitEvent(roomConnection: RoomConnection): void {
        const entity = this.entitiesManager.getEntities().get(this.entityId);
        if (!entity) {
            console.error("Entity not found");
            analyticsClient.trackAdminEvent("map_editor.save.failed", { reason: "entity_not_found" });
            return;
        }
        roomConnection.emitMapEditorModifyEntity(
            this.commandId,
            this.entityId,
            {
                x: entity.x,
                y: entity.y,
                ...this.newConfig,
            },
            {
                width: entity.width,
                height: entity.height,
            },
        );
        // From the entity, not the delta: a move or a property edit carries no prefabRef.
        analyticsClient.trackAdminEvent("map_editor.entity.updated", {
            entityType: entity.getEntityData().prefabRef.id,
        });
    }

    private handleEntityUpdate(config: Partial<WAMEntityData>): void {
        const entity = this.entitiesManager.getEntities().get(this.entityId);
        if (!entity) {
            return;
        }
        const { x: oldX, y: oldY } = entity.getOldPosition();
        entity?.updateEntity(config);
        // If the entity is activable, and not in the activatable entities array of the entity manager,
        // we add it to the array
        if (entity.isActivatable() && !this.entitiesManager.getActivatableEntities().includes(entity)) {
            this.entitiesManager.getActivatableEntities().push(entity);
        }
        this.updateCollisionGrid(entity, oldX, oldY);
        this.scene.markDirty();
    }

    /**
     * The grid is written to the tiles only where the object sits on the grid of the map (EntityHitbox): a move on or
     * off the grid moves its collision between the tile layer and the rectangles.
     */
    private updateCollisionGrid(entity: Entity, oldX: number, oldY: number): void {
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        const cellSize = gameMapFrontWrapper.getTileDimensions().width;
        const oldGrid = getTileCollisionGrid({ x: oldX, y: oldY }, entity.getPrefab(), cellSize);
        const grid = getTileCollisionGrid(entity, entity.getPrefab(), cellSize);
        if (oldGrid) {
            gameMapFrontWrapper.modifyToCollisionsLayer(oldX, oldY, "0", reverseCollisionGrid(oldGrid));
        }
        if (grid) {
            gameMapFrontWrapper.modifyToCollisionsLayer(entity.x, entity.y, "0", grid);
        }
        gameMapFrontWrapper.addEntityCollisionRectangles(entity);
    }
}
