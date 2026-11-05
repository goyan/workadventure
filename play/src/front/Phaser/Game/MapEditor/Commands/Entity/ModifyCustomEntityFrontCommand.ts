import { CollisionGrid, CollisionRectangle, EntityLayer, ModifyCustomEntityCommand } from "@workadventure/map-editor";
import type { ModifyCustomEntityMessage } from "@workadventure/messages";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import type { FrontCommand } from "../FrontCommand";
import type { CustomEntityModification, EntitiesCollectionsManager } from "../../EntitiesCollectionsManager";
import type { GameMapFrontWrapper } from "../../../GameMap/GameMapFrontWrapper";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";

export class ModifyCustomEntityFrontCommand extends ModifyCustomEntityCommand implements FrontCommand {
    constructor(
        modifyCustomEntityMessage: ModifyCustomEntityMessage,
        private entitiesCollectionManager: EntitiesCollectionsManager,
        private gameFrontWrapper: GameMapFrontWrapper,
        private entitiesManager: EntitiesManager,
    ) {
        super(modifyCustomEntityMessage);
    }

    emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorModifyCustomEntity(this.commandId, this.modifyCustomEntityMessage);
    }

    execute(): Promise<void> {
        const message = this.modifyCustomEntityMessage;
        // The Value fields come from the network: keep them only when they match the schema, like map-storage.
        const modification: CustomEntityModification = {
            name: message.name,
            tags: message.tags,
            depthOffset: message.depthOffset,
            collisionGrid: message.collisionGrid ? CollisionGrid.safeParse(message.collisionGrid).data : undefined,
            collisionRectangles: parseRectangles(message.collisionRectangles),
            layer: message.layer ? EntityLayer.safeParse(message.layer).data : undefined,
            water: parseRectangles(message.water),
            sittable: message.sittable,
        };
        this.entitiesCollectionManager.modifyCustomEntity(message.id, modification);
        // The placed copies keep their own prefab: give them the new one (depth, layer, collisions, water).
        this.entitiesManager.updateEntitiesPrefab(message.id, modification);
        this.gameFrontWrapper.scheduleEntitiesCollisionGridRecompute();
        return super.execute();
    }

    getUndoCommand(): ModifyCustomEntityFrontCommand {
        throw new Error("Not supported.");
    }
}

function parseRectangles(value: unknown): CollisionRectangle[] | undefined {
    if (value === undefined || value === null) return undefined;
    return CollisionRectangle.array().safeParse(value).data;
}
