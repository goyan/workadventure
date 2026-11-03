import type { Subscription } from "rxjs";
import type { AreaData } from "@workadventure/map-editor";
import { LISTENING_ZONE_JAM_VARIABLE, parseListeningZoneJam } from "@workadventure/map-editor";
import type { GameRoom } from "../GameRoom";
import { AreaZoneTracker } from "../AreaZoneTracker";

/**
 * Removes the Spotify Jam shared in a listening zone as soon as its host is no longer inside the zone, whether they
 * walked out or disconnected. The Jam itself keeps going in Spotify: we only stop offering it to newcomers.
 */
export class ListeningZoneManager {
    private leaveSubscription: Subscription | undefined;

    constructor(
        private gameRoom: Pick<
            GameRoom,
            "getAreaPropertyVariable" | "setAreaPropertyVariable" | "getUsersByUuid" | "destroyRoomStream"
        >,
        areaZoneTracker: Pick<AreaZoneTracker, "registerEventListener">,
    ) {
        this.leaveSubscription = areaZoneTracker
            .registerEventListener("leave", "listeningZonePropertyData")
            .subscribe((area) => {
                this.removeJamIfHostLeft(area);
            });

        // No need to unsubscribe since GameRoom.destroy completes this stream.
        // eslint-disable-next-line rxjs/no-ignored-subscription,svelte/no-ignored-unsubscribe
        this.gameRoom.destroyRoomStream.subscribe(() => {
            this.leaveSubscription?.unsubscribe();
            this.leaveSubscription = undefined;
        });
    }

    private removeJamIfHostLeft(area: AreaData): void {
        for (const property of area.properties) {
            if (property.type !== "listeningZonePropertyData") {
                continue;
            }
            const jam = parseListeningZoneJam(
                this.gameRoom.getAreaPropertyVariable(area.id, property.id, LISTENING_ZONE_JAM_VARIABLE),
            );
            if (jam === null) {
                continue;
            }
            // The host may have several tabs open: the Jam stays while one of them is still in the zone.
            const hostIsInside = [...this.gameRoom.getUsersByUuid(jam.hostUuid)].some((user) =>
                AreaZoneTracker.isPositionInArea(user.getPosition(), area),
            );
            if (!hostIsInside) {
                this.gameRoom.setAreaPropertyVariable(area.id, property.id, LISTENING_ZONE_JAM_VARIABLE, "null");
            }
        }
    }
}
