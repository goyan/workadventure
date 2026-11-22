import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { advanceImpactWave, startImpactWave, strikeWater } from "../src/Catastrophe/ImpactWave";
import type { ImpactWave } from "../src/Catastrophe/ImpactWave";
import { meteorShape } from "../src/Catastrophe/Meteor";
import { UpdateWAMSettingCommand } from "../src/Commands/WAM/UpdateWAMSettingCommand";
import { soilCode } from "../src/Terrain/Soils";
import type { SoilName } from "../src/Terrain/Soils";
import { cellKey, withHeights, withSoils } from "../src/Terrain/TerrainGrid";
import {
    CELL_LITRES_PER_PX,
    CELL_METRES,
    SLOW_SPEED_UNITS,
    SLOWEST_TOLD_CELLS,
    SLOWEST_TOLD_METRES,
    slowSpeedByte,
    slowSpeedOf,
    steadyFlowSpeed,
    WaterGrid,
} from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { stepInputOf, stepsBetweenUpdates } from "../src/Terrain/WaterInputs";
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

describe("the precision of the water with inertia", () => {
    it("lets a wave run faster in deep water with more moves a step", () => {
        // A basin 250 px deep, 120 cells long: when the wave of a step in the water reaches its far end.
        const arrival = (moves: number): number => {
            const cells = new Map<string, number>();
            for (let y = 2; y < 7; y++) for (let x = 2; x < 122; x++) cells.set(cellKey(x, y), -256);
            const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 124, height: 9 });
            fill(grid, (x, y) => (x >= 2 && x < 122 && y >= 2 && y < 7 ? (x < 12 ? 250 : 230) : 0));
            for (let step = 1; step <= 400; step++) {
                grid.step({ ...withWaves(), moves });
                if (grid.depthAt(118, 4) > 231) return step;
            }
            return 400;
        };
        expect(arrival(8)).toBeLessThan(arrival(3));
        // Out of its bounds, the usual precision and the most a map may ask for.
        expect(arrival(Number.NaN)).toBe(arrival(3));
        expect(arrival(99)).toBe(arrival(8));
    });

    it("flows as many times slower as the map asks: a wave takes twice as long at half its real pace", () => {
        // A basin 30 px deep, 120 cells long: when the wave of a step in the water reaches its far end.
        const arrival = (pace?: number): number => {
            const cells = new Map<string, number>();
            for (let y = 2; y < 7; y++) for (let x = 2; x < 122; x++) cells.set(cellKey(x, y), -60);
            const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 124, height: 9 });
            fill(grid, (x, y) => (x >= 2 && x < 122 && y >= 2 && y < 7 ? (x < 12 ? 40 : 30) : 0));
            for (let step = 1; step <= 2000; step++) {
                grid.step({ ...withWaves({ damping: 0 }), ...(pace === undefined ? {} : { pace }) });
                if (grid.depthAt(118, 4) > 30.2) return step;
            }
            return 2000;
        };
        const real = arrival();
        expect(arrival(1)).toBe(real);
        const half = arrival(0.5);
        expect(half / real).toBeGreaterThan(1.8);
        expect(half / real).toBeLessThan(2.2);
        expect(arrival(2)).toBeLessThan(real);
        // A pace that is not a number: the real one.
        expect(arrival(Number.NaN)).toBe(real);
    });

    it("goes from the settings of the map to the step, three moves when the map says nothing", () => {
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true }, 0, [], 0.1).moves).toBe(3);
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true, precision: 6 }, 0, [], 0.1).moves).toBe(6);
        expect(
            stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: false, precision: 6 }, 0, [], 0.1).moves,
        ).toBeUndefined();
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true }, 0, [], 0.1).pace).toBe(1);
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true, flowPace: 0.25 }, 0, [], 0.1).pace).toBe(0.25);
    });

    it("tells the room every so many steps", () => {
        // A map that says nothing: five times a second.
        expect(stepsBetweenUpdates(undefined)).toBe(2);
        expect(stepsBetweenUpdates(1)).toBe(10);
        expect(stepsBetweenUpdates(5)).toBe(2);
        expect(stepsBetweenUpdates(10)).toBe(1);
        expect(stepsBetweenUpdates(1000)).toBe(1);
        expect(stepsBetweenUpdates(Number.NaN)).toBe(2);
    });
});

describe("the speed of the water told to the browsers", () => {
    /** A level channel, 5 cells wide, fed at its west end: its water runs east. */
    const river = (): WaterGrid => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 9; y++)
            for (let x = 0; x < 80; x++) if (x < 2 || y < 2 || y >= 7) cells.set(cellKey(x, y), 250);
        const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 80, height: 9 });
        grid.setMaxSurface(256);
        return grid;
    };
    const signed = (byte: number): number => (byte << 24) >> 24;

    it("is none for a water that only creeps", () => {
        const grid = river();
        for (let step = 0; step < 50; step++) {
            grid.rainOn(5, 4, 2.9, 0.3);
            grid.step(still);
        }
        expect(grid.writeSpeeds()).toBeUndefined();
    });

    it("tells, block by block, which way the water with inertia runs and how fast", () => {
        const grid = river();
        for (let step = 0; step < 600; step++) {
            grid.rainOn(5, 4, 2.9, 0.3);
            grid.step(withWaves());
        }
        const speeds = grid.writeSpeeds();
        // 80 by 9 cells: 20 by 3 blocks of 4 cells a side, two bytes each.
        expect(speeds).toHaveLength(20 * 3 * 2);
        if (!speeds) return;
        // The block in the middle of the channel (column 10, row 1): the water runs east, not across.
        const at = (1 * 20 + 10) * 2;
        expect(signed(speeds[at])).toBeGreaterThan(0);
        expect(Math.abs(signed(speeds[at + 1]))).toBeLessThanOrEqual(1);
        // A dry block (the bank): nothing.
        expect(speeds[0]).toBe(0);
        // Seen at half its real pace, the same water is told half as fast.
        const slow = grid.writeSpeeds(0.5);
        expect(signed(slow?.[at] ?? 0)).toBeCloseTo(signed(speeds[at]) / 2, 0);
    });

    it("tells them byte for byte as before the slow speeds were told apart", () => {
        const grid = river();
        for (let step = 0; step < 600; step++) {
            grid.rainOn(5, 4, 2.9, 0.3);
            grid.step(withWaves());
        }
        // The bytes the server sent for this river before it told the slow speeds (infogene at 5bb258985).
        const before = [
            0, 0, 3, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 7, 0, 7, 0,
            7, 0, 7, 0, 0, 0, 3, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
            7, 0, 7, 0, 7, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ];
        expect(Array.from(grid.writeSpeeds() ?? [])).toEqual(before);
        expect(Array.from(grid.writeSpeedBytes()?.speeds ?? [])).toEqual(before);
    });
});

describe("the slow currents of a pond a source feeds", () => {
    /**
     * A pond of 11 by 11 cells, 9 px under the level of its banks, spilling east by a channel 2 cells wide that runs
     * down. A source of `m3PerHour` pours at its middle, the water going as fast as in reality.
     */
    const pond = (m3PerHour: number, seconds: number): { grid: WaterGrid; pouredPx: number } => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 20; y++)
            for (let x = 0; x < 30; x++) {
                let height = 20;
                if (x >= 4 && x <= 14 && y >= 4 && y <= 14) height = -9;
                else if (x > 14 && y >= 9 && y <= 10) height = -(x - 14) * 0.5;
                cells.set(cellKey(x, y), height);
            }
        const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 30, height: 20 });
        const px = (((m3PerHour * 0.1) / 3600) * 1000) / CELL_LITRES_PER_PX;
        for (let step = 0; step < seconds * 10; step++)
            grid.step({ ...withWaves(), flows: [{ cellX: 7, cellY: 7, px }] });
        return { grid, pouredPx: px * seconds * 10 };
    };

    it("takes all the water of the source, and spills it down the channel once full", () => {
        // 100 m³ an hour for 20 s: the pond is not full yet, it holds all of it.
        const filling = pond(100, 20);
        expect(filling.grid.totalPx()).toBeCloseTo(filling.pouredPx, 0);
        // For 10 minutes: it is full, and its water runs out by the channel.
        const full = pond(100, 600);
        expect(full.grid.depthAt(24, 9)).toBeGreaterThan(0.25);
    });

    it("codes a slow speed to about 2 mm a second, from 3 cm a second on, and nothing the quarters tell", () => {
        // The floor: 3 cm a second, the slowest arrow of the view of the flows.
        expect(SLOWEST_TOLD_METRES).toBe(0.01);
        expect(SLOWEST_TOLD_CELLS * CELL_METRES).toBeCloseTo(0.01, 10);
        // From 1 cm a second up to just under what the quarters tell (half a quarter of a cell a second).
        for (const speed of [
            SLOWEST_TOLD_CELLS,
            0.03,
            0.055,
            0.07,
            0.1,
            0.124,
            0.1249,
            -SLOWEST_TOLD_CELLS,
            -0.06,
            -0.1249,
        ]) {
            const told = slowSpeedOf(slowSpeedByte(speed));
            expect(Math.abs(told - speed)).toBeLessThanOrEqual(1 / SLOW_SPEED_UNITS / 2 + 1e-9);
            expect(Math.sign(told)).toBe(Math.sign(speed));
        }
        // Slower than 3 cm a second: still. As fast as half a quarter of a cell a second: the speeds tell it.
        expect(slowSpeedByte(SLOWEST_TOLD_CELLS * 0.99)).toBe(0);
        expect(slowSpeedByte(-SLOWEST_TOLD_CELLS * 0.99)).toBe(0);
        // The byte never overflows: at most 31 units, well within a signed byte.
        expect(slowSpeedByte(0.1249)).toBe(31);
        expect(slowSpeedByte(-0.1249)).toBe(256 - 31);
        expect(slowSpeedByte(SLOWEST_TOLD_CELLS)).toBe(5);
        expect(slowSpeedByte(0.125)).toBe(0);
        expect(slowSpeedByte(1)).toBe(0);
        expect(slowSpeedByte(Number.NaN)).toBe(0);
        expect(slowSpeedOf(0)).toBe(0);
    });

    it("tells the slow currents apart, where the speeds in quarters of a cell say nothing", () => {
        // 100 m³ an hour at « Vitesse de l'eau » 4: the source pours 400 m³ an hour of real time.
        const { grid } = pond(400, 600);
        const told = grid.writeSpeedBytes();
        const slowBytes = told?.slow;
        expect(slowBytes).toBeDefined();
        if (!told || !slowBytes) return;
        const signed = (byte: number): number => (byte << 24) >> 24;
        const columns = Math.ceil(30 / 4);
        // The 9 blocks of the pond (columns and rows 1 to 3): still in quarters of a cell, not all still in thousandths.
        let slow = 0;
        let fast = 0;
        for (let row = 1; row <= 3; row++)
            for (let column = 1; column <= 3; column++) {
                const at = (row * columns + column) * 2;
                if (told.speeds[at] !== 0 || told.speeds[at + 1] !== 0) {
                    fast++;
                    // Where the quarters tell the speed, the slow speeds say nothing.
                    expect(slowBytes[at]).toBe(0);
                    expect(slowBytes[at + 1]).toBe(0);
                } else if (slowBytes[at] !== 0 || slowBytes[at + 1] !== 0) slow++;
                // Never more than what the quarters would have told: under half a quarter of a cell a second.
                expect(Math.abs(signed(slowBytes[at]))).toBeLessThanOrEqual(32);
            }
        // Measured: one block told in quarters, three more told slowly (one arrow, then four).
        expect(fast).toBe(1);
        expect(slow).toBeGreaterThanOrEqual(2);
        // The speeds told by writeSpeeds are the same.
        expect(grid.writeSpeeds()).toEqual(told.speeds);
    });

    it("costs a few hundred bytes zipped on a sea of 80 by 80 cells that calms down", () => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 80; y++)
            for (let x = 0; x < 80; x++) cells.set(cellKey(x, y), x >= 2 && y >= 2 && x < 78 && y < 78 ? -40 : 250);
        const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 80, height: 80 });
        const bytes = new Uint8Array(80 * 80 * 2);
        for (let y = 2; y < 78; y++)
            for (let x = 2; x < 78; x++) {
                let depth = 40;
                for (let bump = 0; bump < 4; bump++)
                    depth += 3 * Math.exp(-(((x - ((bump * 37) % 80)) ** 2 + (y - ((bump * 53) % 80)) ** 2) / 30));
                const eighths = Math.round(depth * 8);
                bytes[(y * 80 + x) * 2] = eighths & 255;
                bytes[(y * 80 + x) * 2 + 1] = eighths >> 8;
            }
        expect(grid.readDepths(bytes)).toBe(true);
        for (let step = 0; step < 50; step++) grid.step(withWaves());
        // Measured at 1 cm a second: 384 bytes five seconds after, 255 a minute after (122 and 31 at 3 cm).
        expect(gzipSync(grid.writeSpeedBytes()?.slow ?? new Uint8Array()).length).toBeLessThan(500);
        for (let step = 0; step < 550; step++) grid.step(withWaves());
        expect(gzipSync(grid.writeSpeedBytes()?.slow ?? new Uint8Array()).length).toBeLessThan(350);
    });

    it("tells nothing of a still water, not even slowly", () => {
        const { grid } = pond(0, 60);
        const told = grid.writeSpeedBytes();
        // Nothing slow to tell: no slow speeds at all, as from a server that tells none.
        expect(told?.speeds).toBeDefined();
        expect(told?.slow).toBeUndefined();
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

    it("keeps how finely the water is computed and how often it is told, as whole numbers within their bounds", async () => {
        const wam = emptyWam();
        await send(wam, {});
        expect(wam.settings?.water).not.toHaveProperty("precision");
        expect(wam.settings?.water).not.toHaveProperty("updates");
        await send(wam, { precision: 99, updates: 4.6 });
        expect(wam.settings?.water).toMatchObject({ precision: 8, updates: 5 });
        // An older client says nothing of them: they stay.
        await send(wam, {});
        expect(wam.settings?.water).toMatchObject({ precision: 8, updates: 5 });
        await send(wam, { precision: 0, updates: 0 });
        expect(wam.settings?.water).toMatchObject({ precision: 1, updates: 1 });
        // The pace of the flow: kept the same way, within a tenth of the real one and twice.
        expect(wam.settings?.water).not.toHaveProperty("flowPace");
        await send(wam, { flowPace: 0.01 });
        expect(wam.settings?.water?.flowPace).toBe(0.1);
        await send(wam, {});
        expect(wam.settings?.water?.flowPace).toBe(0.1);
        await send(wam, { flowPace: 0.5 });
        expect(wam.settings?.water?.flowPace).toBe(0.5);
    });

    it("keeps how far the blast of a meteor drives the water away, from the crater alone to four times as far", async () => {
        const wam = emptyWam();
        await send(wam, {});
        expect(wam.settings?.water).not.toHaveProperty("impactReach");
        await send(wam, { impactReach: 99 });
        expect(wam.settings?.water?.impactReach).toBe(4);
        // An older client says nothing of it: it stays.
        await send(wam, {});
        expect(wam.settings?.water?.impactReach).toBe(4);
        await send(wam, { impactReach: 0 });
        expect(wam.settings?.water?.impactReach).toBe(1);
        await send(wam, { impactReach: Number.NaN });
        expect(wam.settings?.water?.impactReach).toBe(1);
        await send(wam, { impactReach: 2.5 });
        expect(wam.settings?.water?.impactReach).toBe(2.5);
    });

    it("go to the water with inertia, the usual ones for a map that set none", () => {
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: false }, 0, [], 0.1).waves).toBeUndefined();
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS }, 0, [], 0.1).waves).toEqual(DEFAULT_WAVE_SETTINGS);
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true }, 0, [], 0.1).waves).toEqual(
            DEFAULT_WAVE_SETTINGS,
        );
        const chosen = { roughness: 3, damping: 0.1, breaking: 0, momentum: 0.5 };
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: true, waves: chosen }, 0, [], 0.1).waves).toEqual(
            chosen,
        );
    });
});
