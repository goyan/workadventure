import { describe, expect, it } from "vitest";
import {
    emberPoint,
    TREE_MAX_FLAMES,
    TREE_MIN_FLAMES,
    treeFlameIntensity,
    treeFlames,
} from "../../../../../src/front/Phaser/Game/Fire/TreeFlames";

const oak = { x: 1000, y: 500, width: 70, height: 109 };

describe("treeFlames", () => {
    it("carries 3 to 7 flames by the width of the crown, bigger than the flames of the grass", () => {
        expect(TREE_MIN_FLAMES).toBe(3);
        expect(TREE_MAX_FLAMES).toBe(7);
        expect(treeFlames({ ...oak, width: 20 }, 0.3)).toHaveLength(3);
        expect(treeFlames(oak, 0.3)).toHaveLength(5);
        expect(treeFlames({ ...oak, width: 200 }, 0.3)).toHaveLength(7);
        for (const flame of treeFlames(oak, 0.3)) {
            expect(flame.scale).toBeGreaterThanOrEqual(1.5);
            expect(flame.scale).toBeLessThanOrEqual(2.5);
        }
    });

    it("keeps its flames in the crown, the top two thirds of the image, never on the trunk", () => {
        for (const seed of [0.1, 0.5, 0.9]) {
            for (const flame of treeFlames(oak, seed)) {
                expect(flame.x).toBeGreaterThanOrEqual(oak.x);
                expect(flame.x).toBeLessThanOrEqual(oak.x + oak.width);
                expect(flame.y).toBeGreaterThanOrEqual(oak.y);
                expect(flame.y).toBeLessThanOrEqual(oak.y + oak.height * 0.65 + 1e-6);
            }
        }
    });

    it("is always the same for a tree, and not the same for two trees", () => {
        expect(treeFlames(oak, 0.3)).toEqual(treeFlames(oak, 0.3));
        expect(treeFlames(oak, 0.3)).not.toEqual(treeFlames(oak, 0.7));
    });

    it("lights the bottom of the crown first: the fire climbs the tree", () => {
        const flames = treeFlames(oak, 0.3);
        const lowest = flames.reduce((a, b) => (a.y > b.y ? a : b));
        const highest = flames.reduce((a, b) => (a.y < b.y ? a : b));
        expect(lowest.catchesAt).toBe(0);
        expect(highest.catchesAt).toBeCloseTo(0.8, 5);
        // A tree just lit: only its lowest flame burns, and low.
        expect(treeFlameIntensity(lowest, 0.1)).toBeGreaterThan(0);
        expect(treeFlameIntensity(lowest, 0.1)).toBeLessThan(1);
        expect(treeFlameIntensity(highest, 0.1)).toBe(0);
        // At its height every flame burns in full.
        for (const flame of flames) expect(treeFlameIntensity(flame, 1)).toBe(1);
    });

    it("puts some of its flames behind the tree, the others in front", () => {
        const behind = treeFlames(oak, 0.3).filter((flame) => flame.behind).length;
        expect(behind).toBeGreaterThanOrEqual(1);
        expect(behind).toBeLessThanOrEqual(2);
    });

    it("is one flame as wide as the crown when the tree is seen from far", () => {
        const [flame, ...others] = treeFlames(oak, 0.3, true);
        expect(others).toEqual([]);
        expect(flame.x).toBe(oak.x + oak.width / 2);
        expect(flame.catchesAt).toBe(0);
        expect(flame.scale).toBeGreaterThanOrEqual(1.5);
    });
});

describe("emberPoint", () => {
    const ember = { fromX: 0, fromY: 1000, toX: 400, toY: 1000, leftAt: 5000, flightMs: 2000 };

    it("flies an arc from its tree to where it falls", () => {
        expect(emberPoint(ember, 5000)).toEqual({ x: 0, y: 1000, along: 0 });
        const middle = emberPoint(ember, 6000);
        expect(middle?.x).toBeCloseTo(200, 5);
        // 30 % of its flight over the line at its highest.
        expect(middle?.y).toBeCloseTo(1000 - 120, 5);
        const late = emberPoint(ember, 6900);
        expect(late?.x).toBeCloseTo(380, 5);
        expect(late?.y).toBeGreaterThan(middle?.y ?? 0);
        expect(late?.y).toBeLessThan(1000);
    });

    it("is nowhere before it leaves and once it has landed", () => {
        expect(emberPoint(ember, 4999)).toBeUndefined();
        expect(emberPoint(ember, 7000)).toBeUndefined();
    });

    it("never rises more than 160 pixels, however far it flies", () => {
        const long = { ...ember, toX: 1280 };
        expect(emberPoint(long, 6000)?.y).toBeCloseTo(1000 - 160, 5);
    });
});
