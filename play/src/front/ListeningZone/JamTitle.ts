import type { SpotifyListening } from "@workadventure/messages";
import type { JamRoom } from "./ListeningZoneController";

/**
 * What names the Jam someone takes part in, in the list of users: the title of its room, then the zone it is in.
 * The title is looked up among the rooms of the map by zone and host, since the listening only carries their ids; empty
 * when the listening names neither.
 */
export function jamLabelOf(rooms: readonly JamRoom[], listening: SpotifyListening): string {
    const title = listening.jamHostUuid
        ? rooms.find((room) => room.zone.areaId === listening.jamAreaId && room.jam.hostUuid === listening.jamHostUuid)
              ?.jam.title
        : undefined;
    return [title, listening.jamAreaName].filter(Boolean).join(" · ");
}
