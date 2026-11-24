import type { GameMapAreas } from "../GameMap/GameMapAreas";
import type { EntityCoordinates } from "../types";

export class EntityPermissions {
    constructor(
        private gameMapAreas: GameMapAreas,
        private userConnectedTags: string[],
        private userCanEdit?: boolean,
        private userUUID?: string,
    ) {}

    public canEdit(
        entityCenterCoordinates: EntityCoordinates & { z?: number },
        width: number = 0,
        height: number = 0,
        floating: boolean = false,
    ): boolean {
        if (this.userCanEdit) {
            return true;
        }
        return this.isEntityInsideAreaWithUserWriteAccess(entityCenterCoordinates, width, height, floating);
    }

    public canRead(entityCenterCoordinates: EntityCoordinates & { z?: number }): boolean {
        if (this.userCanEdit) {
            return true;
        }
        return this.isEntityInsideAreaWithUserReadAccess(entityCenterCoordinates);
    }

    private isEntityInsideAreaWithUserWriteAccess(
        entityCenterCoordinates: EntityCoordinates & { z?: number },
        width: number,
        height: number,
        floating: boolean,
    ) {
        return this.gameMapAreas.isUserHasWriteAccessOnAreaForEntityCoordinates(
            entityCenterCoordinates,
            this.userConnectedTags,
            this.userUUID,
            width,
            height,
            floating,
        );
    }

    private isEntityInsideAreaWithUserReadAccess(entityCenterCoordinates: EntityCoordinates & { z?: number }) {
        return this.gameMapAreas.isUserHasReadAccessOnAreaForEntityCoordinates(
            entityCenterCoordinates,
            this.userConnectedTags,
        );
    }
}
