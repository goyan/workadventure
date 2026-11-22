import { describe, expect, it } from "vitest";
import { WaterLoad } from "../src/Terrain/WaterLoad";

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
