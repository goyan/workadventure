import { UpdateTerrainCommand } from "@workadventure/map-editor";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import type { FrontCommandInterface } from "../FrontCommandInterface";

/** Digs or fills cells of the relief of the map, for everyone; its undo command puts them back as they were. */
export class UpdateTerrainFrontCommand extends UpdateTerrainCommand implements FrontCommandInterface {
    public getUndoCommand(): UpdateTerrainFrontCommand {
        return new UpdateTerrainFrontCommand(this.wam, this.previous());
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitModifyTerrain(this.commandId, this.modifyTerrainMessage);
    }
}
