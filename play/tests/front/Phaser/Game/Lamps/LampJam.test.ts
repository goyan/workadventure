import { describe, expect, it } from "vitest";
import type { JamRoom } from "../../../../../src/front/ListeningZone/ListeningZoneController";
import { EMPTY_SPOTIFY_LISTENING } from "../../../../../src/common/SpotifyListening";
import {
    lampJamsOf,
    defaultLampZone,
    jamOfSpaces,
    lampLightZone,
    resolveLampJam,
    zoneOf,
    type LampJam,
    type LampZone,
} from "../../../../../src/front/Phaser/Game/Lamps/LampJam";

const club: LampZone = { areaId: "club", x: 0, y: 0, width: 400, height: 300 };
const lounge: LampZone = { areaId: "lounge", x: 600, y: 0, width: 300, height: 300 };
const inClub = { x: 100, y: 100 };
const outside = { x: 500, y: 500 };

function jam(areaId: string, hostUuid: string, participants = 1, playing = true): LampJam {
    return { areaId, hostUuid, participants, playing };
}

describe("resolveLampJam", () => {
    describe("a lamp inside a listening zone", () => {
        it("follows the Jam of that zone whose host plays", () => {
            const choice = resolveLampJam({
                source: inClub,
                zones: [club, lounge],
                jams: [jam("lounge", "b"), jam("club", "a")],
                listening: undefined,
            });
            expect(choice).toEqual({ areaId: "club", hostUuid: "a" });
        });

        it("is off when no Jam of its zone plays, even if another zone has one: it belongs to its zone", () => {
            const choice = resolveLampJam({
                source: inClub,
                zones: [club, lounge],
                jams: [jam("lounge", "b"), jam("club", "a", 3, false)],
                listening: undefined,
            });
            expect(choice).toBeUndefined();
        });

        it("prefers the Jam the user listens to among those of the zone", () => {
            const choice = resolveLampJam({
                source: inClub,
                zones: [club],
                jams: [jam("club", "a", 9), jam("club", "b", 1)],
                listening: { areaId: "club", hostUuid: "b" },
            });
            expect(choice).toEqual({ areaId: "club", hostUuid: "b" });
        });

        it("otherwise takes the most crowded Jam of the zone", () => {
            const choice = resolveLampJam({
                source: inClub,
                zones: [club],
                jams: [jam("club", "a", 2), jam("club", "b", 5), jam("club", "c", 3)],
                listening: undefined,
            });
            expect(choice).toEqual({ areaId: "club", hostUuid: "b" });
        });

        it("breaks a tie on the smallest host id, so that every client picks the same one", () => {
            const jams = [jam("club", "zed", 4), jam("club", "amy", 4), jam("club", "bob", 4)];
            const forward = resolveLampJam({ source: inClub, zones: [club], jams, listening: undefined });
            const backward = resolveLampJam({
                source: inClub,
                zones: [club],
                jams: [...jams].reverse(),
                listening: undefined,
            });
            expect(forward).toEqual({ areaId: "club", hostUuid: "amy" });
            expect(backward).toEqual(forward);
        });

        it("ignores the Jam the user listens to when its host does not play", () => {
            const choice = resolveLampJam({
                source: inClub,
                zones: [club],
                jams: [jam("club", "a", 1, false), jam("club", "b", 1, true)],
                listening: { areaId: "club", hostUuid: "a" },
            });
            expect(choice).toEqual({ areaId: "club", hostUuid: "b" });
        });

        it("belongs to the smallest zone when zones are nested", () => {
            const hall: LampZone = { areaId: "hall", x: 0, y: 0, width: 1000, height: 1000 };
            const choice = resolveLampJam({
                source: inClub,
                zones: [hall, club],
                jams: [jam("hall", "h"), jam("club", "c")],
                listening: undefined,
            });
            expect(choice).toEqual({ areaId: "club", hostUuid: "c" });
        });

        it("counts the edges of a zone as inside, like the areas of the map", () => {
            const choice = resolveLampJam({
                source: { x: 400, y: 300 },
                zones: [club],
                jams: [jam("club", "a")],
                listening: undefined,
            });
            expect(choice).toEqual({ areaId: "club", hostUuid: "a" });
        });
    });

    describe("a lamp outside every listening zone", () => {
        it("follows the Jam the user listens to", () => {
            const choice = resolveLampJam({
                source: outside,
                zones: [club, lounge],
                jams: [jam("club", "a", 9), jam("lounge", "b", 1)],
                listening: { areaId: "lounge", hostUuid: "b" },
            });
            expect(choice).toEqual({ areaId: "lounge", hostUuid: "b" });
        });

        it("stays off when the user listens to no Jam, even if a single Jam plays on the map", () => {
            const choice = resolveLampJam({
                source: outside,
                zones: [club, lounge],
                jams: [jam("club", "a", 1, false), jam("lounge", "b")],
                listening: undefined,
            });
            expect(choice).toBeUndefined();
        });

        it("stays off when the user listens to no Jam, even if several play: no crowd decides for a lamp that belongs to no zone", () => {
            const choice = resolveLampJam({
                source: outside,
                zones: [club, lounge],
                jams: [jam("club", "a", 2), jam("lounge", "b", 6)],
                listening: undefined,
            });
            expect(choice).toBeUndefined();
        });

        it("stays off when the Jam the user listens to plays nothing, whatever the others do", () => {
            const choice = resolveLampJam({
                source: outside,
                zones: [club, lounge],
                jams: [jam("club", "a", 1, false), jam("lounge", "b", 6)],
                listening: { areaId: "club", hostUuid: "a" },
            });
            expect(choice).toBeUndefined();
        });

        it("is off when nothing plays", () => {
            expect(
                resolveLampJam({
                    source: outside,
                    zones: [club],
                    jams: [jam("club", "a", 1, false)],
                    listening: undefined,
                }),
            ).toBeUndefined();
        });
    });

    it("is off on a map without any Jam", () => {
        expect(resolveLampJam({ source: inClub, zones: [club], jams: [], listening: undefined })).toBeUndefined();
    });
});

describe("lampJamsOf", () => {
    const spotifyRoom = (areaId: string, hostUuid: string): JamRoom => ({
        zone: { areaId, areaName: areaId, propertyId: "music" },
        jam: { url: `https://open.spotify.com/jam/${hostUuid}`, hostUuid, hostName: hostUuid },
    });
    const jukeboxRoom = (areaId: string, hostUuid: string): JamRoom => ({
        zone: { areaId, areaName: areaId, propertyId: "music" },
        jam: { home: true, hostUuid, hostName: hostUuid },
    });
    const playingTrack = { ...EMPTY_SPOTIFY_LISTENING, trackTitle: "Time", artistName: "Pink Floyd" };
    const silent = EMPTY_SPOTIFY_LISTENING;

    it("makes a candidate of each Spotify Jam, with whether its host plays and how many take part", () => {
        const jams = lampJamsOf([spotifyRoom("club", "a")], new Map([["a", playingTrack]]), new Map([["a", 4]]));
        expect(jams).toEqual([{ areaId: "club", hostUuid: "a", playing: true, participants: 4 }]);
    });

    it("includes Jukeboxes so their lamps can follow the local Spotify analysis", () => {
        expect(lampJamsOf([jukeboxRoom("club", "a")], new Map([["a", playingTrack]]), new Map())).toEqual([
            { areaId: "club", hostUuid: "a", playing: true, participants: 0 },
        ]);
    });

    it("says a Jam is not playing when its host plays nothing, or is not known", () => {
        const jams = lampJamsOf(
            [spotifyRoom("club", "a"), spotifyRoom("club", "b")],
            new Map([["a", silent]]),
            new Map(),
        );
        expect(jams.map((jam) => jam.playing)).toEqual([false, false]);
    });

    it("counts no one when nobody is known to take part", () => {
        expect(lampJamsOf([spotifyRoom("club", "a")], new Map(), new Map())[0].participants).toBe(0);
    });
});

describe("zoneOf", () => {
    it("finds the listening zone a lamp stands in: its light stays within", () => {
        expect(zoneOf(inClub, [club, lounge])).toEqual(club);
    });

    it("is undefined for a lamp outside every zone: nothing to keep its light in", () => {
        expect(zoneOf(outside, [club, lounge])).toBeUndefined();
    });

    it("takes the smallest zone when they are nested", () => {
        const hall: LampZone = { areaId: "hall", x: 0, y: 0, width: 1000, height: 1000 };
        expect(zoneOf(inClub, [hall, club])).toEqual(club);
        expect(zoneOf(inClub, [club, hall])).toEqual(club);
    });

    it("counts the edge of a zone as inside", () => {
        expect(zoneOf({ x: 400, y: 300 }, [club])).toEqual(club);
        expect(zoneOf({ x: 401, y: 300 }, [club])).toBeUndefined();
    });
});

describe("jamOfSpaces", () => {
    const rooms = [
        { areaId: "club", hostUuid: "a" },
        { areaId: "club", hostUuid: "b" },
    ];
    const spaceNameOf = (choice: { areaId: string; hostUuid: string }) => `space:${choice.areaId}:${choice.hostUuid}`;

    it("finds the Jam of the space the user listens to", () => {
        expect(jamOfSpaces(rooms, spaceNameOf, ["space:club:b"])).toEqual({ areaId: "club", hostUuid: "b" });
    });

    it("finds the Jam whose music the user shares: a host hears their own Jam", () => {
        expect(jamOfSpaces(rooms, spaceNameOf, [undefined, "space:club:a"])).toEqual({ areaId: "club", hostUuid: "a" });
    });

    it("prefers the first of the spaces, the one listened to", () => {
        expect(jamOfSpaces(rooms, spaceNameOf, ["space:club:b", "space:club:a"])).toEqual({
            areaId: "club",
            hostUuid: "b",
        });
    });

    it("is undefined when the user is in none of these spaces", () => {
        expect(jamOfSpaces(rooms, spaceNameOf, [undefined, undefined])).toBeUndefined();
        expect(jamOfSpaces(rooms, spaceNameOf, ["space:elsewhere:x"])).toBeUndefined();
    });
});

describe("defaultLampZone", () => {
    it("is a square around the lamp, 12 tiles wide, so that the light of a lamp outside every zone does not wash over the map", () => {
        expect(defaultLampZone("lamp-1", { x: 500, y: 400 })).toEqual({
            areaId: "lamp:lamp-1",
            x: 308,
            y: 208,
            width: 384,
            height: 384,
        });
    });

    it("follows the lamp when it is moved", () => {
        expect(defaultLampZone("lamp-1", { x: 100, y: 100 })).toMatchObject({ x: -92, y: -92 });
    });

    it("is one zone per lamp: two lamps never share a clip", () => {
        expect(defaultLampZone("a", { x: 0, y: 0 }).areaId).not.toBe(defaultLampZone("b", { x: 0, y: 0 }).areaId);
    });
});

describe("lampLightZone", () => {
    const inside = { x: 100, y: 100 };

    it("fills its listening zone when no size is set: the light of a room stays in the room", () => {
        expect(lampLightZone({ id: "l", source: inside, zones: [club] })).toEqual(club);
    });

    it("is a square of 12 tiles around the lamp when it stands in no zone and no size is set", () => {
        expect(lampLightZone({ id: "l", source: outside, zones: [club] })).toEqual({
            areaId: "lamp:l",
            x: 308,
            y: 308,
            width: 384,
            height: 384,
        });
    });

    it("is the size set for the lamp, in tiles, centred on it, outside every zone", () => {
        expect(
            lampLightZone({ id: "l", source: outside, zones: [club], sizeInTiles: { width: 8, height: 4 } }),
        ).toEqual({
            areaId: "lamp:l",
            x: 372,
            y: 436,
            width: 256,
            height: 128,
        });
    });

    it("is the size set for the lamp when it fits in its zone: a lamp lights part of a room", () => {
        const zone = lampLightZone({
            id: "l",
            source: { x: 200, y: 150 },
            zones: [club],
            sizeInTiles: { width: 4, height: 4 },
        });
        expect(zone).toEqual({ areaId: "lamp:l", x: 136, y: 86, width: 128, height: 128 });
    });

    it("never leaves its zone, whatever the size set: the light of a room stays in the room", () => {
        const zone = lampLightZone({ id: "l", source: inside, zones: [club], sizeInTiles: { width: 30, height: 30 } });
        expect(zone).toEqual({ areaId: "lamp:l", x: 0, y: 0, width: 400, height: 300 });
    });

    it("is cut at the edge of its zone when the lamp stands near it", () => {
        // 12 tiles around (390, 290): from 198 to 582 across, from 98 to 482 down; the zone ends at 400 and 300.
        const zone = lampLightZone({
            id: "l",
            source: { x: 390, y: 290 },
            zones: [club],
            sizeInTiles: { width: 12, height: 12 },
        });
        expect(zone).toEqual({ areaId: "lamp:l", x: 198, y: 98, width: 202, height: 202 });
    });

    it("has one clip of its own once a size is set, so that two lamps of one zone do not share it", () => {
        const sized = lampLightZone({ id: "a", source: inside, zones: [club], sizeInTiles: { width: 4, height: 4 } });
        expect(sized.areaId).toBe("lamp:a");
        expect(lampLightZone({ id: "a", source: inside, zones: [club] }).areaId).toBe("club");
    });
});
