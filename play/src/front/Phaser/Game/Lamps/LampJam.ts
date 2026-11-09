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

/**
 * The listening zone a lamp stands in (the smallest one when they are nested), or undefined outside every zone. The
 * Jam it follows comes from it (see resolveLampJam) and its light stays within it.
 */
export function zoneOf(source: { x: number; y: number }, zones: readonly LampZone[]): LampZone | undefined {
    return zones
        .filter((candidate) => contains(candidate, source))
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
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
 *  2. A lamp outside every zone follows the Jam the user listens to, if its host plays; with none, it is off: no
 *     other Jam, however crowded or alone, decides for a lamp that belongs to no zone.
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

    const zone = zoneOf(source, zones);
    if (zone) {
        return pick(playing.filter((jam) => jam.areaId === zone.areaId));
    }
    // Outside every zone: only the Jam the user listens to (and whose host plays) lights the lamp.
    const listened = playing.find(isListened);
    return listened && { areaId: listened.areaId, hostUuid: listened.hostUuid };
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

/**
 * The Jam the user hears: the first of these spaces (the one they listen to, then the one whose music they share: a
 * host hears their own Jam) that belongs to a Jam of the map.
 */
export function jamOfSpaces(
    rooms: readonly LampJamChoice[],
    spaceNameOf: (choice: LampJamChoice) => string | undefined,
    spaces: readonly (string | undefined)[],
): LampJamChoice | undefined {
    for (const space of spaces) {
        if (space === undefined) {
            continue;
        }
        const room = rooms.find((candidate) => spaceNameOf(candidate) === space);
        if (room) {
            return { areaId: room.areaId, hostUuid: room.hostUuid };
        }
    }
    return undefined;
}

/** Side of the square a lamp outside every zone lights: 12 tiles. */
const DEFAULT_LIGHT_SIDE_PX = 384;

/**
 * Where the light of a lamp that stands in no listening zone stays: a square around it. Without it the light would
 * wash over whatever is near, walls and rooms next door included. One per lamp, and it moves with the lamp.
 */
export function defaultLampZone(lampId: string, source: { x: number; y: number }): LampZone {
    return {
        areaId: `lamp:${lampId}`,
        x: source.x - DEFAULT_LIGHT_SIDE_PX / 2,
        y: source.y - DEFAULT_LIGHT_SIDE_PX / 2,
        width: DEFAULT_LIGHT_SIDE_PX,
        height: DEFAULT_LIGHT_SIDE_PX,
    };
}

const TILE_PX = 32;

function intersection(rect: LampZone, zone: LampZone): LampZone {
    const x = Math.max(rect.x, zone.x);
    const y = Math.max(rect.y, zone.y);
    const right = Math.min(rect.x + rect.width, zone.x + zone.width);
    const bottom = Math.min(rect.y + rect.height, zone.y + zone.height);
    return { areaId: rect.areaId, x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * Where the light of a lamp stays.
 *  - No size set: the listening zone it stands in (the lamps of a zone share its clip), or a square of 12 tiles around
 *    it when it stands in no zone.
 *  - A size set (in tiles, in the editor): a rectangle of that size centred on the lamp, of its own, and never beyond
 *    the zone it stands in: the light of a room stays in the room, whatever the size.
 */
export function lampLightZone(input: {
    id: string;
    source: { x: number; y: number };
    zones: readonly LampZone[];
    sizeInTiles?: { width: number; height: number };
}): LampZone {
    const { id, source, zones, sizeInTiles } = input;
    const zone = zoneOf(source, zones);
    if (!sizeInTiles) {
        return zone ?? defaultLampZone(id, source);
    }
    const width = sizeInTiles.width * TILE_PX;
    const height = sizeInTiles.height * TILE_PX;
    const rect: LampZone = { areaId: `lamp:${id}`, x: source.x - width / 2, y: source.y - height / 2, width, height };
    return zone ? intersection(rect, zone) : rect;
}
