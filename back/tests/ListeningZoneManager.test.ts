import type { AreaData, ListeningZoneJam } from "@workadventure/map-editor";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { ListeningZoneManager } from "../src/Model/AreaPropertyEvents/ListeningZoneManager";
import type { User } from "../src/Model/User";

const area: AreaData = {
    id: "lounge",
    name: "Lounge",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    properties: [{ id: "listening", type: "listeningZonePropertyData" }],
};

const jam: ListeningZoneJam = { url: "https://spotify.link/abc123", hostUuid: "host", hostName: "Host" };
// Another room, whose host stays in the zone: it must survive the other host leaving.
const otherJam: ListeningZoneJam = { home: true, hostUuid: "other", hostName: "Other" };

function createHarness(hostPositions: { x: number; y: number }[]) {
    const leaveSubject = new Subject<AreaData>();
    const variables = new Map<string, string>([["lounge:listening:jam", JSON.stringify([jam, otherJam])]]);
    const setAreaPropertyVariable = vi.fn((areaId: string, propertyId: string, key: string, value: string) => {
        variables.set(`${areaId}:${propertyId}:${key}`, value);
        return true;
    });

    new ListeningZoneManager(
        {
            getAreaPropertyVariable: (areaId: string, propertyId: string, key: string) =>
                variables.get(`${areaId}:${propertyId}:${key}`),
            setAreaPropertyVariable,
            getUsersByUuid: (uuid: string) =>
                new Set(
                    (uuid === "host" ? hostPositions : uuid === "other" ? [{ x: 50, y: 50 }] : []).map(
                        (position) => ({ getPosition: () => position }) as unknown as User,
                    ),
                ),
            destroyRoomStream: new Subject<void>().asObservable(),
        },
        { registerEventListener: () => leaveSubject.asObservable() },
    );

    return { leaveSubject, setAreaPropertyVariable };
}

describe("ListeningZoneManager", () => {
    it("closes the room of a host who is no longer in the zone, and only theirs", () => {
        const { leaveSubject, setAreaPropertyVariable } = createHarness([{ x: 500, y: 500 }]);

        leaveSubject.next(area);

        expect(setAreaPropertyVariable).toHaveBeenCalledWith("lounge", "listening", "jam", JSON.stringify([otherJam]));
    });

    it("closes the room of a host who disconnected", () => {
        const { leaveSubject, setAreaPropertyVariable } = createHarness([]);

        leaveSubject.next(area);

        expect(setAreaPropertyVariable).toHaveBeenCalledWith("lounge", "listening", "jam", JSON.stringify([otherJam]));
    });

    it("keeps a room while its host is still in the zone, in any tab", () => {
        const { leaveSubject, setAreaPropertyVariable } = createHarness([
            { x: 500, y: 500 },
            { x: 50, y: 50 },
        ]);

        leaveSubject.next(area);

        expect(setAreaPropertyVariable).not.toHaveBeenCalled();
    });
});
