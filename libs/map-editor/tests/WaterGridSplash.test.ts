import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { MAX_WATER_SURFACE_PX, WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import type { TerrainData } from "../src/types";

const terrainOf = (cells: [number, number, number][]): TerrainData =>
    withHeights(undefined, new Map(cells.map(([x, y, height]) => [cellKey(x, y), height])));
const nothing: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
const run = (grid: WaterGrid, steps: number, input = nothing): void => {
    for (let step = 0; step < steps; step++) grid.step(input);
};
const SIZE = 40;
const bounds = { x: 0, y: 0, width: SIZE, height: SIZE };
const bowl = (): TerrainData => {
    const cells: [number, number, number][] = [];
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) cells.push([x, y, -32]);
    return terrainOf(cells);
};
const filledBowl = (walls?: { east: Set<string>; south: Set<string> }): WaterGrid => {
    const grid = new WaterGrid(bowl(), bounds, undefined, walls);
    run(grid, 3, { ...nothing, rainPx: 4 });
    return grid;
};
const discSize = (cx: number, cy: number, radius: number): number => {
    let count = 0;
    for (let x = 0; x < SIZE; x++)
        for (let y = 0; y < SIZE; y++) if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) count++;
    return count;
};
const CX = 20;
const CY = 20;

describe("WaterGrid.splash", () => {
    it("moves the water of the disc to the ring and keeps its volume", () => {
        const grid = filledBowl();
        const before = grid.totalPx();
        const ringBefore = grid.depthAt(CX + 9, CY);
        expect(grid.depthAt(CX, CY)).toBeGreaterThan(0);
        const result = grid.splash(CX, CY, 6, 12, 0);
        expect(grid.depthAt(CX, CY)).toBe(0);
        expect(result.takenPx).toBeGreaterThan(0);
        expect(result.lostPx).toBeCloseTo(0, 3);
        expect(grid.totalPx()).toBeCloseTo(before - result.lostPx, 3);
        expect(grid.depthAt(CX + 9, CY)).toBeGreaterThan(ringBefore);
    });

    it("adds the water the meteor brings", () => {
        const grid = filledBowl();
        const before = grid.totalPx();
        const result = grid.splash(CX, CY, 6, 12, 8);
        expect(result.addedPx).toBe(8 * discSize(CX, CY, 6));
        expect(grid.totalPx()).toBeCloseTo(before + result.addedPx - result.lostPx, 3);
    });

    it("on dry ground only the brought water lands", () => {
        const grid = new WaterGrid(undefined, bounds);
        const result = grid.splash(CX, CY, 6, 12, 8);
        expect(result.takenPx).toBe(0);
        expect(grid.totalPx()).toBeCloseTo(result.addedPx - result.lostPx, 3);
        expect(result.moved).toBe(true);
    });

    it("loses what goes over the highest water", () => {
        // Rain fills the bowl until every cell is at its highest level (the step itself drops the excess).
        const grid = new WaterGrid(bowl(), bounds);
        run(grid, 6, { ...nothing, rainPx: 30 });
        const top = grid.depthAt(CX + 9, CY);
        expect(top).toBeGreaterThan(MAX_WATER_SURFACE_PX);
        const result = grid.splash(CX, CY, 6, 12, 8);
        expect(result.takenPx).toBeGreaterThan(0);
        expect(result.lostPx).toBeCloseTo(result.takenPx + result.addedPx, 3);
        for (let x = 0; x < SIZE; x++)
            for (let y = 0; y < SIZE; y++) expect(grid.depthAt(x, y)).toBeLessThanOrEqual(top + 1e-3);
    });

    it("does not cross a wall", () => {
        const east = new Set<string>();
        for (let y = 0; y < SIZE; y++) east.add(cellKey(CX + 2, y));
        const grid = filledBowl({ east, south: new Set<string>() });
        const before: number[] = [];
        for (let x = CX + 3; x < SIZE; x++) for (let y = 0; y < SIZE; y++) before.push(grid.depthAt(x, y));
        grid.splash(CX, CY, 6, 12, 8);
        const after: number[] = [];
        for (let x = CX + 3; x < SIZE; x++) for (let y = 0; y < SIZE; y++) after.push(grid.depthAt(x, y));
        expect(after).toEqual(before);
    });

    it("does nothing outside the grid or in a wall", () => {
        const none = { takenPx: 0, addedPx: 0, lostPx: 0, moved: false };
        const grid = new WaterGrid(bowl(), bounds, (x, y) => x === CX && y === CY);
        run(grid, 3, { ...nothing, rainPx: 4 });
        const before = grid.totalPx();
        expect(grid.splash(500, 500, 6, 12, 8)).toEqual(none);
        expect(grid.splash(CX, CY, 6, 12, 8)).toEqual(none);
        expect(grid.totalPx()).toBe(before);
    });

    it("keeps the volume when the ring is cut by the edge of the grid", () => {
        const grid = filledBowl();
        const before = grid.totalPx();
        const result = grid.splash(2, CY, 6, 12, 8);
        expect(result.moved).toBe(true);
        expect(grid.totalPx()).toBeCloseTo(before + result.addedPx - result.lostPx, 3);
    });
});
