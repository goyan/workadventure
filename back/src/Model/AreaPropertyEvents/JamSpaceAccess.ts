import type { ListeningZoneJam } from "@workadventure/map-editor";
import { LISTENING_ZONE_JAM_VARIABLE, parseJamSpaceName, parseListeningZoneJams } from "@workadventure/map-editor";
import type { GameRoom } from "../GameRoom";

/** What the back knows of the rooms it hosts, seen from a Jam space. */
export interface JamRoomDirectory {
    /** The Jam rooms of a listening zone, or undefined when the back does not host that room or that zone. */
    getJams(roomUrl: string, areaId: string, propertyId: string): Promise<readonly ListeningZoneJam[] | undefined>;
    isUserInRoom(roomUrl: string, userUuid: string): Promise<boolean>;
}

export type JamSpaceAccess =
    /** An ordinary space: its rights do not change. */
    { kind: "not-a-jam" } | { kind: "jam"; canPublishMusic: boolean } | { kind: "refused" };

/**
 * Who may enter the space of a Jam, and who may publish its music. The user must stand in the room of the Jam (the
 * pusher sets `playUri` from the room of their connection, and the room must hold them), that Jam must still be open,
 * and only its host publishes the music.
 */
export async function resolveJamSpaceAccess(
    spaceName: string,
    user: { uuid: string; playUri: string },
    directory: JamRoomDirectory,
): Promise<JamSpaceAccess> {
    const parts = parseJamSpaceName(spaceName);
    if (!parts) {
        return { kind: "not-a-jam" };
    }
    if (parts.roomUrl !== user.playUri || !(await directory.isUserInRoom(parts.roomUrl, user.uuid))) {
        return { kind: "refused" };
    }
    const jams = await directory.getJams(parts.roomUrl, parts.areaId, parts.propertyId);
    if (!jams?.some((jam) => jam.hostUuid === parts.hostUuid)) {
        return { kind: "refused" };
    }
    return { kind: "jam", canPublishMusic: user.uuid === parts.hostUuid };
}

/** The directory over the rooms the back hosts: a room is known by the URL its users connect with. */
export function createJamRoomDirectory(getRooms: () => ReadonlyMap<string, PromiseLike<GameRoom>>): JamRoomDirectory {
    return {
        async getJams(roomUrl, areaId, propertyId) {
            const room = await getRooms().get(roomUrl);
            if (!room) {
                return undefined;
            }
            return parseListeningZoneJams(
                room.getAreaPropertyVariable(areaId, propertyId, LISTENING_ZONE_JAM_VARIABLE),
            );
        },
        async isUserInRoom(roomUrl, userUuid) {
            const room = await getRooms().get(roomUrl);
            return room !== undefined && room.getUsersByUuid(userUuid).size > 0;
        },
    };
}
