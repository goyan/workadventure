import { cellKey, withHeights } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { BreakingFoam, foamOfCell, FOAM_HALF_LIFE_MS } from "../../../../../src/front/Phaser/Game/Terrain/BreakingFoam";
import type { SettledWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";

/** A state of the water over a grid of `width` by `height` cells from the cell 0, 0. */
function state(
    width: number,
    height: number,
    depthOf: (x: number, y: number) => number,
    beforeOf: (x: number, y: number) => number = depthOf,
): SettledWater {
    const depths = new Float32Array(width * height);
    const before = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            depths[y * width + x] = depthOf(x, y);
            before[y * width + x] = beforeOf(x, y);
        }
    }
    return { x: 0, y: 0, width, height, depths, before, seconds: 1 };
}

describe("foamOfCell", () => {
    it("makes no foam on a swell over deep water, however long, nor on still water", () => {
        // A crest 6 px high over 60 px of water, spread over 40 cells: the long wave of an impact at sea.
        const swell = state(60, 5, (x) => 60 + 6 * Math.exp(-(((x - 30) / 12) ** 2)));
        for (let x = 5; x < 55; x++) expect(foamOfCell(swell, undefined, x, 2)).toBe(0);
        expect(
            foamOfCell(
                state(9, 9, () => 20),
                undefined,
                4,
                4,
            ),
        ).toBe(0);
        expect(
            foamOfCell(
                state(9, 9, () => 0),
                undefined,
                4,
                4,
            ),
        ).toBe(0);
    });

    it("makes foam where the same crest runs in shallow water: the wave breaks", () => {
        // A crest of 12 px (40 cm), steeper as waves get near a shore, over 5 px of water.
        const crest = (high: number): SettledWater => state(60, 5, (x) => 5 + high * Math.exp(-(((x - 30) / 3) ** 2)));
        const most = (water: SettledWater): number => {
            let found = 0;
            for (let x = 20; x < 40; x++) found = Math.max(found, foamOfCell(water, undefined, x, 2));
            return found;
        };
        const breaker = crest(12);
        expect(most(breaker)).toBeGreaterThan(0.6);
        // A lower wave that breaks leaves less foam; a ripple, none.
        expect(most(crest(6))).toBeGreaterThan(0.2);
        expect(most(crest(6))).toBeLessThan(most(breaker));
        expect(most(crest(2))).toBe(0);
        // Away from the crest the shallows are calm.
        expect(foamOfCell(breaker, undefined, 5, 2)).toBe(0);
    });

    it("makes foam where the rim of an impact falls back: a front steep even for deep water", () => {
        const rim = state(40, 5, (x) => (x < 20 ? 90 : 55));
        expect(foamOfCell(rim, undefined, 19, 2)).toBeGreaterThan(0.5);
        expect(foamOfCell(rim, undefined, 5, 2)).toBe(0);
    });

    it("makes foam at the front of a flood that reaches dry ground, not on a pond the rain fills", () => {
        // The water came from the west: the cell 10 was dry, its neighbour already under water.
        const front = state(
            20,
            5,
            (x) => (x <= 10 ? 4 : 0),
            (x) => (x <= 9 ? 4 : 0),
        );
        expect(foamOfCell(front, undefined, 10, 2)).toBeGreaterThanOrEqual(0.6);
        // Rain: every cell was dry and all rise together.
        const rain = state(
            20,
            5,
            () => 2,
            () => 0,
        );
        expect(foamOfCell(rain, undefined, 10, 2)).toBe(0);
    });

    it("makes foam down a waterfall: the surface drops with the ground under running water", () => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 5; y++) for (let x = 0; x < 20; x++) cells.set(cellKey(x, y), x < 10 ? 40 : 0);
        const fall = state(20, 5, () => 3);
        expect(foamOfCell(fall, withHeights(undefined, cells), 9, 2)).toBe(1);
        expect(foamOfCell(fall, withHeights(undefined, cells), 3, 2)).toBe(0);
    });
});

describe("BreakingFoam", () => {
    const breaker = state(40, 5, (x) => (x < 20 ? 90 : 55));
    const calm = state(40, 5, () => 55);

    it("keeps the foam a moment behind the wave, fading by half every so long, then none", () => {
        const foam = new BreakingFoam();
        expect(foam.active(0)).toBe(false);
        foam.absorb(breaker, undefined, 1000);
        const born = foam.foamAt(19, 2, 1000);
        expect(born).toBeGreaterThan(0.5);
        expect(foam.active(1000)).toBe(true);
        // The wave went by: the water is calm again, the foam it left is still there, fainter.
        foam.absorb(calm, undefined, 1000 + FOAM_HALF_LIFE_MS);
        expect(foam.foamAt(19, 2, 1000 + FOAM_HALF_LIFE_MS)).toBeCloseTo(born / 2, 5);
        expect(foam.foamAt(19, 2, 1000 + 2 * FOAM_HALF_LIFE_MS)).toBeCloseTo(born / 4, 5);
        expect(foam.active(1000 + 10 * FOAM_HALF_LIFE_MS)).toBe(false);
        expect(foam.foamAt(19, 2, 1000 + 10 * FOAM_HALF_LIFE_MS)).toBe(0);
    });

    it("has none on dry cells, outside its grid, nor after another grid came", () => {
        const foam = new BreakingFoam();
        foam.absorb(breaker, undefined, 0);
        expect(foam.foamAt(-5, 2, 0)).toBe(0);
        expect(foam.foamAt(19, 99, 0)).toBe(0);
        foam.absorb(
            state(10, 5, () => 0),
            undefined,
            100,
        );
        expect(foam.active(100)).toBe(false);
        foam.absorb(breaker, undefined, 200);
        foam.clear();
        expect(foam.active(200)).toBe(false);
    });
});
