import { describe, expect, it } from "vitest";
import { advanceImpactWave, startImpactWave } from "../src/Catastrophe/ImpactWave";
import {
    METEOR_ADDED_PX,
    METEOR_CREST_PX,
    METEOR_DISC_CELLS,
    METEOR_WAVE_CELLS,
    METEOR_WAVE_CELLS_PER_STEP,
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
        const started = startImpactWave(grid, CX, CY);
        expect(started).toBeDefined();
        if (!started) return;
        expect(grid.depthAt(CX, CY)).toBe(0);
        expect(grid.depthAt(CX + METEOR_DISC_CELLS, CY)).toBe(0);
        expect(started.addedPx).toBe(METEOR_ADDED_PX * discSize(METEOR_DISC_CELLS));
        expect(started.wave.carriedPx).toBeCloseTo(before - grid.totalPx() + started.addedPx, 3);
    });

    it("does not start outside the grid nor in a wall", () => {
        const grid = lake();
        const before = grid.totalPx();
        expect(startImpactWave(grid, 500, 500)).toBeUndefined();
        const walled = new WaterGrid(undefined, bounds, (x, y) => x === CX && y === CY);
        expect(startImpactWave(walled, CX, CY)).toBeUndefined();
        expect(grid.totalPx()).toBe(before);
    });

    it("crosses open water as a low swell", () => {
        const grid = lake();
        const far = grid.depthAt(CX + 12, CY);
        const started = startImpactWave(grid, CX, CY);
        if (!started) throw new Error("no wave");
        for (let step = 0; step < 4; step++) advanceImpactWave(grid, started.wave);
        const gained = grid.depthAt(CX + 12, CY) - far;
        expect(gained).toBeGreaterThan(0);
        expect(gained).toBeLessThanOrEqual(METEOR_CREST_PX + 1e-3);
    });

    it("breaks on the shore: the dry ground around the lake is flooded", () => {
        const grid = lake();
        const started = startImpactWave(grid, CX, CY);
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
        const started = startImpactWave(grid, CX, CY);
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
        const started = startImpactWave(grid, CX, CY);
        if (!started) throw new Error("no wave");
        finish(grid, started.wave);
        expect(beyond()).toEqual(before);
    });

    it("ends once it went as far as it goes", () => {
        const grid = lake();
        const started = startImpactWave(grid, CX, CY);
        if (!started) throw new Error("no wave");
        let steps = 0;
        while (!advanceImpactWave(grid, started.wave).done) steps++;
        expect(steps + 1).toBeLessThanOrEqual(
            Math.ceil((METEOR_WAVE_CELLS - METEOR_DISC_CELLS) / METEOR_WAVE_CELLS_PER_STEP),
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
        const started = startImpactWave(grid, 12, 12);
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
});
