import { describe, expect, it } from "vitest";
import type { ListeningZoneJam } from "@workadventure/map-editor";
import { buildJamSpaceName, buildKaraokeStageSpaceName } from "@workadventure/map-editor";
import type { JamRoomDirectory } from "../src/Model/AreaPropertyEvents/JamSpaceAccess";
import { createJamRoomDirectory, resolveJamSpaceAccess } from "../src/Model/AreaPropertyEvents/JamSpaceAccess";

const ROOM = "https://play.example.org/_/global/maps.example.org/office.wam";
const OTHER_ROOM = "https://play.example.org/_/global/maps.example.org/garden.wam";
const HOST = "uuid-host";
const GUEST = "uuid-guest";

const homeJam: ListeningZoneJam = { home: true, hostUuid: HOST, hostName: "Hôte" };

function directory(
    options: { jams?: ListeningZoneJam[]; present?: string[]; roomUrl?: string } = {},
): JamRoomDirectory {
    const { jams = [homeJam], present = [HOST, GUEST], roomUrl = ROOM } = options;
    return {
        getJams: (url, areaId, propertyId) =>
            Promise.resolve(url === roomUrl && areaId === "area-1" && propertyId === "prop-1" ? jams : undefined),
        isUserInRoom: (url, uuid) => Promise.resolve(url === roomUrl && present.includes(uuid)),
    };
}

const spaceName = buildJamSpaceName({ roomUrl: ROOM, areaId: "area-1", propertyId: "prop-1", hostUuid: HOST });

describe("resolveJamSpaceAccess", () => {
    const stage = {
        areaId: "area-1",
        propertyId: "prop-1",
        hostUuid: HOST,
        enabled: true,
        turnId: "00000000-0000-4000-8000-000000000001",
        singerUuid: GUEST,
        queue: [],
        applause: 0,
    };
    const stageName = buildKaraokeStageSpaceName({ ...stage, roomUrl: ROOM });
    const stageDirectory: JamRoomDirectory = { ...directory(), getKaraokeStage: () => Promise.resolve(stage) };
    it("gives the chosen singer the mic and the host only listening rights", async () => {
        expect(await resolveJamSpaceAccess(stageName, { uuid: GUEST, playUri: ROOM }, stageDirectory)).toEqual({
            kind: "karaoke",
            canSing: true,
        });
        expect(await resolveJamSpaceAccess(stageName, { uuid: HOST, playUri: ROOM }, stageDirectory)).toEqual({
            kind: "karaoke",
            canSing: false,
        });
    });
    it("rejects a previous turn, a forged singer, a closed stage and an absent guest", async () => {
        const forgedNames = [
            buildKaraokeStageSpaceName({ ...stage, roomUrl: ROOM, turnId: "00000000-0000-4000-8000-000000000002" }),
            buildKaraokeStageSpaceName({ ...stage, roomUrl: ROOM, singerUuid: HOST }),
        ];
        const results = await Promise.all(
            forgedNames.map((forged) => resolveJamSpaceAccess(forged, { uuid: GUEST, playUri: ROOM }, stageDirectory)),
        );
        expect(results).toEqual([{ kind: "refused" }, { kind: "refused" }]);
        expect(
            await resolveJamSpaceAccess(
                stageName,
                { uuid: GUEST, playUri: ROOM },
                { ...stageDirectory, getKaraokeStage: () => Promise.resolve({ ...stage, enabled: false }) },
            ),
        ).toEqual({ kind: "refused" });
        expect(
            await resolveJamSpaceAccess(
                stageName,
                { uuid: GUEST, playUri: ROOM },
                { ...stageDirectory, isUserInRoom: () => Promise.resolve(false) },
            ),
        ).toEqual({ kind: "refused" });
    });
    it("leaves an ordinary space alone", async () => {
        expect(await resolveJamSpaceAccess("world.some-bubble", { uuid: GUEST, playUri: ROOM }, directory())).toEqual({
            kind: "not-a-jam",
        });
    });

    it("lets the host publish the music", async () => {
        expect(await resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, directory())).toEqual({
            kind: "jam",
            canPublishMusic: true,
        });
    });

    it("lets a guest in without the right to publish the music", async () => {
        expect(await resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: ROOM }, directory())).toEqual({
            kind: "jam",
            canPublishMusic: false,
        });
    });

    it.each(["https://spotify.link/expired", "https://spotify.link/fresh"])(
        "keeps the same Jam space, host publishing and guest listening, whatever its invite link (%s)",
        async (url) => {
            // The space name holds the room, the zone and the host: never the invite link.
            const jams: ListeningZoneJam[] = [{ url, hostUuid: HOST, hostName: "Hôte" }];
            expect(await resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, directory({ jams }))).toEqual({
                kind: "jam",
                canPublishMusic: true,
            });
            expect(await resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: ROOM }, directory({ jams }))).toEqual(
                {
                    kind: "jam",
                    canPublishMusic: false,
                },
            );
        },
    );

    it("allows a Live host to publish and its guest only to listen", async () => {
        const live: ListeningZoneJam = { live: true, hostUuid: HOST, hostName: "Host" };
        const liveDirectory = directory({ jams: [live] });
        expect(await resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, liveDirectory)).toEqual({
            kind: "jam",
            canPublishMusic: true,
        });
        expect(await resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: ROOM }, liveDirectory)).toEqual({
            kind: "jam",
            canPublishMusic: false,
        });
    });

    it("refuses a guest who names themselves host in the space name", async () => {
        const forged = buildJamSpaceName({ roomUrl: ROOM, areaId: "area-1", propertyId: "prop-1", hostUuid: GUEST });

        expect(await resolveJamSpaceAccess(forged, { uuid: GUEST, playUri: ROOM }, directory())).toEqual({
            kind: "refused",
        });
    });

    it("refuses a user who is on another map than the Jam", async () => {
        expect(await resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: OTHER_ROOM }, directory())).toEqual({
            kind: "refused",
        });
    });

    it("refuses a user the room does not hold, whatever their playUri says", async () => {
        expect(
            await resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: ROOM }, directory({ present: [HOST] })),
        ).toEqual({
            kind: "refused",
        });
    });

    it("refuses once the Jam is closed", async () => {
        expect(await resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, directory({ jams: [] }))).toEqual({
            kind: "refused",
        });
    });

    it("refuses a Jam of a room the back does not know", async () => {
        expect(
            await resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, directory({ roomUrl: OTHER_ROOM })),
        ).toEqual({ kind: "refused" });
    });
});

describe("createJamRoomDirectory", () => {
    const room = {
        getAreaPropertyVariable: (areaId: string, propertyId: string, key: string) =>
            areaId === "area-1" && propertyId === "prop-1" && key === "jam" ? JSON.stringify([homeJam]) : undefined,
        getUsersByUuid: (uuid: string) => new Set(uuid === HOST ? [{}] : []),
    };
    const rooms = new Map([[ROOM, Promise.resolve(room)]]);
    const roomDirectory = createJamRoomDirectory(() => rooms as never);

    it("reads the Jams of a zone from the variable the room holds", async () => {
        expect(await roomDirectory.getJams(ROOM, "area-1", "prop-1")).toEqual([homeJam]);
        expect(await roomDirectory.getJams(ROOM, "area-1", "other")).toEqual([]);
    });

    it("knows nothing of a room the back does not host", async () => {
        expect(await roomDirectory.getJams(OTHER_ROOM, "area-1", "prop-1")).toBeUndefined();
        expect(await roomDirectory.isUserInRoom(OTHER_ROOM, HOST)).toBe(false);
    });

    it("tells whether the room holds a user", async () => {
        expect(await roomDirectory.isUserInRoom(ROOM, HOST)).toBe(true);
        expect(await roomDirectory.isUserInRoom(ROOM, GUEST)).toBe(false);
    });
});
