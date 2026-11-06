import { describe, expect, it } from "vitest";
import type { ListeningZoneJam } from "@workadventure/map-editor";
import type { JamRoomDirectory } from "../src/Model/AreaPropertyEvents/JamSpaceAccess";
import {
    buildJamSpaceName,
    parseJamSpaceName,
    resolveJamSpaceAccess,
} from "../src/Model/AreaPropertyEvents/JamSpaceAccess";

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
            url === roomUrl && areaId === "area-1" && propertyId === "prop-1" ? jams : undefined,
        isUserInRoom: (url, uuid) => url === roomUrl && present.includes(uuid),
    };
}

const spaceName = buildJamSpaceName({ roomUrl: ROOM, areaId: "area-1", propertyId: "prop-1", hostUuid: HOST });

describe("jam space names", () => {
    it("reads back what it built, even behind the world prefix the pusher adds", () => {
        expect(parseJamSpaceName(`world.${spaceName}`)).toEqual({
            roomUrl: ROOM,
            areaId: "area-1",
            propertyId: "prop-1",
            hostUuid: HOST,
        });
    });

    it("keeps a name without a dot or a colon inside its parts", () => {
        const name = buildJamSpaceName({ roomUrl: ROOM, areaId: "a:b.c", propertyId: "p", hostUuid: HOST });

        expect(parseJamSpaceName(name)?.areaId).toBe("a:b.c");
    });

    it("does not take an ordinary space for a Jam", () => {
        expect(parseJamSpaceName("world.some-bubble")).toBeUndefined();
        expect(parseJamSpaceName("world.jam:only:three:parts")).toBeUndefined();
    });
});

describe("resolveJamSpaceAccess", () => {
    it("leaves an ordinary space alone", () => {
        expect(resolveJamSpaceAccess("world.some-bubble", { uuid: GUEST, playUri: ROOM }, directory())).toEqual({
            kind: "not-a-jam",
        });
    });

    it("lets the host publish the music", () => {
        expect(resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, directory())).toEqual({
            kind: "jam",
            canPublishMusic: true,
        });
    });

    it("lets a guest in without the right to publish the music", () => {
        expect(resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: ROOM }, directory())).toEqual({
            kind: "jam",
            canPublishMusic: false,
        });
    });

    it("refuses a guest who names themselves host in the space name", () => {
        const forged = buildJamSpaceName({ roomUrl: ROOM, areaId: "area-1", propertyId: "prop-1", hostUuid: GUEST });

        expect(resolveJamSpaceAccess(forged, { uuid: GUEST, playUri: ROOM }, directory())).toEqual({ kind: "refused" });
    });

    it("refuses a user who is on another map than the Jam", () => {
        expect(resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: OTHER_ROOM }, directory())).toEqual({
            kind: "refused",
        });
    });

    it("refuses a user the room does not hold, whatever their playUri says", () => {
        expect(
            resolveJamSpaceAccess(spaceName, { uuid: GUEST, playUri: ROOM }, directory({ present: [HOST] })),
        ).toEqual({
            kind: "refused",
        });
    });

    it("refuses once the Jam is closed", () => {
        expect(resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, directory({ jams: [] }))).toEqual({
            kind: "refused",
        });
    });

    it("refuses a Jam of a room the back does not know", () => {
        expect(
            resolveJamSpaceAccess(spaceName, { uuid: HOST, playUri: ROOM }, directory({ roomUrl: OTHER_ROOM })),
        ).toEqual({ kind: "refused" });
    });
});
