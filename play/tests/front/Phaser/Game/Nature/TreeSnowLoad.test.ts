import { describe, expect, it } from "vitest";
import {
    SNOW_DUMP_SECONDS,
    SNOW_MIN_LOAD,
    snowClumps,
    snowCyclePeriod,
    treeSnowCycle,
    treeSnowLoad,
} from "../../../../../src/front/Phaser/Game/Nature/TreeSnowLoad";

const box = { x: 100, y: 200, width: 64, height: 96 };

describe("treeSnowCycle", () => {
    it("loads the tree up to the threshold, then drops back and starts again", () => {
        const period = snowCyclePeriod(0.4);
        expect(period).toBeGreaterThanOrEqual(150);
        expect(period).toBeLessThanOrEqual(270);
        let previous = treeSnowCycle(5_000_000, 0.4);
        let drops = 0;
        let highest = 0;
        for (let second = 1; second <= 2 * period; second++) {
            const now = treeSnowCycle(5_000_000 + second, 0.4);
            expect(now.load).toBeGreaterThanOrEqual(SNOW_MIN_LOAD);
            expect(now.load).toBeLessThanOrEqual(1);
            if (now.load < previous.load) {
                drops++;
                // The threshold was reached right before, and the tree is nearly bare right after.
                expect(previous.load).toBeGreaterThan(0.98);
                expect(now.load).toBeLessThan(SNOW_MIN_LOAD + 0.02);
                expect(now.sinceDump).toBeLessThan(1.01);
            }
            highest = Math.max(highest, now.load);
            previous = now;
        }
        expect(drops).toBe(2);
        expect(highest).toBeGreaterThan(0.98);
    });

    it("sets each tree in its own time", () => {
        expect(treeSnowCycle(5_000_000, 0.1).load).not.toBe(treeSnowCycle(5_000_000, 0.6).load);
        expect(snowCyclePeriod(0.1)).not.toBe(snowCyclePeriod(0.6));
        expect(treeSnowCycle(5_000_000, 0.1)).toEqual(treeSnowCycle(5_000_000, 0.1));
    });

    it("carries no more snow than the map has", () => {
        expect(treeSnowLoad(0, 1)).toBe(0);
        expect(treeSnowLoad(0.5, 1)).toBe(0.5);
        expect(treeSnowLoad(1, 0.4)).toBe(0.4);
        expect(treeSnowLoad(3, 1)).toBe(1);
        expect(treeSnowLoad(Number.NaN, 1)).toBe(0);
    });
});

describe("snowClumps", () => {
    it("drops snow on each side of the tree, down to the ground", () => {
        const middle = box.x + box.width / 2;
        const start = snowClumps(0, box);
        expect(start.some((clump) => clump.x + clump.width / 2 < middle)).toBe(true);
        expect(start.some((clump) => clump.x + clump.width / 2 > middle)).toBe(true);
        const bottom = (clumps: { y: number; height: number }[]) =>
            Math.max(...clumps.map((clump) => clump.y + clump.height));
        // It falls: lower and lower, never under the foot of the tree.
        expect(bottom(snowClumps(SNOW_DUMP_SECONDS / 2, box))).toBeGreaterThan(bottom(start));
        const landing = snowClumps(SNOW_DUMP_SECONDS, box);
        expect(bottom(landing)).toBeGreaterThan(box.y + box.height - 8);
        expect(bottom(landing)).toBeLessThanOrEqual(box.y + box.height);
        for (const clump of landing) {
            expect(clump.alpha).toBeGreaterThan(0);
            expect(clump.alpha).toBeLessThanOrEqual(1);
        }
    });

    it("is over shortly after the snow landed", () => {
        expect(snowClumps(SNOW_DUMP_SECONDS + 0.2, box).length).toBeGreaterThan(0);
        expect(snowClumps(SNOW_DUMP_SECONDS + 1, box)).toEqual([]);
        expect(snowClumps(-1, box)).toEqual([]);
    });
});
