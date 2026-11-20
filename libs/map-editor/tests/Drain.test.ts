import { describe, expect, it } from "vitest";
import { DRAIN_SIDE_TILES, drainSquare } from "../src/Catastrophe/Drain";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";

describe("drainSquare", () => {
    it("is five tiles wide, around the tile of the point", () => {
        expect(DRAIN_SIDE_TILES).toBe(5);
        expect(drainSquare(100, 70)).toEqual({ left: 32, top: 0, side: 160 });
        expect(drainSquare(0, 0)).toEqual({ left: -64, top: -64, side: 160 });
    });
});

describe("WaterGrid.drainOn", () => {
    const cells: [string, number][] = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) cells.push([cellKey(x, y), -32]);
    const hollow = withHeights(undefined, new Map(cells));
    const full = (blocked?: (x: number, y: number) => boolean): WaterGrid => {
        const grid = new WaterGrid(hollow, { x: 0, y: 0, width: 20, height: 20 }, blocked);
        grid.rainOn(0, 0, undefined, 10);
        return grid;
    };

    it("takes the water of the cells of the rectangle only, and tells how much", () => {
        const water = full();
        expect(water.drainOn(5, 5, 10, 10, 4)).toBeCloseTo(400);
        expect(water.depthAt(5, 5)).toBeCloseTo(6);
        expect(water.depthAt(14, 14)).toBeCloseTo(6);
        expect(water.depthAt(15, 5)).toBeCloseTo(10);
        expect(water.depthAt(4, 5)).toBeCloseTo(10);
    });

    it("never takes more than a cell holds", () => {
        const water = full();
        water.drainOn(5, 5, 10, 10, 4);
        expect(water.drainOn(5, 5, 10, 10, 100)).toBeCloseTo(600);
        expect(water.depthAt(9, 9)).toBe(0);
        expect(water.drainOn(5, 5, 10, 10, 100)).toBe(0);
    });

    it("takes only what is in the grid when the rectangle goes past its edge", () => {
        const water = full();
        expect(water.drainOn(-5, -5, 10, 10, 1)).toBeCloseTo(25);
        expect(water.drainOn(500, 500, 10, 10, 1)).toBe(0);
    });

    it("takes nothing for an amount that is not a number or not positive, nor from a blocked cell", () => {
        const water = full();
        expect(water.drainOn(5, 5, 10, 10, Number.NaN)).toBe(0);
        expect(water.drainOn(5, 5, 10, 10, 0)).toBe(0);
        expect(water.drainOn(5, 5, 10, 10, -3)).toBe(0);
        const walled = full((x, y) => x === 6 && y === 6);
        expect(walled.drainOn(5, 5, 10, 10, 4)).toBeCloseTo(396);
    });
});
