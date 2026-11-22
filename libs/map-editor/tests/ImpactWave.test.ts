import { describe, expect, it } from "vitest";
import { advanceImpactWave, blastWater, startImpactWave } from "../src/Catastrophe/ImpactWave";
import {
    METEOR_ADDED_PX,
    METEOR_CREST_PX,
    METEOR_DEFAULT_TILES,
    METEOR_MAX_TILES,
    METEOR_MIN_TILES,
    METEOR_WAVE_CELLS_PER_STEP,
    meteorShape,
} from "../src/Catastrophe/Meteor";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput, WaterWallSides } from "../src/Terrain/WaterGrid";
import type { TerrainData } from "../src/types";

const nothing: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
const SIZE = 120;
const CX = 60;
const CY = 60;
const LAKE = 25;
/** The usual meteor: a crater 4 tiles wide (8 cells), a wave as far as 64 cells. */
const shape = meteorShape(4);
const bounds = { x: 0, y: 0, width: SIZE, height: SIZE };
const distance = (x: number, y: number): number => Math.hypot(x - CX, y - CY);

/** A round lake, 25 cells wide around the middle of the grid and 12 px deep, on flat dry ground. */
const lake = (walls?: WaterWallSides, size = SIZE): WaterGrid => {
    const cells = new Map<string, number>();
    for (let x = 0; x < size; x++)
        for (let y = 0; y < size; y++) if (distance(x, y) <= LAKE) cells.set(cellKey(x, y), -32);
    const terrain: TerrainData = withHeights(undefined, cells);
    const grid = new WaterGrid(terrain, { ...bounds, width: size, height: size }, undefined, walls);
    for (let step = 0; step < 3; step++) grid.step({ ...nothing, rainPx: 4 });
    return grid;
};
const discSize = (radius: number): number => {
    let count = 0;
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (distance(x, y) <= radius) count++;
    return count;
};
/** Runs a wave to its end; what it lost on the way. */
const finish = (grid: WaterGrid, wave: NonNullable<ReturnType<typeof startImpactWave>>["wave"]): number => {
    let lost = 0;
    for (let step = 0; step < 1000; step++) {
        const result = advanceImpactWave(grid, wave);
        lost += result.lostPx;
        if (result.done) return lost;
    }
    throw new Error("the wave never ended");
};

describe("the wave of an impact", () => {
    it("empties the crater and carries its water, with the water the meteor brings", () => {
        const grid = lake();
        const before = grid.totalPx();
        const started = startImpactWave(grid, CX, CY, shape);
        expect(started).toBeDefined();
        if (!started) return;
        expect(grid.depthAt(CX, CY)).toBe(0);
        expect(grid.depthAt(CX + shape.discCells, CY)).toBe(0);
        expect(started.addedPx).toBe(METEOR_ADDED_PX * discSize(shape.discCells));
        expect(started.wave.carriedPx).toBeCloseTo(before - grid.totalPx() + started.addedPx, 3);
    });

    it("does not start outside the grid nor in a wall", () => {
        const grid = lake();
        const before = grid.totalPx();
        expect(startImpactWave(grid, 500, 500, shape)).toBeUndefined();
        const walled = new WaterGrid(undefined, bounds, (x, y) => x === CX && y === CY);
        expect(startImpactWave(walled, CX, CY, shape)).toBeUndefined();
        expect(grid.totalPx()).toBe(before);
    });

    it("crosses open water as a low swell", () => {
        const grid = lake();
        const far = grid.depthAt(CX + 12, CY);
        const started = startImpactWave(grid, CX, CY, shape);
        if (!started) throw new Error("no wave");
        for (let step = 0; step < 4; step++) advanceImpactWave(grid, started.wave);
        const gained = grid.depthAt(CX + 12, CY) - far;
        expect(gained).toBeGreaterThan(0);
        expect(gained).toBeLessThanOrEqual(METEOR_CREST_PX + 1e-3);
    });

    it("breaks on the shore: the dry ground around the lake is flooded", () => {
        const grid = lake();
        const started = startImpactWave(grid, CX, CY, shape);
        if (!started) throw new Error("no wave");
        expect(grid.depthAt(CX + LAKE + 1, CY)).toBe(0);
        finish(grid, started.wave);
        expect(grid.depthAt(CX + LAKE + 1, CY)).toBeGreaterThan(METEOR_CREST_PX);
        let onLand = 0;
        for (let x = 0; x < SIZE; x++)
            for (let y = 0; y < SIZE; y++) if (distance(x, y) > LAKE) onLand += grid.depthAt(x, y);
        expect(onLand).toBeGreaterThan(started.wave.carriedPx);
    });

    it("never makes water: what is in the grid is what was there, what the meteor brought, less what was lost", () => {
        const grid = lake();
        const before = grid.totalPx();
        const started = startImpactWave(grid, CX, CY, shape);
        if (!started) throw new Error("no wave");
        const lost = finish(grid, started.wave);
        expect(grid.totalPx()).toBeCloseTo(before + started.addedPx - lost, 2);
        expect(started.wave.carriedPx).toBeCloseTo(0, 3);
    });

    it("does not cross a wall", () => {
        const east = new Set<string>();
        for (let y = 0; y < SIZE; y++) east.add(cellKey(CX + 10, y));
        const grid = lake({ east, south: new Set<string>() });
        const beyond = (): number[] => {
            const depths: number[] = [];
            for (let x = CX + 11; x < SIZE; x++) for (let y = 0; y < SIZE; y++) depths.push(grid.depthAt(x, y));
            return depths;
        };
        const before = beyond();
        const started = startImpactWave(grid, CX, CY, shape);
        if (!started) throw new Error("no wave");
        finish(grid, started.wave);
        expect(beyond()).toEqual(before);
    });

    it("ends once it went as far as it goes", () => {
        const grid = lake();
        const started = startImpactWave(grid, CX, CY, shape);
        if (!started) throw new Error("no wave");
        let steps = 0;
        while (!advanceImpactWave(grid, started.wave).done) steps++;
        expect(steps + 1).toBeLessThanOrEqual(
            Math.ceil((shape.waveCells - shape.discCells) / METEOR_WAVE_CELLS_PER_STEP),
        );
    });

    it("gives back to the crater what found no shore", () => {
        // A grid no wider than the lake: no dry ground to break on.
        const size = 2 * 12 + 1;
        const cells = new Map<string, number>();
        for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) cells.set(cellKey(x, y), -32);
        const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: size, height: size });
        for (let step = 0; step < 3; step++) grid.step({ ...nothing, rainPx: 4 });
        const before = grid.totalPx();
        const started = startImpactWave(grid, 12, 12, shape);
        if (!started) throw new Error("no wave");
        let lost = 0;
        for (;;) {
            const result = advanceImpactWave(grid, started.wave);
            lost += result.lostPx;
            if (result.done) break;
        }
        expect(grid.depthAt(12, 12)).toBeGreaterThan(0);
        expect(grid.totalPx()).toBeCloseTo(before + started.addedPx - lost, 2);
    });

    it("a wider meteor throws out more water", () => {
        const small = startImpactWave(lake(), CX, CY, meteorShape(1));
        const wide = startImpactWave(lake(), CX, CY, meteorShape(8));
        if (!small || !wide) throw new Error("no wave");
        expect(wide.wave.carriedPx).toBeGreaterThan(small.wave.carriedPx * 10);
    });
});

describe("meteorShape", () => {
    it("is the crater of the size chosen, in cells of 16 px, and a wave six times as far", () => {
        expect(meteorShape(4)).toEqual({ radiusTiles: 4, discCells: 8, waveCells: 64 });
        expect(meteorShape(8)).toEqual({ radiusTiles: 8, discCells: 16, waveCells: 96 });
        // The smallest: a crater of one tile, and a wave that still goes as far as the shortest one.
        expect(meteorShape(1)).toEqual({ radiusTiles: 1, discCells: 2, waveCells: 64 });
    });

    it("keeps a size within what a meteor may be, and takes the usual one for a size that is not a number", () => {
        expect([METEOR_MIN_TILES, METEOR_MAX_TILES, METEOR_DEFAULT_TILES]).toEqual([1, 8, 4]);
        expect(meteorShape(-2).radiusTiles).toBe(1);
        expect(meteorShape(0.6).radiusTiles).toBe(1);
        // A tab opened before the largest was 8, still at 24: kept, at the largest.
        expect(meteorShape(24).radiusTiles).toBe(8);
        expect(meteorShape(1000).radiusTiles).toBe(8);
        // No size at all (0, what a message that says none carries) is the usual one.
        expect(meteorShape(0).radiusTiles).toBe(4);
        expect(meteorShape(7.6).radiusTiles).toBe(8);
        expect(meteorShape(Number.NaN).radiusTiles).toBe(4);
        expect(meteorShape(Number.POSITIVE_INFINITY).radiusTiles).toBe(4);
    });
});

describe("the blast of an impact", () => {
    /** The water held by the whole grid. */
    const held = (grid: WaterGrid): number => {
        let total = 0;
        for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) total += grid.depthAt(x, y);
        return total;
    };
    // A crater 2 tiles wide: 4 cells. A blast that reaches 2.5 times as far: 10 cells.
    const small = meteorShape(2);

    it("drives away the water around the crater, most next to it and none where it ends", () => {
        const grid = lake();
        const before = grid.depthAt(CX + 5, CY);
        const blast = blastWater(grid, CX, CY, small, 2.5);
        expect(blast?.movedPx).toBeGreaterThan(0);
        // In the crater the blast itself takes nothing: the impact did.
        expect(grid.depthAt(CX + 2, CY)).toBeCloseTo(before);
        // One cell past the crater, five sixths of the water went; one cell before the end, a sixth.
        expect(grid.depthAt(CX + 5, CY)).toBeCloseTo(before / 6, 1);
        expect(grid.depthAt(CX + 9, CY)).toBeCloseTo((before * 5) / 6, 1);
        // What was driven away lies past the reach of the blast, as a swell.
        expect(grid.depthAt(CX + 11, CY)).toBeGreaterThan(before);
    });

    it("loses no water but what finds no room past it", () => {
        const grid = lake();
        const before = held(grid);
        const blast = blastWater(grid, CX, CY, small, 2.5);
        expect(held(grid) + (blast?.lostPx ?? 0)).toBeCloseTo(before, 0);
    });

    it("reaches as far as the map says, and is nothing for a reach of one or less", () => {
        const wide = lake();
        blastWater(wide, CX, CY, small, 4);
        const narrow = lake();
        blastWater(narrow, CX, CY, small, 2);
        // Twelve cells from the middle: inside a blast of 16 cells, past one of 8.
        expect(wide.depthAt(CX + 12, CY)).toBeLessThan(narrow.depthAt(CX + 12, CY));
        const still = lake();
        const before = still.depthAt(CX + 5, CY);
        expect(blastWater(still, CX, CY, small, 1)).toBeUndefined();
        expect(blastWater(still, CX, CY, small, Number.NaN)).toBeUndefined();
        expect(still.depthAt(CX + 5, CY)).toBeCloseTo(before);
        expect(blastWater(still, -50, -50, small, 2.5)).toBeUndefined();
    });
});
