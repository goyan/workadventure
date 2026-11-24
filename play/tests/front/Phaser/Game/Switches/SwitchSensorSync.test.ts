import type { SwitchPropertyData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    SENSOR_SYNC_RETRY_MS,
    SensorSyncGate,
    syncedSensorProperty,
} from "../../../../../src/front/Phaser/Game/Switches/SwitchSensorSync";

const inRoom = { type: "presence" as const, scope: "room" as const, tiles: 3, offDelay: 30, direction: 90, angle: 90 };
const property = (overrides: Partial<SwitchPropertyData> = {}): SwitchPropertyData => ({
    id: "p",
    type: "switchPropertyData",
    key: "on",
    targets: { mode: "zone" },
    ...overrides,
});

describe("syncedSensorProperty", () => {
    it("has nothing to store for a switch used by hand", () => {
        expect(syncedSensorProperty(property(), "room", ["l1"])).toBeUndefined();
    });

    it("stores the room found for a sensor of its room, and the lamps of that room", () => {
        expect(syncedSensorProperty(property({ trigger: inRoom }), "room", ["l1", "l2"])).toEqual(
            property({ trigger: { ...inRoom, areaId: "room" }, resolvedTargets: ["l1", "l2"] }),
        );
    });

    it("has nothing to store when what is stored is right, whatever the order of the lamps", () => {
        const stored = property({ trigger: { ...inRoom, areaId: "room" }, resolvedTargets: ["l2", "l1"] });
        expect(syncedSensorProperty(stored, "room", ["l1", "l2"])).toBeUndefined();
    });

    it("stores the lamps again when one was added to the room or left it", () => {
        const stored = property({ trigger: { ...inRoom, areaId: "room" }, resolvedTargets: ["l1"] });
        expect(syncedSensorProperty(stored, "room", ["l1", "l2"])?.resolvedTargets).toEqual(["l1", "l2"]);
        expect(syncedSensorProperty(stored, "room", [])?.resolvedTargets).toEqual([]);
    });

    it("forgets the room of a sensor moved out of any room", () => {
        const stored = property({ trigger: { ...inRoom, areaId: "room" }, resolvedTargets: [] });
        const synced = syncedSensorProperty(stored, undefined, []);
        expect(synced?.trigger).toEqual(inRoom);
    });

    it("leaves the chosen area of a sensor of an area alone", () => {
        const stored = property({
            trigger: { ...inRoom, scope: "area", areaId: "lobby" },
            resolvedTargets: ["l1"],
        });
        expect(syncedSensorProperty(stored, "room", ["l1"])).toBeUndefined();
    });

    it("drops the resolved lamps of a switch that lists its lamps: the list is what the server reads", () => {
        const stored = property({
            trigger: { type: "hours", from: "18:00", to: "08:00" },
            targets: { mode: "ids", ids: ["l1"] },
            resolvedTargets: ["old"],
        });
        const synced = syncedSensorProperty(stored, "room", ["l1"]);
        expect(synced).toBeDefined();
        expect(synced?.resolvedTargets).toBeUndefined();
        expect(syncedSensorProperty({ ...stored, resolvedTargets: undefined }, "room", ["l1"])).toBeUndefined();
    });
});

describe("SensorSyncGate", () => {
    const synced = property({ trigger: { ...inRoom, areaId: "room" }, resolvedTargets: ["l1"] });

    it("lets a sensor be stored, then not the same thing again at once: the server may have refused it", () => {
        const gate = new SensorSyncGate();

        expect(gate.mayStore("s", synced, 1000)).toBe(true);
        expect(gate.mayStore("s", synced, 1250)).toBe(false);
        expect(gate.mayStore("s", synced, 1000 + SENSOR_SYNC_RETRY_MS - 1)).toBe(false);
    });

    it("tries the same thing again after a while", () => {
        const gate = new SensorSyncGate();
        gate.mayStore("s", synced, 1000);

        expect(gate.mayStore("s", synced, 1000 + SENSOR_SYNC_RETRY_MS)).toBe(true);
    });

    it("stores at once something else for the same sensor, and the same thing for another sensor", () => {
        const gate = new SensorSyncGate();
        gate.mayStore("s", synced, 1000);

        expect(gate.mayStore("s", { ...synced, resolvedTargets: ["l1", "l2"] }, 1250)).toBe(true);
        expect(gate.mayStore("other", synced, 1250)).toBe(true);
    });
});
