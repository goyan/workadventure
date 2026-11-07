import type { SpotifyListening } from "@workadventure/messages";
import { isPlayingTrack } from "../../common/SpotifyListening";
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

/**
 * The track shown on the line of a user: the one they play themselves, or, for someone in a Jam who plays nothing (a
 * guest who listens to the streamed music), the one their host plays: that is the music they hear.
 */
export function shownTrackOf(
    own: SpotifyListening | undefined,
    listeningByUserUuid: ReadonlyMap<string, SpotifyListening>,
): SpotifyListening | undefined {
    if (!own) {
        return undefined;
    }
    // Plain checks rather than the type guards: those narrow the other branch to `never`.
    if (own.trackTitle !== "") {
        return own;
    }
    if (own.jamAreaId === "" || !own.jamHostUuid) {
        return undefined;
    }
    const host = listeningByUserUuid.get(own.jamHostUuid);
    return isPlayingTrack(host) ? host : undefined;
}
