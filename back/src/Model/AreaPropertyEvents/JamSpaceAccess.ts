import type { ListeningZoneJam } from "@workadventure/map-editor";
import { LISTENING_ZONE_JAM_VARIABLE, parseListeningZoneJams } from "@workadventure/map-editor";
import type { GameRoom } from "../GameRoom";

/**
 * The space that relays the media of a Jam (its host's music, everyone's screens) is named after the Jam it serves:
 * `jam:<room>:<area>:<property>:<host>`, each part encoded without any `:` or `.`. The pusher puts the world in front
 * of the name (`<world>.jam:…`), so the name is read from its end. A name proves nothing by itself: whoever knows it can
 * ask to join, so the back decides on what the room holds, never on what the name says.
 */
const JAM_SPACE_NAME = /(?:^|\.)jam:([^:.]+):([^:.]+):([^:.]+):([^:.]+)$/;

export interface JamSpaceParts {
    roomUrl: string;
    areaId: string;
    propertyId: string;
    hostUuid: string;
}

function encodePart(value: string): string {
    return encodeURIComponent(value).replace(/\./g, "%2E");
}

export function buildJamSpaceName({ roomUrl, areaId, propertyId, hostUuid }: JamSpaceParts): string {
    return `jam:${[roomUrl, areaId, propertyId, hostUuid].map(encodePart).join(":")}`;
}

export function parseJamSpaceName(spaceName: string): JamSpaceParts | undefined {
    const match = JAM_SPACE_NAME.exec(spaceName);
    if (!match) {
        return undefined;
    }
    try {
        const [roomUrl, areaId, propertyId, hostUuid] = match.slice(1).map((part) => decodeURIComponent(part));
        return { roomUrl, areaId, propertyId, hostUuid };
    } catch {
        // A malformed escape sequence: not a name we built.
        return undefined;
    }
}

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
