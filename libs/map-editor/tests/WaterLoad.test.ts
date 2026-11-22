import { beforeEach, describe, expect, it } from "vitest";
import { threadWaterLoads, WATER_LOAD_EASE, WaterLoad, WaterLoads } from "../src/Terrain/WaterLoad";

// The waters of a thread add up: each test starts on a thread that has none.
beforeEach(() => threadWaterLoads.clear());

/** Records `count` steps of `ms` each on a map that asks for the fineness `asked`. */
function steps(load: WaterLoad, count: number, ms: number, asked: number): void {
    for (let step = 0; step < count; step++) load.record(ms, asked);
}

/** Records `count` steps that cost `msPerLevel` for each level of the fineness they are computed with. */
function costly(load: WaterLoad, count: number, msPerLevel: number, asked: number): void {
    for (let step = 0; step < count; step++) load.record(msPerLevel * load.precision(asked), asked);
}

describe("WaterLoad", () => {
    it("leaves the fineness of the map alone while the steps are quick", () => {
        const load = new WaterLoad(100);
        steps(load, 500, 20, 8);
        expect(load.precision(8)).toBe(8);
        expect(load.updates(10)).toBe(10);
        expect(load.share()).toBeCloseTo(0.2, 2);
    });

    it("does not react to one slow step alone", () => {
        const load = new WaterLoad(100);
        steps(load, 200, 10, 8);
        load.record(400, 8);
        steps(load, 20, 10, 8);
        expect(load.precision(8)).toBe(8);
    });

    it("lowers the fineness while the steps take over half their time, straight to what should be enough", () => {
        const load = new WaterLoad(100);
        // 69 ms a step at the fineness 8, the cost following the fineness: 5 brings it to 43 ms.
        costly(load, 200, 69 / 8, 8);
        expect(load.precision(8)).toBe(5);
        // The map asking for less than the ceiling gets what it asks.
        expect(load.precision(2)).toBe(2);
        // And it stays there: neither lowered again nor given back, between the two shares.
        costly(load, 3000, 69 / 8, 8);
        expect(load.precision(8)).toBe(5);
    });

    it("goes down to 1 and then tells the players less often, never under", () => {
        const load = new WaterLoad(100);
        steps(load, 1000, 300, 8);
        expect(load.precision(8)).toBe(1);
        expect(load.updates(10)).toBe(1);
        expect(load.updates(1)).toBe(1);
    });

    it("gives the fineness back a level at a time once the steps are quick for a while, up to what the map asks", () => {
        const load = new WaterLoad(100);
        steps(load, 1000, 300, 8);
        // Quick again: first the tellings, then a level every ten seconds.
        steps(load, 170, 1, 8);
        expect(load.updates(10)).toBe(10);
        expect(load.precision(8)).toBe(1);
        steps(load, 110, 1, 8);
        expect(load.precision(8)).toBe(2);
        steps(load, 2000, 1, 8);
        expect(load.precision(8)).toBe(8);
    });

    it("ignores a time that is not one", () => {
        const load = new WaterLoad(100);
        load.record(Number.NaN, 8);
        load.record(-5, 8);
        expect(load.share()).toBe(0);
    });
});

describe("WaterLoad, several waters on one thread", () => {
    /** Steps the waters in turn, each costing `msPerLevel` for each level of the fineness it is computed with. */
    function together(loads: readonly WaterLoad[], count: number, msPerLevel: readonly number[], asked: number): void {
        for (let step = 0; step < count; step++) {
            loads.forEach((load, at) => load.record(msPerLevel[at] * load.precision(asked), asked));
        }
    }
    const total = (loads: readonly WaterLoad[]): number => loads.reduce((sum, load) => sum + load.share(), 0);

    it("eases two waters that each take under half the time but saturate the thread together", () => {
        // 48 ms a step each at the fineness 8: alone, neither is over half the 100 ms between two steps.
        const alone = new WaterLoad(100, new WaterLoads());
        together([alone], 500, [6], 8);
        expect(alone.precision(8)).toBe(8);
        // On the same thread they take 96 % of it: both ease, to the same fineness.
        const thread = new WaterLoads();
        const rooms = [new WaterLoad(100, thread), new WaterLoad(100, thread)];
        together(rooms, 500, [6, 6], 8);
        expect(rooms[0].threadShare()).toBeCloseTo(total(rooms), 5);
        expect(rooms[0].precision(8)).toBe(rooms[1].precision(8));
        expect(rooms[0].precision(8)).toBeLessThan(8);
        expect(total(rooms)).toBeLessThanOrEqual(WATER_LOAD_EASE);
    });

    it("eases a large water and a small one by the same ratio: the large one gives up the most time", () => {
        const thread = new WaterLoads();
        // 64 ms and 16 ms a step at the fineness 8: 80 % of the thread together.
        const large = new WaterLoad(100, thread);
        const small = new WaterLoad(100, thread);
        together([large, small], 500, [8, 2], 8);
        expect(large.precision(8)).toBe(small.precision(8));
        expect(large.precision(8)).toBeLessThan(8);
        expect(total([large, small])).toBeLessThanOrEqual(WATER_LOAD_EASE);
        expect(0.64 - large.share()).toBeGreaterThan(0.16 - small.share());
    });

    it("gives the fineness back to a water once the other one of its thread stops", () => {
        const thread = new WaterLoads();
        const rooms = [new WaterLoad(100, thread), new WaterLoad(100, thread)];
        together(rooms, 500, [6, 6], 8);
        const eased = rooms[0].precision(8);
        expect(eased).toBeLessThan(8);
        // While both run, it stays there.
        together(rooms, 2000, [6, 6], 8);
        expect(rooms[0].precision(8)).toBe(eased);
        // The other room closes: alone at under a quarter of the thread for a while, it gets a level back, and
        // stops where it takes its share again.
        rooms[1].release();
        expect(rooms[1].share()).toBe(0);
        together([rooms[0]], 3000, [3], 8);
        expect(rooms[0].precision(8)).toBeGreaterThan(eased);
        expect(rooms[0].threadShare()).toBeCloseTo(rooms[0].share(), 5);
    });

    it("settles: waters eased together neither chase each other nor flap", () => {
        const thread = new WaterLoads();
        const rooms = [new WaterLoad(100, thread), new WaterLoad(100, thread), new WaterLoad(100, thread)];
        together(rooms, 1000, [4, 4, 4], 8);
        const settled = rooms.map((load) => load.precision(8));
        // Five more minutes of the same steps: the same fineness, for all of them.
        for (let minute = 0; minute < 5; minute++) {
            together(rooms, 600, [4, 4, 4], 8);
            expect(rooms.map((load) => load.precision(8))).toEqual(settled);
        }
        expect(new Set(settled).size).toBe(1);
        expect(total(rooms)).toBeLessThanOrEqual(WATER_LOAD_EASE);
    });

    it("shares the thread of its module by default, and leaves it when it is released", () => {
        const rooms = [new WaterLoad(100), new WaterLoad(100)];
        together(rooms, 100, [3, 3], 8);
        expect(threadWaterLoads.totalMs()).toBeCloseTo(rooms[0].meanMs() + rooms[1].meanMs(), 5);
        rooms[0].release();
        expect(threadWaterLoads.totalMs()).toBeCloseTo(rooms[1].meanMs(), 5);
        rooms[1].release();
        expect(threadWaterLoads.totalMs()).toBe(0);
    });
});
