import { isHomeJam } from "@workadventure/map-editor";
import type { SpotifyListening } from "@workadventure/messages";
import { isPlayingTrack } from "../../../../common/SpotifyListening";
import type { JamRoom } from "../../../ListeningZone/ListeningZoneController";

/** A listening zone of the map, by its area: the rectangle in map pixels. */
export interface LampZone {
    areaId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A Jam of the map (Spotify, not a Jukebox: only those carry music), as every client sees it. */
export interface LampJam {
    areaId: string;
    hostUuid: string;
    /** Whether its host plays a track: without it there is no music to follow. */
    playing: boolean;
    participants: number;
}

/** The Jam a lamp follows: the zone it was opened in, and its host. */
export interface LampJamChoice {
    areaId: string;
    hostUuid: string;
}

function contains(zone: LampZone, point: { x: number; y: number }): boolean {
    return point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height;
}

/** The most crowded Jam; on a tie the smallest host id, so that every client picks the same one. */
function mostCrowded(jams: readonly LampJam[]): LampJam | undefined {
    return [...jams].sort(
        (a, b) => b.participants - a.participants || (a.hostUuid < b.hostUuid ? -1 : a.hostUuid > b.hostUuid ? 1 : 0),
    )[0];
}

/**
 * Which Jam a lamp follows. Every client works it out the same way from what everyone shares, so nothing has to be
 * sent and no two players disagree.
 *  1. A lamp inside a listening zone (the smallest one if they are nested) follows a Jam of that zone whose host plays:
 *     the one the user listens to if it is among them, else the most crowded. It belongs to its zone: with no Jam
 *     playing there, it is off, whatever the other zones do.
 *  2. A lamp outside every zone follows the Jam the user listens to; else the only Jam that plays; else the most
 *     crowded of those that play.
 *  3. Otherwise it is off (undefined).
 */
export function resolveLampJam(input: {
    source: { x: number; y: number };
    zones: readonly LampZone[];
    jams: readonly LampJam[];
    listening: LampJamChoice | undefined;
}): LampJamChoice | undefined {
    const { source, zones, jams, listening } = input;
    const playing = jams.filter((jam) => jam.playing);
    const isListened = (jam: LampJam): boolean =>
        listening !== undefined && jam.areaId === listening.areaId && jam.hostUuid === listening.hostUuid;
    const pick = (candidates: readonly LampJam[]): LampJamChoice | undefined => {
        const chosen = candidates.find(isListened) ?? mostCrowded(candidates);
        return chosen && { areaId: chosen.areaId, hostUuid: chosen.hostUuid };
    };

    const zone = zones
        .filter((candidate) => contains(candidate, source))
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (zone) {
        return pick(playing.filter((jam) => jam.areaId === zone.areaId));
    }
    // Outside every zone: the listened Jam, else the one that plays alone, else the most crowded: all of it is `pick`,
    // which prefers the listened one and otherwise the most crowded (the only one when there is a single Jam).
    return pick(playing);
}

/**
 * The Jams of the map as candidates for the lamps: the Spotify ones (a Jukebox plays on each one's own Spotify, no music
 * travels through the media session), whether their host plays a track, and how many take part.
 */
export function lampJamsOf(
    rooms: readonly JamRoom[],
    listeningByUserUuid: ReadonlyMap<string, SpotifyListening>,
    participantsByHost: ReadonlyMap<string, number>,
): LampJam[] {
    return rooms
        .filter((room) => !isHomeJam(room.jam))
        .map((room) => ({
            areaId: room.zone.areaId,
            hostUuid: room.jam.hostUuid,
            playing: isPlayingTrack(listeningByUserUuid.get(room.jam.hostUuid)),
            participants: participantsByHost.get(room.jam.hostUuid) ?? 0,
        }));
}
