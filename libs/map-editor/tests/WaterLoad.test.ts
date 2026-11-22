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

describe("WaterLoad, on a thread that computes nothing else", () => {
    /** The waters of a thread of its own: they may take nine tenths of it. */
    function ownThread(): WaterLoads {
        const loads = new WaterLoads();
        loads.mayTake(0.9);
        return loads;
    }
    /** Steps of several waters, one after the other at each step, each costing its `msPerLevel` for each level. */
    function together(waters: [WaterLoad, number][], count: number, asked: number): void {
        for (let step = 0; step < count; step++) {
            for (const [load, msPerLevel] of waters) load.record(msPerLevel * load.precision(asked), asked);
        }
    }

    it("lets the waters take most of the thread: eight rooms at a tenth each keep their fineness", () => {
        const loads = ownThread();
        const waters = Array.from({ length: 8 }, (): [WaterLoad, number] => [new WaterLoad(100, loads), 10.5 / 3]);
        together(waters, 400, 3);
        // 84 % of the thread together: over the half of the thread of the rooms, under the nine tenths of this one.
        for (const [load] of waters) expect(load.precision(3)).toBe(3);
        // The same eight on the thread of the rooms ease.
        const rooms = new WaterLoads();
        const shared = Array.from({ length: 8 }, (): [WaterLoad, number] => [new WaterLoad(100, rooms), 10.5 / 3]);
        together(shared, 400, 3);
        for (const [load] of shared) expect(load.precision(3)).toBeLessThan(3);
    });

    it("eases them all once they take more than the thread may give", () => {
        const loads = ownThread();
        const waters = Array.from({ length: 12 }, (): [WaterLoad, number] => [new WaterLoad(100, loads), 10.5 / 3]);
        together(waters, 400, 3);
        // 126 % at the fineness 3: 2 brings them to 84 %.
        for (const [load] of waters) expect(load.precision(3)).toBe(2);
        expect(loads.totalMs()).toBeLessThan(90);
    });

    it("gives a level back as soon as the thread could bear it, not under half of what it may take", () => {
        const loads = ownThread();
        const waters = Array.from({ length: 8 }, (): [WaterLoad, number] => [new WaterLoad(100, loads), 10 / 3]);
        together(waters, 200, 3);
        // A peak (a room that starts): four heavy steps for each, and they all give a level up.
        for (let step = 0; step < 30; step++) for (const [load] of waters) load.record(40, 3);
        for (const [load] of waters) expect(load.precision(3)).toBeLessThan(3);
        // Quiet again: 53 % at the fineness 2, and the fineness 3 would take 80 %, under what the thread may give.
        // It comes back, where half of nine tenths would have kept it away for good.
        together(waters, 600, 3);
        for (const [load] of waters) expect(load.precision(3)).toBe(3);
    });

    it("keeps a level given up while giving it back would overload the thread", () => {
        const loads = ownThread();
        const waters = Array.from({ length: 10 }, (): [WaterLoad, number] => [new WaterLoad(100, loads), 10.5 / 3]);
        // 105 % at the fineness 3, 70 % at 2: giving it back would bring them over again.
        together(waters, 2000, 3);
        for (const [load] of waters) expect(load.precision(3)).toBe(2);
    });

    it("leaves the thread of the rooms as it was: a level comes back under half the share only", () => {
        const loads = new WaterLoads();
        expect(loads.easeAt()).toBe(WATER_LOAD_EASE);
        const load = new WaterLoad(100, loads);
        costly(load, 200, 20, 3);
        expect(load.precision(3)).toBe(2);
        // 40 % at the fineness 2: over the quarter, it stays there, though 60 % at 3 would be over the half anyway.
        costly(load, 600, 20, 3);
        expect(load.precision(3)).toBe(2);
        loads.mayTake(0);
        loads.mayTake(Number.NaN);
        expect(loads.easeAt()).toBe(WATER_LOAD_EASE);
    });
});
