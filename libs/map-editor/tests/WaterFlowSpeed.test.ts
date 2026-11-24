import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { CELL_METRES, FASTEST_FLOW_CELLS, steadyFlowSpeed, WaterGrid, waveSpeed } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";

const still: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };

/**
 * A level channel fed at its head, whose water leaves by its foot (the edge of the grid): once the flow is steady,
 * what each row carries (pixels of water over one cell a second), and the depth and the slope of the surface in its
 * middle. The bed is level (the relief only holds whole pixels): the surface alone slopes.
 */
function channel(inertia: boolean): { carried: number; depth: number; slope: number } {
    // The water that creeps carries little: a strong flow would pile up at the head over the highest level, and a
    // long channel would take hours to fill.
    const length = inertia ? 160 : 60;
    const fedPx = inertia ? 0.3 : 0.03;
    const steps = inertia ? 6000 : 20000;
    const middle = length / 2;
    const rows = 5;
    // High banks on both sides: the water leaves by the foot of the channel only.
    const cells = new Map<string, number>();
    for (let y = 0; y < rows + 4; y++) {
        // The head is closed too: at the edge of the grid the water would leave that way as well.
        for (let x = 0; x < length; x++) if (x < 2 || y < 2 || y >= rows + 2) cells.set(cellKey(x, y), 250);
    }
    const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: length, height: rows + 4 });
    grid.setMaxSurface(256);
    const input: WaterStepInput = inertia ? { ...still, inertia: true, seconds: 0.1 } : still;
    let fed = 0;
    for (let step = 0; step < steps; step++) {
        fed = grid.rainOn(5, 4, 2.9, fedPx);
        grid.step(input);
    }
    // What the head receives in a second, shared between the rows.
    return {
        carried: (fed * 10) / rows,
        depth: grid.depthAt(middle, 4),
        slope: (grid.depthAt(middle - 2, 4) - grid.depthAt(middle + 2, 4)) / 4,
    };
}

describe("steadyFlowSpeed", () => {
    it("is nothing without a slope or without water", () => {
        expect(steadyFlowSpeed(0, 20, true)).toBe(0);
        expect(steadyFlowSpeed(1, 0, true)).toBe(0);
        expect(steadyFlowSpeed(0, 20, false)).toBe(0);
        expect(steadyFlowSpeed(Number.NaN, 20, true)).toBe(0);
    });

    it("grows with the slope, up to the fastest water told", () => {
        for (const inertia of [true, false]) {
            expect(steadyFlowSpeed(0.2, 20, inertia)).toBeGreaterThan(steadyFlowSpeed(0.1, 20, inertia));
            expect(steadyFlowSpeed(-0.2, 20, inertia)).toBe(steadyFlowSpeed(0.2, 20, inertia));
            expect(steadyFlowSpeed(5000, 20, inertia)).toBe(FASTEST_FLOW_CELLS);
        }
    });

    it("is the speed the water with inertia really takes down a slope", () => {
        const { carried, depth, slope } = channel(true);
        const told = steadyFlowSpeed(slope, depth, true);
        expect(told / (carried / depth)).toBeGreaterThan(0.8);
        expect(told / (carried / depth)).toBeLessThan(1.25);
    });

    it("is the speed the water that creeps really takes down a slope", () => {
        const { carried, depth, slope } = channel(false);
        const told = steadyFlowSpeed(slope, depth, false);
        expect(told / (carried / depth)).toBeGreaterThan(0.8);
        expect(told / (carried / depth)).toBeLessThan(1.25);
    });

    it("has a cell about 55 cm wide, and waves that run faster in deeper water", () => {
        expect(CELL_METRES).toBeCloseTo(0.548, 3);
        expect(waveSpeed(64)).toBeGreaterThan(waveSpeed(16));
        expect(waveSpeed(0)).toBe(0);
    });
});
