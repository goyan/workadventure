import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput, WaterTally, WaterWallSides } from "../src/Terrain/WaterGrid";
import { stepInputOf } from "../src/Terrain/WaterInputs";
import { DEFAULT_WATER_SETTINGS } from "../src/types";
import type { TerrainData } from "../src/types";

const still: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
const inertia: WaterStepInput = { ...still, inertia: true, seconds: 0.1 };

/** A basin dug `depth` pixels under the ground, `length` cells by `width`, its corner at the cell 2,2. */
function basin(length: number, width: number, depth: number, walls?: WaterWallSides): WaterGrid {
    const cells = new Map<string, number>();
    for (let y = 2; y < 2 + width; y++) for (let x = 2; x < 2 + length; x++) cells.set(cellKey(x, y), -depth);
    const terrain: TerrainData = withHeights(undefined, cells);
    return new WaterGrid(terrain, { x: 0, y: 0, width: length + 4, height: width + 4 }, undefined, walls);
}

/** Lays water in a grid: `depthOf` pixels over each cell. */
function fill(grid: WaterGrid, depthOf: (cellX: number, cellY: number) => number): void {
    const { width, height } = grid.bounds;
    const bytes = new Uint8Array(width * height * 2);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const eighths = Math.round(depthOf(x, y) * 8);
            bytes[(y * width + x) * 2] = eighths & 255;
            bytes[(y * width + x) * 2 + 1] = eighths >> 8;
        }
    }
    expect(grid.readDepths(bytes)).toBe(true);
}

const inBasin = (length: number, width: number) => (x: number, y: number) =>
    x >= 2 && x < 2 + length && y >= 2 && y < 2 + width;

/** The gap between the highest and the lowest water along the middle row of a basin. */
function gap(grid: WaterGrid, length: number, row: number): number {
    let low = Infinity;
    let high = -Infinity;
    for (let x = 2; x < 2 + length; x++) {
        low = Math.min(low, grid.depthAt(x, row));
        high = Math.max(high, grid.depthAt(x, row));
    }
    return high - low;
}

/** How many steps a grid takes to bring that gap under a pixel, `most` when it never does. */
function stepsToLevel(grid: WaterGrid, length: number, row: number, input: WaterStepInput, most: number): number {
    for (let step = 1; step <= most; step++) {
        grid.step(input);
        if (gap(grid, length, row) < 1) return step;
    }
    return most;
}

describe("WaterGrid with inertia", () => {
    it("leaves a level lake alone: nothing moves, the grid is at rest", () => {
        const grid = basin(20, 6, 40);
        const inside = inBasin(20, 6);
        fill(grid, (x, y) => (inside(x, y) ? 30 : 0));
        const before = grid.totalPx();
        let tally: WaterTally | undefined;
        for (let step = 0; step < 50; step++) tally = grid.step(inertia);
        expect(tally?.moved).toBe(false);
        expect(grid.totalPx()).toBe(before);
        expect(grid.depthAt(5, 4)).toBe(30);
    });

    it("levels a lake and keeps all its water", () => {
        const grid = basin(20, 6, 40);
        const inside = inBasin(20, 6);
        fill(grid, (x, y) => (inside(x, y) ? (x < 12 ? 30 : 10) : 0));
        const before = grid.totalPx();
        // Three minutes: the ground hardly holds back deep water, a stirred lake rocks for a while.
        for (let step = 0; step < 1800; step++) grid.step(inertia);
        expect(grid.totalPx()).toBeCloseTo(before, 0);
        expect(gap(grid, 20, 4)).toBeLessThan(1);
        // All of it still in the basin: the water never climbed over its rim.
        expect(grid.depthAt(1, 4)).toBe(0);
    });

    it("levels a long lake several times sooner than the water that only creeps from cell to cell", () => {
        const make = (): WaterGrid => {
            const grid = basin(120, 3, 60);
            const inside = inBasin(120, 3);
            fill(grid, (x, y) => (inside(x, y) ? (x < 62 ? 50 : 40) : 0));
            return grid;
        };
        const most = 6000;
        const withInertia = stepsToLevel(make(), 120, 3, inertia, most);
        const creeping = stepsToLevel(make(), 120, 3, still, most);
        expect(withInertia).toBeLessThan(most);
        expect(withInertia * 3).toBeLessThan(creeping);
    });

    it("never crosses a wall", () => {
        // A wall on the east side of the column 11, all along the basin.
        const east = new Set<string>();
        for (let y = 0; y < 10; y++) east.add(cellKey(11, y));
        const grid = basin(20, 6, 40, { east, south: new Set() });
        const inside = inBasin(20, 6);
        fill(grid, (x, y) => (inside(x, y) && x <= 11 ? 30 : 0));
        for (let step = 0; step < 300; step++) grid.step(inertia);
        expect(grid.depthAt(12, 4)).toBe(0);
        expect(grid.depthAt(11, 4)).toBe(30);
    });

    it("stays stable in deep water: its waves stay in the basin, nothing is lost, and it calms down", () => {
        const grid = basin(60, 3, 256);
        const inside = inBasin(60, 3);
        fill(grid, (x, y) => (inside(x, y) ? (x < 32 ? 200 : 100) : 0));
        const before = grid.totalPx();
        let highest = 0;
        let lost = 0;
        let early = 0;
        for (let step = 0; step < 1800; step++) {
            lost += grid.step(inertia).lostPx;
            for (let x = 2; x < 62; x++) highest = Math.max(highest, grid.depthAt(x, 3));
            if (step === 299) early = gap(grid, 60, 3);
        }
        // A wave thrown back by the end of the basin stands over the water it started with, never over the rim.
        expect(highest).toBeLessThan(256);
        expect(lost).toBe(0);
        expect(grid.totalPx()).toBeCloseTo(before, -1);
        // Deep water rocks long: after three minutes it is far calmer than after half a minute, not yet still.
        expect(gap(grid, 60, 3)).toBeLessThan(early / 4);
        expect(gap(grid, 60, 3)).toBeLessThan(10);
    });

    it("spreads a sheet of water on flat ground, and counts what leaves by the edge of the grid", () => {
        const grid = new WaterGrid(undefined, { x: 0, y: 0, width: 30, height: 30 });
        fill(grid, (x, y) => (Math.abs(x - 15) < 4 && Math.abs(y - 15) < 4 ? 16 : 0));
        const before = grid.totalPx();
        let lost = 0;
        for (let step = 0; step < 400; step++) lost += grid.step(inertia).lostPx;
        expect(grid.depthAt(2, 15)).toBeGreaterThan(0);
        expect(lost).toBeGreaterThan(0);
        expect(grid.totalPx() + lost).toBeCloseTo(before, 0);
    });

    it("forgets the momentum of its water when the map goes back to the water that creeps", () => {
        const make = (): WaterGrid => {
            const grid = basin(20, 6, 40);
            const inside = inBasin(20, 6);
            fill(grid, (x, y) => (inside(x, y) ? (x < 12 ? 30 : 10) : 0));
            return grid;
        };
        const switched = make();
        for (let step = 0; step < 20; step++) switched.step(inertia);
        // The same depths in a grid that never had any momentum.
        const fresh = make();
        fresh.readDepths(switched.writeDepths());
        switched.readDepths(switched.writeDepths());
        switched.step(still);
        fresh.step(still);
        switched.step(inertia);
        fresh.step(inertia);
        expect(switched.writeDepths()).toEqual(fresh.writeDepths());
    });
});

describe("stepInputOf with inertia", () => {
    it("asks for the water with inertia only on a map that chose it, with the time of the step", () => {
        expect(stepInputOf(undefined, 0, [], 0.1).inertia).toBeUndefined();
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: false }, 0, [], 0.1).inertia).toBeUndefined();
        const input = stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true }, 0, [], 0.1);
        expect(input.inertia).toBe(true);
        expect(input.seconds).toBe(0.1);
    });
});
