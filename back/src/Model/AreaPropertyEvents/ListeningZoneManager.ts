import type { Subscription } from "rxjs";
import type { AreaData, WAMFileFormat } from "@workadventure/map-editor";
import { LISTENING_ZONE_JAM_VARIABLE, parseListeningZoneJams } from "@workadventure/map-editor";
import type { GameRoom } from "../GameRoom";
import { AreaZoneTracker } from "../AreaZoneTracker";
import type { VariablesRepositoryInterface } from "../../Services/Repository/VariablesRepositoryInterface";

/** A host who reloads the page or loses the connection a moment gets their room back. */
export const HOST_GRACE_MS = 60_000;
/** After a restart, hosts reconnect on their own; a room whose host does not come back is closed. */
export const RESTORED_ROOMS_GRACE_MS = 120_000;
const FIELD_DELIMITER = "::";

/**
 * Keeps the Jam rooms of the listening zones: they survive a server restart (saved in their own Redis hash, apart from
 * the map variables), and a room closes once its host has been out of the zone for a while, whether they walked out or
 * disconnected. A Spotify Jam itself keeps going in Spotify: we only stop offering it to newcomers.
 */
export class ListeningZoneManager {
    private leaveSubscription: Subscription | undefined;
    private readonly checks = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private gameRoom: Pick<
            GameRoom,
            "getAreaPropertyVariable" | "setAreaPropertyVariable" | "getUsersByUuid" | "destroyRoomStream" | "getWam"
        >,
        areaZoneTracker: Pick<AreaZoneTracker, "registerEventListener">,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
    ) {
        this.leaveSubscription = areaZoneTracker
            .registerEventListener("leave", "listeningZonePropertyData")
            .subscribe((area) => {
                this.scheduleCheck(area, HOST_GRACE_MS);
            });

        // No need to unsubscribe since GameRoom.destroy completes this stream.
        // eslint-disable-next-line rxjs/no-ignored-subscription,svelte/no-ignored-unsubscribe
        this.gameRoom.destroyRoomStream.subscribe(() => {
            this.leaveSubscription?.unsubscribe();
            this.leaveSubscription = undefined;
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
            const area = this.listeningArea(areaId, propertyId);
            if (!area || parseListeningZoneJams(value).length === 0) {
                continue;
            }
            this.gameRoom.setAreaPropertyVariable(areaId, propertyId, LISTENING_ZONE_JAM_VARIABLE, value);
            this.scheduleCheck(area, RESTORED_ROOMS_GRACE_MS);
        }
    }

    private scheduleCheck(area: AreaData, delayMs: number): void {
        clearTimeout(this.checks.get(area.id));
        this.checks.set(
            area.id,
            setTimeout(() => {
                this.checks.delete(area.id);
                this.closeRoomsWhoseHostLeft(area);
            }, delayMs),
        );
    }

    private closeRoomsWhoseHostLeft(area: AreaData): void {
        for (const property of area.properties) {
            if (property.type !== "listeningZonePropertyData") {
                continue;
            }
            const jams = parseListeningZoneJams(
                this.gameRoom.getAreaPropertyVariable(area.id, property.id, LISTENING_ZONE_JAM_VARIABLE),
            );
            // The host may have several tabs open: their room stays while one of them is inside the zone.
            const remaining = jams.filter((jam) =>
                [...this.gameRoom.getUsersByUuid(jam.hostUuid)].some((user) =>
                    AreaZoneTracker.isPositionInArea(user.getPosition(), area),
                ),
            );
            if (remaining.length !== jams.length) {
                this.gameRoom.setAreaPropertyVariable(
                    area.id,
                    property.id,
                    LISTENING_ZONE_JAM_VARIABLE,
                    JSON.stringify(remaining),
                );
            }
        }
    }

    private listeningArea(areaId: string | undefined, propertyId: string | undefined): AreaData | undefined {
        const wam: WAMFileFormat | undefined = this.gameRoom.getWam();
        const area = wam?.areas.find((candidate) => candidate.id === areaId);
        const isListeningZone = area?.properties.some(
            (property) => property.id === propertyId && property.type === "listeningZonePropertyData",
        );
        return isListeningZone ? area : undefined;
    }

    private hashKey(): string {
        return `listening-zone-jams:${this.store?.roomUrl ?? ""}`;
    }

    private field(areaId: string, propertyId: string): string {
        return `${areaId}${FIELD_DELIMITER}${propertyId}`;
    }
}
