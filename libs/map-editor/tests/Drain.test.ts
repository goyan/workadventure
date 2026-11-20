import { describe, expect, it } from "vitest";
import {
    DRAIN_CALM_REACH,
    DRAIN_DEFAULT_TILES,
    DRAIN_MAX_TILES,
    DRAIN_MIN_TILES,
    DRAIN_PX_PER_SECOND,
    DRAIN_RIM_PX_PER_SECOND,
    drainCalms,
    drainTiles,
} from "../src/Catastrophe/Drain";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";

describe("the size of a drain", () => {
    it("is kept from 1 to 16 tiles, 3 for a size that is none", () => {
        expect([DRAIN_MIN_TILES, DRAIN_MAX_TILES, DRAIN_DEFAULT_TILES]).toEqual([1, 16, 3]);
        expect(drainTiles(0)).toBe(3);
        expect(drainTiles(-4)).toBe(1);
        expect(drainTiles(Number.NaN)).toBe(3);
        expect(drainTiles(99)).toBe(16);
        expect(drainTiles(7.4)).toBe(7);
    });

    it("takes 256 px a second in its middle and 128 at its rim", () => {
        expect(DRAIN_PX_PER_SECOND).toBe(256);
        expect(DRAIN_RIM_PX_PER_SECOND).toBe(128);
    });
});

describe("drainCalms", () => {
    const drains = [{ x: 320, y: 320, radiusTiles: 2 }];

    it("is true inside the disc of an open drain and up to one and a half times its radius", () => {
        expect(DRAIN_CALM_REACH).toBe(1.5);
        expect(drainCalms(drains, 320, 320)).toBe(true);
        expect(drainCalms(drains, 320 + 64, 320)).toBe(true);
        expect(drainCalms(drains, 320, 320 - 96)).toBe(true);
    });

    it("is false further away, and without any drain", () => {
        expect(drainCalms(drains, 320 + 97, 320)).toBe(false);
        expect(drainCalms([], 320, 320)).toBe(false);
    });
});

describe("WaterGrid.drainDisc", () => {
    const cells: [string, number][] = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) cells.push([cellKey(x, y), -32]);
    const hollow = withHeights(undefined, new Map(cells));
    const full = (blocked?: (x: number, y: number) => boolean): WaterGrid => {
        const grid = new WaterGrid(hollow, { x: 0, y: 0, width: 20, height: 20 }, blocked);
        grid.rainOn(0, 0, undefined, 10);
        return grid;
    };

    it("takes the most in its middle, half of it at its rim, nothing outside its disc", () => {
        const water = full();
        expect(water.drainDisc(10, 10, 4, 4, 2)).toBeGreaterThan(0);
        expect(water.depthAt(10, 10)).toBeCloseTo(6);
        expect(water.depthAt(14, 10)).toBeCloseTo(8);
        expect(water.depthAt(12, 10)).toBeCloseTo(7);
        expect(water.depthAt(15, 10)).toBeCloseTo(10);
        // A disc, not a square: its corner keeps its water.
        expect(water.depthAt(13, 13)).toBeCloseTo(10);
    });

    it("tells how much it took, and never takes more than a cell holds", () => {
        const water = full();
        const first = water.drainDisc(10, 10, 2, 100, 100);
        expect(first).toBeCloseTo(130);
        expect(water.depthAt(10, 10)).toBe(0);
        expect(water.drainDisc(10, 10, 2, 100, 100)).toBe(0);
    });

    it("takes only what is in the grid when the disc goes past its edge or lies outside it", () => {
        const water = full();
        expect(water.drainDisc(0, 0, 2, 1, 1)).toBeCloseTo(6);
        expect(water.drainDisc(500, 500, 3, 1, 1)).toBe(0);
        expect(water.drainDisc(-2, 10, 3, 1, 1)).toBeGreaterThan(0);
    });

    it("takes nothing for amounts that are not numbers or not positive, nor from a blocked cell", () => {
        const water = full();
        expect(water.drainDisc(10, 10, 3, Number.NaN, 1)).toBe(0);
        expect(water.drainDisc(10, 10, 3, 0, 0)).toBe(0);
        expect(water.drainDisc(10, 10, Number.NaN, 4, 2)).toBe(0);
        const walled = full((x, y) => x === 10 && y === 10);
        // A blocked cell holds no water: the twelve others of the disc give theirs.
        expect(walled.drainDisc(10, 10, 2, 4, 4)).toBeCloseTo(48);
        expect(walled.depthAt(11, 10)).toBeCloseTo(6);
    });
});
