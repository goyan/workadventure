import { describe, expect, it } from "vitest";
import { WATER_SEND_BUDGET_BYTES_PER_SECOND, WaterSendLoad } from "../src/Terrain/WaterSendLoad";

/** Messages of `bytes` told at the cadence the load allows, for `seconds`: the cadence after them. */
function tell(load: WaterSendLoad, bytes: number, seconds: number, asked = 5, from = { step: 0 }): number {
    for (let second = 0; second < seconds; second++) {
        const cadence = load.updates(asked);
        for (let message = 0; message < cadence; message++) {
            from.step += 10 / cadence;
            load.record(bytes, asked, from.step);
        }
    }
    return load.updates(asked);
}

describe("the network a room's water takes, a player at a time", () => {
    it("is about 100 kB a second at most", () => {
        expect(WATER_SEND_BUDGET_BYTES_PER_SECOND).toBe(100_000);
    });

    it("keeps five states a second while they are small", () => {
        const load = new WaterSendLoad();
        // 15 kB a state, as on the map of the entry under a calm lake: 75 kB a second.
        expect(tell(load, 15_000, 30)).toBe(5);
    });

    it("tells fewer states a second when they are big, down to one, never under", () => {
        const load = new WaterSendLoad();
        // 40 kB a state (a sea of 600 by 600 cells that runs): two a second keep under 100 kB.
        expect(tell(load, 40_000, 10)).toBe(2);
        // 130 kB a state (a whole map flooded and running): one a second, the least.
        expect(tell(new WaterSendLoad(), 130_000, 10)).toBe(1);
    });

    it("says when it holds the room at its floor: one state a second where the map asks more", () => {
        const load = new WaterSendLoad();
        expect(load.atFloor(5)).toBe(false);
        tell(load, 130_000, 10);
        expect(load.atFloor(5)).toBe(true);
        // A map that asks one a second by itself is not held there by the network.
        expect(load.atFloor(1)).toBe(false);
    });

    it("gives the cadence back once the states are small again for a while, not at once", () => {
        const load = new WaterSendLoad();
        const clock = { step: 0 };
        expect(tell(load, 130_000, 10, 5, clock)).toBe(1);
        // Small again: still one a second for a few seconds, then back up a level at a time.
        expect(tell(load, 5_000, 3, 5, clock)).toBe(1);
        expect(tell(load, 5_000, 60, 5, clock)).toBe(5);
    });

    it("never tells more than the map asks", () => {
        const load = new WaterSendLoad();
        expect(tell(load, 1_000, 30, 2)).toBe(2);
        expect(load.updates(1)).toBe(1);
    });

    it("reduces nothing where nothing travels: the water a browser simulates for itself", () => {
        expect(tell(new WaterSendLoad(Number.POSITIVE_INFINITY), 500_000, 10)).toBe(5);
    });
});
