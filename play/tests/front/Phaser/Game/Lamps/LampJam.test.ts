import { describe, expect, it } from "vitest";
import {
    lampJamsOf,
    resolveLampJam,
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

        it("follows the only Jam that plays on the map when the user listens to none", () => {
            const choice = resolveLampJam({
                source: outside,
                zones: [club, lounge],
                jams: [jam("club", "a", 1, false), jam("lounge", "b")],
                listening: undefined,
            });
            expect(choice).toEqual({ areaId: "lounge", hostUuid: "b" });
        });

        it("follows the most crowded of several Jams that play, when the user listens to none", () => {
            const choice = resolveLampJam({
                source: outside,
                zones: [club, lounge],
                jams: [jam("club", "a", 2), jam("lounge", "b", 6)],
                listening: undefined,
            });
            expect(choice).toEqual({ areaId: "lounge", hostUuid: "b" });
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
    const spotifyRoom = (areaId: string, hostUuid: string) =>
        ({ zone: { areaId }, jam: { url: `https://open.spotify.com/jam/${hostUuid}`, hostUuid } }) as never;
    const jukeboxRoom = (areaId: string, hostUuid: string) =>
        ({ zone: { areaId }, jam: { home: true, hostUuid } }) as never;
    const playingTrack = { trackTitle: "Time", artistName: "Pink Floyd" } as never;
    const silent = { trackTitle: "", artistName: "" } as never;

    it("makes a candidate of each Spotify Jam, with whether its host plays and how many take part", () => {
        const jams = lampJamsOf([spotifyRoom("club", "a")], new Map([["a", playingTrack]]), new Map([["a", 4]]));
        expect(jams).toEqual([{ areaId: "club", hostUuid: "a", playing: true, participants: 4 }]);
    });

    it("leaves out the Jukeboxes: their music does not travel through the media session", () => {
        expect(lampJamsOf([jukeboxRoom("club", "a")], new Map([["a", playingTrack]]), new Map())).toEqual([]);
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
