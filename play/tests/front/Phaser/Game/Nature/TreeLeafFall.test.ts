import { describe, expect, it } from "vitest";
import { leafActivity, LEAVES_PER_TREE, treeLeaves } from "../../../../../src/front/Phaser/Game/Nature/TreeLeafFall";

const box = { x: 100, y: 200, width: 64, height: 96 };

/** Leaves of the tree over two minutes, four times a second. */
function overTime(wind: number, windFrom?: number, seed = 0.3) {
    const frames = [];
    for (let quarter = 0; quarter < 480; quarter++) {
        frames.push(treeLeaves(1_000_000 + quarter / 4, wind, windFrom, seed, box));
    }
    return frames;
}

describe("treeLeaves", () => {
    it("drops more leaves as the wind blows harder, six at once at most", () => {
        expect(leafActivity(0)).toBeGreaterThan(0);
        expect(leafActivity(10)).toBeLessThan(leafActivity(50));
        expect(leafActivity(200)).toBe(1);
        const count = (wind: number) => overTime(wind).reduce((sum, leaves) => sum + leaves.length, 0);
        expect(count(5)).toBeGreaterThan(0);
        expect(count(5)).toBeLessThan(count(40));
        expect(count(40)).toBeLessThan(count(80));
        for (const leaves of overTime(80)) expect(leaves.length).toBeLessThanOrEqual(LEAVES_PER_TREE);
        expect(Math.max(...overTime(80).map((leaves) => leaves.length))).toBe(LEAVES_PER_TREE);
    });

    it("lets the leaves go from the foliage and land under it, at the foot of the tree", () => {
        let lowest = -Infinity;
        for (const leaves of overTime(0)) {
            for (const leaf of leaves) {
                expect(leaf.y).toBeGreaterThanOrEqual(box.y + box.height * 0.25);
                expect(leaf.y).toBeLessThanOrEqual(box.y + box.height);
                // Without wind a leaf stays under the foliage.
                expect(leaf.x).toBeGreaterThanOrEqual(box.x);
                expect(leaf.x).toBeLessThanOrEqual(box.x + box.width);
                expect(leaf.alpha).toBeGreaterThanOrEqual(0);
                expect(leaf.alpha).toBeLessThanOrEqual(1);
                lowest = Math.max(lowest, leaf.y);
            }
        }
        expect(lowest).toBeGreaterThan(box.y + box.height - 10);
    });

    it("pushes the leaves where the wind goes", () => {
        const meanX = (windFrom: number) => {
            const xs = overTime(80, windFrom).flatMap((leaves) => leaves.map((leaf) => leaf.x));
            return xs.reduce((sum, x) => sum + x, 0) / xs.length;
        };
        // A west wind (from 270°) blows to the east: to the right.
        expect(meanX(270)).toBeGreaterThan(meanX(90) + 5);
    });

    it("is the same for everyone, and each tree has its own leaves", () => {
        expect(treeLeaves(1_000_123.4, 30, 200, 0.3, box)).toEqual(treeLeaves(1_000_123.4, 30, 200, 0.3, box));
        const one = overTime(80, 200, 0.3).map((leaves) => leaves.map((leaf) => leaf.y));
        const other = overTime(80, 200, 0.7).map((leaves) => leaves.map((leaf) => leaf.y));
        expect(one).not.toEqual(other);
    });

    it("does not make a falling leaf jump when the wind changes", () => {
        const calm = treeLeaves(1_000_050, 10, 200, 0.3, box).map((leaf) => leaf.y);
        const storm = treeLeaves(1_000_050, 80, 200, 0.3, box).map((leaf) => leaf.y);
        for (const y of calm) expect(storm).toContain(y);
    });

    it("gives no leaf for a time that is not one", () => {
        expect(treeLeaves(Number.NaN, 30, 200, 0.3, box)).toEqual([]);
    });
});
