import type { AreaData, WAMFileFormat } from "@workadventure/map-editor";
import { LISTENING_ZONE_JAM_VARIABLE, parseListeningZoneJams } from "@workadventure/map-editor";
import type { GameRoom } from "../GameRoom";
import type { VariablesRepositoryInterface } from "../../Services/Repository/VariablesRepositoryInterface";

/** A host who reloads the page or loses the connection a moment keeps their room. */
export const HOST_GRACE_MS = 60_000;
/** After a restart, hosts reconnect on their own; a room whose host does not come back is closed. */
export const RESTORED_ROOMS_GRACE_MS = 120_000;
const FIELD_DELIMITER = "::";

/**
 * Keeps the Jam rooms of the listening zones. A room follows its host: it stays open wherever they walk on the map, and
 * closes once they have left the map for a while (a reload does not close it). Rooms survive a server restart (saved in
 * their own Redis hash, apart from the map variables). A Spotify Jam itself keeps going in Spotify: we only stop
 * offering it.
 */
export class ListeningZoneManager {
    private readonly checks = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private gameRoom: Pick<
            GameRoom,
            | "getAreaPropertyVariable"
            | "setAreaPropertyVariable"
            | "getUsersByUuid"
            | "destroyRoomStream"
            | "getWam"
            | "userLeaveStream"
        >,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
    ) {
        // No need to unsubscribe since GameRoom.destroy completes this stream.
        // eslint-disable-next-line rxjs/no-ignored-subscription,svelte/no-ignored-unsubscribe
        this.gameRoom.userLeaveStream.subscribe((user) => {
            if (this.hostsARoom(user.uuid)) {
                this.scheduleCheck(user.uuid, HOST_GRACE_MS);
            }
        });

        // No need to unsubscribe since GameRoom.destroy completes this stream.
        // eslint-disable-next-line rxjs/no-ignored-subscription,svelte/no-ignored-unsubscribe
        this.gameRoom.destroyRoomStream.subscribe(() => {
            for (const timeout of this.checks.values()) {
                clearTimeout(timeout);
            }
            this.checks.clear();
        });
    }

    /** Saves the rooms of a zone, called on every change of its Jam variable. Nothing is kept for a zone without room. */
    public persist(areaId: string, propertyId: string, value: string): void {
        if (!this.store) {
            return;
        }
        const rooms = parseListeningZoneJams(value);
        this.store.repository
            .saveVariable(this.hashKey(), this.field(areaId, propertyId), rooms.length > 0 ? JSON.stringify(rooms) : "")
            .catch((error) => console.error("Could not save the Jam rooms of a listening zone", error));
    }

    /** Brings back the rooms saved before a restart, for the listening zones the map still has. */
    public async restore(): Promise<void> {
        if (!this.store) {
            return;
        }
        const saved = await this.store.repository.loadVariables(this.hashKey());
        for (const [field, value] of Object.entries(saved)) {
            const [areaId, propertyId] = field.split(FIELD_DELIMITER);
            const rooms = parseListeningZoneJams(value);
            if (!this.listeningZones().some((zone) => zone.area.id === areaId && zone.propertyId === propertyId)) {
                continue;
            }
            if (rooms.length === 0) {
                continue;
            }
            this.gameRoom.setAreaPropertyVariable(areaId, propertyId, LISTENING_ZONE_JAM_VARIABLE, value);
            for (const room of rooms) {
                this.scheduleCheck(room.hostUuid, RESTORED_ROOMS_GRACE_MS);
            }
        }
    }

    private scheduleCheck(hostUuid: string, delayMs: number): void {
        clearTimeout(this.checks.get(hostUuid));
        this.checks.set(
            hostUuid,
            setTimeout(() => {
                this.checks.delete(hostUuid);
                // The host may have several tabs open: their room stays while one of them is on the map.
                if (this.gameRoom.getUsersByUuid(hostUuid).size === 0) {
                    this.closeRoomsOf(hostUuid);
                }
            }, delayMs),
        );
    }

    private closeRoomsOf(hostUuid: string): void {
        for (const { area, propertyId } of this.listeningZones()) {
            const rooms = this.roomsOf(area.id, propertyId);
            const remaining = rooms.filter((room) => room.hostUuid !== hostUuid);
            if (remaining.length !== rooms.length) {
                this.gameRoom.setAreaPropertyVariable(
                    area.id,
                    propertyId,
                    LISTENING_ZONE_JAM_VARIABLE,
                    JSON.stringify(remaining),
                );
            }
        }
    }

    private hostsARoom(uuid: string): boolean {
        return this.listeningZones().some(({ area, propertyId }) =>
            this.roomsOf(area.id, propertyId).some((room) => room.hostUuid === uuid),
        );
    }

    private roomsOf(areaId: string, propertyId: string) {
        return parseListeningZoneJams(
            this.gameRoom.getAreaPropertyVariable(areaId, propertyId, LISTENING_ZONE_JAM_VARIABLE),
        );
    }

    private listeningZones(): { area: AreaData; propertyId: string }[] {
        const wam: WAMFileFormat | undefined = this.gameRoom.getWam();
        return (wam?.areas ?? []).flatMap((area) =>
            area.properties
                .filter((property) => property.type === "listeningZonePropertyData")
                .map((property) => ({ area, propertyId: property.id })),
        );
    }

    private hashKey(): string {
        return `listening-zone-jams:${this.store?.roomUrl ?? ""}`;
    }

    private field(areaId: string, propertyId: string): string {
        return `${areaId}${FIELD_DELIMITER}${propertyId}`;
    }
}
