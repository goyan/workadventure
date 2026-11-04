import type { AreaData, ListeningZoneJam, WAMFileFormat } from "@workadventure/map-editor";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    HOST_GRACE_MS,
    ListeningZoneManager,
    RESTORED_ROOMS_GRACE_MS,
} from "../src/Model/AreaPropertyEvents/ListeningZoneManager";
import type { User } from "../src/Model/User";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

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

const INSIDE = { x: 50, y: 50 };
const OUTSIDE = { x: 500, y: 500 };

function createHarness({ saved = {}, stored = [jam, otherJam] as ListeningZoneJam[] } = {}) {
    const leaveSubject = new Subject<AreaData>();
    const destroy = new Subject<void>();
    const variables = new Map<string, string>();
    if (stored.length > 0) variables.set("lounge:listening:jam", JSON.stringify(stored));
    const positions = new Map<string, { x: number; y: number }[]>([
        ["host", [OUTSIDE]],
        ["other", [INSIDE]],
    ]);
    const setAreaPropertyVariable = vi.fn((areaId: string, propertyId: string, key: string, value: string) => {
        variables.set(`${areaId}:${propertyId}:${key}`, value);
        return true;
    });
    const repository = {
        loadVariables: vi.fn(() => Promise.resolve(saved)),
        saveVariable: vi.fn(() => Promise.resolve(1)),
    } satisfies VariablesRepositoryInterface;

    const manager = new ListeningZoneManager(
        {
            getAreaPropertyVariable: (areaId: string, propertyId: string, key: string) =>
                variables.get(`${areaId}:${propertyId}:${key}`),
            setAreaPropertyVariable,
            getUsersByUuid: (uuid: string) =>
                new Set(
                    (positions.get(uuid) ?? []).map((position) => ({ getPosition: () => position }) as unknown as User),
                ),
            destroyRoomStream: destroy.asObservable(),
            getWam: () => ({ areas: [area] }) as unknown as WAMFileFormat,
        },
        { registerEventListener: () => leaveSubject.asObservable() },
        { repository, roomUrl: "https://play/room" },
    );

    return { manager, leaveSubject, destroy, positions, setAreaPropertyVariable, repository, variables };
}

describe("ListeningZoneManager", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("closes the room of a host who stays out of the zone, and only theirs", () => {
        const { leaveSubject, setAreaPropertyVariable } = createHarness();

        leaveSubject.next(area);
        vi.advanceTimersByTime(HOST_GRACE_MS);

        expect(setAreaPropertyVariable).toHaveBeenCalledWith("lounge", "listening", "jam", JSON.stringify([otherJam]));
    });

    it("keeps the room of a host who reloads the page and comes back in time", () => {
        const { leaveSubject, positions, setAreaPropertyVariable } = createHarness();

        leaveSubject.next(area);
        vi.advanceTimersByTime(HOST_GRACE_MS / 2);
        positions.set("host", [INSIDE]);
        vi.advanceTimersByTime(HOST_GRACE_MS);

        expect(setAreaPropertyVariable).not.toHaveBeenCalled();
    });

    it("keeps a room while its host is still in the zone, in any tab", () => {
        const { leaveSubject, positions, setAreaPropertyVariable } = createHarness();
        positions.set("host", [OUTSIDE, INSIDE]);

        leaveSubject.next(area);
        vi.advanceTimersByTime(HOST_GRACE_MS);

        expect(setAreaPropertyVariable).not.toHaveBeenCalled();
    });

    it("saves the rooms of a zone in their own hash, and forgets a zone without room", () => {
        const { manager, repository } = createHarness();

        manager.persist("lounge", "listening", JSON.stringify([otherJam]));
        manager.persist("lounge", "listening", "null");

        expect(repository.saveVariable.mock.calls).toEqual([
            ["listening-zone-jams:https://play/room", "lounge::listening", JSON.stringify([otherJam])],
            ["listening-zone-jams:https://play/room", "lounge::listening", ""],
        ]);
    });

    it("brings the rooms back after a restart, then closes those whose host does not return", async () => {
        const { manager, setAreaPropertyVariable } = createHarness({
            stored: [],
            saved: {
                "lounge::listening": JSON.stringify([jam, otherJam]),
                "gone::listening": JSON.stringify([jam]),
            },
        });

        await manager.restore();
        expect(setAreaPropertyVariable.mock.calls).toEqual([
            ["lounge", "listening", "jam", JSON.stringify([jam, otherJam])],
        ]);

        vi.advanceTimersByTime(RESTORED_ROOMS_GRACE_MS);
        expect(setAreaPropertyVariable).toHaveBeenLastCalledWith(
            "lounge",
            "listening",
            "jam",
            JSON.stringify([otherJam]),
        );
    });

    it("stops checking once the room is destroyed", () => {
        const { leaveSubject, destroy, setAreaPropertyVariable } = createHarness();

        leaveSubject.next(area);
        destroy.next();
        vi.advanceTimersByTime(HOST_GRACE_MS);

        expect(setAreaPropertyVariable).not.toHaveBeenCalled();
    });
});
