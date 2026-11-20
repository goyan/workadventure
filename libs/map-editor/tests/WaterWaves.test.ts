import { describe, expect, it } from "vitest";
import { advanceImpactWave, startImpactWave, strikeWater } from "../src/Catastrophe/ImpactWave";
import type { ImpactWave } from "../src/Catastrophe/ImpactWave";
import { meteorShape } from "../src/Catastrophe/Meteor";
import { UpdateWAMSettingCommand } from "../src/Commands/WAM/UpdateWAMSettingCommand";
import { soilCode } from "../src/Terrain/Soils";
import type { SoilName } from "../src/Terrain/Soils";
import { cellKey, withHeights, withSoils } from "../src/Terrain/TerrainGrid";
import { steadyFlowSpeed, WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { stepInputOf } from "../src/Terrain/WaterInputs";
import { DEFAULT_WATER_SETTINGS, DEFAULT_WAVE_SETTINGS } from "../src/types";
import type { TerrainData, WAMFileFormat, WaveSettings } from "../src/types";

const still: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
const withWaves = (waves: Partial<WaveSettings> = {}): WaterStepInput => ({
    ...still,
    inertia: true,
    seconds: 0.1,
    waves: { ...DEFAULT_WAVE_SETTINGS, ...waves },
});

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

/**
 * A channel closed by high banks, 5 cells wide: a sea 40 px deep at its west end, then a beach that rises a pixel
 * every two cells up to the shore (the cell 100), and land that goes on rising beyond. `soil` paints the land.
 */
const SHORE = 100;
const seaDepth = (x: number): number => (x < 20 ? 40 : Math.max(0, 40 - Math.floor((x - 20) / 2)));
function beach(soil?: SoilName): WaterGrid {
    const length = 160;
    const cells = new Map<string, number>();
    const soils = new Map<string, number>();
    for (let y = 0; y < 9; y++) {
        for (let x = 0; x < length; x++) {
            const inside = y >= 2 && y < 7 && x >= 2 && x < length - 2;
            // The bed: 40 px under the level of the sea at the west, the level of the sea at the shore, land beyond.
            cells.set(cellKey(x, y), inside ? (x < SHORE ? -seaDepth(x) : Math.floor((x - SHORE) / 2)) : 250);
            if (soil && inside && x >= SHORE) soils.set(cellKey(x, y), soilCode(soil));
        }
    }
    let terrain: TerrainData = withHeights(undefined, cells);
    if (soils.size > 0) terrain = withSoils(terrain, soils);
    return new WaterGrid(terrain, { x: 0, y: 0, width: length, height: 9 });
}

/** Sends a wave from the west end of the sea, and tells how far it wetted the land beyond the shore (cells). */
function runUp(grid: WaterGrid, input: WaterStepInput, bump = 14): number {
    fill(grid, (x, y) => {
        if (y < 2 || y >= 7 || x < 2 || x >= SHORE) return 0;
        return seaDepth(x) + bump * Math.exp(-(((x - 12) / 6) ** 2));
    });
    let furthest = 0;
    for (let step = 0; step < 900; step++) {
        grid.step(input);
        for (let x = SHORE; x < 158; x++)
            if (grid.depthAt(x, 4) > 0.25 && x - SHORE + 1 > furthest) furthest = x - SHORE + 1;
    }
    return furthest;
}

/** The highest the surface of the sea got over its level at rest, at a cell, while a wave went by. */
function crestAt(input: WaterStepInput, at: number, bump = 3): number {
    const grid = beach();
    fill(grid, (x, y) => {
        if (y < 2 || y >= 7 || x < 2 || x >= SHORE) return 0;
        return seaDepth(x) + bump * Math.exp(-(((x - 12) / 6) ** 2));
    });
    let crest = 0;
    for (let step = 0; step < 600; step++) {
        grid.step(input);
        if (step > 20) crest = Math.max(crest, grid.depthAt(at, 4) - seaDepth(at));
    }
    return crest;
}

describe("the waves of the water with inertia", () => {
    it("carry a wave across the sea to the shore, and up the land", () => {
        // Half way to the shore the wave still stands, and it wets the land beyond the shore.
        expect(crestAt(withWaves(), 60)).toBeGreaterThan(0.5);
        expect(runUp(beach(), withWaves())).toBeGreaterThanOrEqual(2);
    });

    it("lose their height on the way with a strong damping: the lake that calms at once has no swell", () => {
        const light = crestAt(withWaves({ damping: 0.02 }), 60);
        const heavy = crestAt(withWaves({ damping: 0.5 }), 60);
        expect(heavy).toBeLessThan(light / 2);
    });

    it("run further up the land on a smooth ground than on a rough one", () => {
        const smooth = runUp(beach(), withWaves({ roughness: 0.2 }));
        const usual = runUp(beach(), withWaves({ roughness: 1 }));
        const rough = runUp(beach(), withWaves({ roughness: 10 }));
        expect(smooth).toBeGreaterThanOrEqual(usual);
        expect(usual).toBeGreaterThan(rough);
    });

    it("run further up a beach of clay than up a meadow", () => {
        expect(runUp(beach("clay"), withWaves())).toBeGreaterThan(runUp(beach("meadow"), withWaves()));
    });

    it("break: a steep front loses more of its flow when the waves break harder", () => {
        const never = runUp(beach(), withWaves({ breaking: 0 }));
        const hard = runUp(beach(), withWaves({ breaking: 5 }));
        expect(hard).toBeLessThan(never);
    });

    it("rock a stirred basin less when the water carries its momentum", () => {
        // A basin with a step in its water: how high the water is thrown against its end.
        const thrown = (momentum: number): number => {
            const cells = new Map<string, number>();
            for (let y = 2; y < 7; y++) for (let x = 2; x < 22; x++) cells.set(cellKey(x, y), -60);
            const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 24, height: 9 });
            fill(grid, (x, y) => (x >= 2 && x < 22 && y >= 2 && y < 7 ? (x < 12 ? 30 : 10) : 0));
            let highest = 0;
            for (let step = 0; step < 300; step++) {
                grid.step(withWaves({ momentum, breaking: 0 }));
                for (let x = 2; x < 22; x++) highest = Math.max(highest, grid.depthAt(x, 4));
            }
            return highest;
        };
        expect(thrown(1)).toBeLessThan(thrown(0));
    });

    it("are not cut at the level the map sets for its floods", () => {
        // 60 px of water on flat ground, far from the edges: over the 18 px a flood may stand at.
        const column = (grid: WaterGrid): void =>
            fill(grid, (x, y) => (Math.abs(x - 30) < 3 && Math.abs(y - 30) < 3 ? 60 : 0));
        const creeping = new WaterGrid(undefined, { x: 0, y: 0, width: 60, height: 60 });
        column(creeping);
        expect(creeping.step(still).lostPx).toBeGreaterThan(0);
        const waves = new WaterGrid(undefined, { x: 0, y: 0, width: 60, height: 60 });
        column(waves);
        const before = waves.totalPx();
        let lost = 0;
        for (let step = 0; step < 20; step++) lost += waves.step(withWaves()).lostPx;
        expect(lost).toBe(0);
        expect(waves.totalPx()).toBeCloseTo(before, 1);
    });
});

describe("the tsunami of a comet", { timeout: 30_000 }, () => {
    // A round lake 40 cells in radius, 60 px deep, full to 55 px, flat land around; a comet 6 tiles in radius
    // falls in its middle. The shore is 40 cells east of it.
    const side = 200;
    const middle = 100;
    const shore = 40;
    const strike = (input: WaterStepInput): { reach: number; high: number; lost: number; drift: number } => {
        const cells = new Map<string, number>();
        const inLake = (x: number, y: number): boolean => (x - middle) ** 2 + (y - middle) ** 2 <= shore * shore;
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if (inLake(x, y)) cells.set(cellKey(x, y), -60);
        const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: side, height: side });
        fill(grid, (x, y) => (inLake(x, y) ? 55 : 0));
        const before = grid.totalPx();
        const started = startImpactWave(grid, middle, middle, meteorShape(6));
        if (!started) throw new Error("The comet missed the lake");
        let wave: ImpactWave | undefined = started.wave;
        let lost = 0;
        let reach = 0;
        let high = 0;
        for (let step = 0; step < 300; step++) {
            if (wave) {
                const moved = advanceImpactWave(grid, wave);
                lost += moved.lostPx;
                if (moved.done) wave = undefined;
            }
            lost += grid.step(input).lostPx;
            if (step % 5 !== 0) continue;
            for (let x = middle + shore + 1; x < side - 2; x++) {
                const held = grid.depthAt(x, middle);
                if (held > 1 && x - middle - shore > reach) reach = x - middle - shore;
                if (x === middle + shore + 10 && held > high) high = held;
            }
        }
        return { reach, high, lost, drift: before + started.addedPx - lost - grid.totalPx() };
    };

    it("thrown as a rim on a water with inertia: the crater is empty, its water stands around it, none further", () => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) cells.set(cellKey(x, y), -60);
        const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 120, height: 120 });
        fill(grid, () => 55);
        const before = grid.totalPx();
        const shape = meteorShape(6);
        const struck = strikeWater(grid, 60, 60, shape);
        expect(struck?.lostPx).toBeCloseTo(0, 1);
        expect(grid.depthAt(60, 60)).toBe(0);
        // The rim, between the crater (12 cells) and one and a half times its radius.
        expect(grid.depthAt(60 + 15, 60)).toBeGreaterThan(55 + 18);
        // Further, the lake is as it was: no ring laid ahead, the water itself will make the wave.
        expect(grid.depthAt(60 + 30, 60)).toBe(55);
        expect(grid.totalPx()).toBeCloseTo(before + (struck?.addedPx ?? 0), 0);
        expect(strikeWater(grid, 9999, 9999, shape)).toBeUndefined();
    });

    it("floods the land far beyond the shore, loses no water and stays sound", () => {
        const { reach, high, drift } = strike(withWaves());
        // Tens of cells inland, and a sheet over a quarter of a tile deep ten cells from the shore.
        // Measured when written: 48 cells inland, 12 px of water ten cells from the shore.
        expect(reach).toBeGreaterThan(20);
        expect(high).toBeGreaterThan(4);
        expect(Number.isFinite(drift)).toBe(true);
        expect(Math.abs(drift)).toBeLessThan(5);
    });

    it("goes as far inland whether the waves break or not: on land a flood is a sheet, not a wave", () => {
        const breaking = strike(withWaves({ breaking: 5 }));
        const never = strike(withWaves({ breaking: 0 }));
        expect(breaking.reach).toBeGreaterThan(never.reach * 0.7);
    });

    it("goes further inland than the water that creeps", () => {
        expect(strike(withWaves()).reach).toBeGreaterThan(strike(still).reach);
    });
});

describe("steadyFlowSpeed with the friction of the ground", () => {
    it("is slower on a rougher soil and with a stronger damping", () => {
        const usual = steadyFlowSpeed(0.2, 10, true);
        expect(steadyFlowSpeed(0.2, 10, true, DEFAULT_WAVE_SETTINGS, 0.045)).toBeLessThan(usual);
        expect(steadyFlowSpeed(0.2, 10, true, { roughness: 5, damping: 0.02 })).toBeLessThan(usual);
        expect(steadyFlowSpeed(0.2, 10, true, { roughness: 1, damping: 0.5 })).toBeLessThan(usual);
        // Without any friction of the ground, the damping alone holds the water back.
        expect(steadyFlowSpeed(0.2, 10, true, { roughness: 0, damping: 0.5 })).toBeGreaterThan(0);
    });
});

describe("the settings of the waves", () => {
    const emptyWam = (): WAMFileFormat => ({
        version: "1.0.0",
        mapUrl: "map.tmj",
        entities: {},
        areas: [],
        entityCollections: [],
        settings: {},
    });
    const send = (wam: WAMFileFormat, sent: Record<string, number | boolean>): Promise<unknown> =>
        new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateWaterSettingMessage",
                updateWaterSettingMessage: { runoff: 4, evaporation: 0.5, ...sent },
            },
        }).execute();

    it("are kept in the map within their bounds, each one as the map had it when the client says nothing", async () => {
        const wam = emptyWam();
        await send(wam, {});
        expect(wam.settings?.water).not.toHaveProperty("waves");
        await send(wam, { waveRoughness: 99, waveBreaking: 2 });
        expect(wam.settings?.water?.waves).toEqual({ roughness: 10, damping: 0.02, breaking: 2, momentum: 1 });
        await send(wam, { waveDamping: -3, waveMomentum: 0.5 });
        expect(wam.settings?.water?.waves).toEqual({ roughness: 10, damping: 0, breaking: 2, momentum: 0.5 });
        // An older client says nothing of them: they stay.
        await send(wam, {});
        expect(wam.settings?.water?.waves).toEqual({ roughness: 10, damping: 0, breaking: 2, momentum: 0.5 });
    });

    it("go to the water with inertia, the usual ones for a map that set none", () => {
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS }, 0, [], 0.1).waves).toBeUndefined();
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true }, 0, [], 0.1).waves).toEqual(
            DEFAULT_WAVE_SETTINGS,
        );
        const chosen = { roughness: 3, damping: 0.1, breaking: 0, momentum: 0.5 };
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true, waves: chosen }, 0, [], 0.1).waves).toEqual(
            chosen,
        );
    });
});
