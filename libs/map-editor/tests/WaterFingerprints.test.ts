import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cellKey, withHeights, withSoils } from "../src/Terrain/TerrainGrid";
import { ordinaryWaterArrays, setWaterArrays, sharedWaterArrays } from "../src/Terrain/WaterArrays";
import { setWaterPassRunner } from "../src/Terrain/WaterBands";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput, WaterTally, WaterWallSides } from "../src/Terrain/WaterGrid";
import { DEFAULT_WAVE_SETTINGS, TERRAIN_CELL } from "../src/types";
import type { TerrainData } from "../src/types";
import { bandsOnOneThread } from "./helpers/BandsOnOneThread";

/**
 * The water of a whole map, fingerprinted: each scenario below ends on a fingerprint of everything the grid holds
 * and tells (depths, flows, speeds, tallies, bytes sent). A change that is meant to leave the water as it is, to
 * the bit (a faster loop), keeps them all; one that changes the physics on purpose records them again:
 * `RECORD_WATER_FINGERPRINTS=1 npx vitest run tests/WaterFingerprints.test.ts`.
 *
 * Those of the water alone (WATER_ALONE) were recorded with the code as it was at the commit eb17d9b92 of the
 * fork. So were the whole ones, but for the eight scenarios that lose water: the water lost at a step is now
 * summed row by row (depthsPass), so that several threads may share the rows, which changed that figure in its
 * last places (by 3 parts in a hundred million million at most) and nothing else.
 */

const WIDTH = 150;
const HEIGHT = 110;
const BOUNDS = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
const LAKE = { x: 10, y: 10, width: 40, height: 30 };
const HILL = { x: 85, y: 20, radius: 15, height: 40 };
const POND = { x: 120, y: 80, side: 16, depth: 12 };
const HOUSE = { x: 60, y: 60, side: 16 };
const POOL = { x: 90, y: 70, width: 8, height: 6, depth: 10 };
const PIT = { x: 20, y: 70, side: 20, depth: 250 };

/** The relief of the test map: a lake with sloping shores, a hill with a crater, a pond far away, a pool, a pit. */
function relief(trench = false): TerrainData {
    const heights = new Map<string, number>();
    for (let y = LAKE.y; y < LAKE.y + LAKE.height; y++) {
        for (let x = LAKE.x; x < LAKE.x + LAKE.width; x++) {
            const edge = Math.min(x - LAKE.x, y - LAKE.y, LAKE.x + LAKE.width - 1 - x, LAKE.y + LAKE.height - 1 - y);
            heights.set(cellKey(x, y), -Math.min(60, 6 * (edge + 1)));
        }
    }
    for (let y = HILL.y - HILL.radius; y <= HILL.y + HILL.radius; y++) {
        for (let x = HILL.x - HILL.radius; x <= HILL.x + HILL.radius; x++) {
            const away = Math.max(Math.abs(x - HILL.x), Math.abs(y - HILL.y));
            // A crater of three cells at its top.
            heights.set(
                cellKey(x, y),
                away <= 1 ? HILL.height - 8 : Math.round(HILL.height * (1 - away / HILL.radius)),
            );
        }
    }
    for (let y = POND.y; y < POND.y + POND.side; y++) {
        for (let x = POND.x; x < POND.x + POND.side; x++) heights.set(cellKey(x, y), -POND.depth);
    }
    for (let y = POOL.y; y < POOL.y + POOL.height; y++) {
        for (let x = POOL.x; x < POOL.x + POOL.width; x++) heights.set(cellKey(x, y), -POOL.depth);
    }
    for (let y = PIT.y; y < PIT.y + PIT.side; y++) {
        for (let x = PIT.x; x < PIT.x + PIT.side; x++) heights.set(cellKey(x, y), -PIT.depth);
    }
    // An edit of the map: a trench from the lake towards the house.
    if (trench) for (let x = LAKE.x + LAKE.width; x < HOUSE.x; x++) heights.set(cellKey(x, 30), -20);
    const soils = new Map<string, number>();
    for (let y = 0; y < 50; y++) for (let x = 50; x < 70; x++) soils.set(cellKey(x, y), 4);
    for (let y = 50; y < HEIGHT; y++) for (let x = 100; x < WIDTH; x++) soils.set(cellKey(x, y), 5);
    return withSoils(withHeights(undefined, heights), soils);
}

/** The walls of the house, and its door (two cells of its east wall) apart. */
function houseSides(): { walls: WaterWallSides; door: WaterWallSides; rooms: WaterWallSides } {
    const east = new Set<string>();
    const south = new Set<string>();
    const door = new Set<string>();
    const last = HOUSE.side - 1;
    for (let at = 0; at < HOUSE.side; at++) {
        south.add(cellKey(HOUSE.x + at, HOUSE.y - 1));
        south.add(cellKey(HOUSE.x + at, HOUSE.y + last));
        east.add(cellKey(HOUSE.x - 1, HOUSE.y + at));
        if (at === 7 || at === 8) door.add(cellKey(HOUSE.x + last, HOUSE.y + at));
        else east.add(cellKey(HOUSE.x + last, HOUSE.y + at));
    }
    const closed = { east: new Set([...east, ...door]), south };
    return { walls: { east, south }, door: { east: door, south: new Set() }, rooms: closed };
}

const blocked = (cellX: number, cellY: number): boolean => cellX >= 70 && cellX < 73 && cellY >= 90 && cellY < 93;

function newGrid(trench = false): WaterGrid {
    const { walls, door, rooms } = houseSides();
    const grid = new WaterGrid(relief(trench), BOUNDS, blocked, walls, rooms);
    grid.setClosedDoors(door);
    const pool: { cellX: number; cellY: number }[] = [];
    for (let y = POOL.y; y < POOL.y + POOL.height; y++) {
        for (let x = POOL.x; x < POOL.x + POOL.width; x++) pool.push({ cellX: x, cellY: y });
    }
    grid.seal(pool);
    return grid;
}

/** Fills the hollows of a grid up to `level` (an altitude), where `where` says so. */
function fill(grid: WaterGrid, level: number, where: (x: number, y: number) => boolean = () => true): void {
    const bytes = new Uint8Array(WIDTH * HEIGHT * 2);
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const ground = groundAt(x, y);
            const eighths = where(x, y) && ground < level ? Math.round((level - ground) * 8) : 0;
            bytes[(y * WIDTH + x) * 2] = eighths & 255;
            bytes[(y * WIDTH + x) * 2 + 1] = eighths >> 8;
        }
    }
    expect(grid.readDepths(bytes)).toBe(true);
}

const GROUND = (() => {
    const terrain = relief();
    const probe = new WaterGrid(terrain, BOUNDS);
    return Reflect.get(probe, "ground") as Float32Array;
})();
const groundAt = (x: number, y: number): number => GROUND[y * WIDTH + x];
const inLake = (x: number, y: number): boolean =>
    x >= LAKE.x && x < LAKE.x + LAKE.width && y >= LAKE.y && y < LAKE.y + LAKE.height;
const inPit = (x: number, y: number): boolean =>
    x >= PIT.x && x < PIT.x + PIT.side && y >= PIT.y && y < PIT.y + PIT.side;

const creep: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
const inertia: WaterStepInput = {
    ...creep,
    inertia: true,
    seconds: 0.1,
    waves: { ...DEFAULT_WAVE_SETTINGS },
    moves: 3,
    pace: 1,
};

/** One run of a scenario on one grid: the grid may be replaced (an edit of the map, a restart). */
interface Run {
    grid: WaterGrid;
    /** Figures the scenario got back from the grid: they are part of what is compared. */
    notes: number[];
}
interface Scenario {
    name: string;
    steps: number;
    /** The fingerprint of everything the grid holds and tells along the run. */
    fingerprint: string;
    setup?: (run: Run) => void;
    /** What happens at a step, and what the step is given (undefined: the grid is not stepped, as when at rest). */
    each: (run: Run, step: number) => WaterStepInput | undefined;
}

const LAKE_CENTRE = { cellX: LAKE.x + 20, cellY: LAKE.y + 15 };
const HILL_TOP = { cellX: HILL.x, cellY: HILL.y };
const POND_CENTRE = { cellX: POND.x + 8, cellY: POND.y + 8 };

const SCENARIOS: Scenario[] = [
    {
        name: "a dry grid",
        steps: 40,
        fingerprint: "557f65b5196929e7",
        each: () => inertia,
    },
    {
        name: "a lake at rest",
        steps: 200,
        fingerprint: "ea2e42156aadcdaf",
        setup: (run) => fill(run.grid, -6, inLake),
        each: () => inertia,
    },
    {
        name: "a lake at rest and a source far from it",
        steps: 400,
        fingerprint: "c0721dd72f521c1b",
        setup: (run) => fill(run.grid, -6, inLake),
        each: () => ({ ...inertia, flows: [{ ...POND_CENTRE, px: 0.6, radius: 2 }] }),
    },
    {
        name: "a source on a hill from a dry start, a sink and a sink that holds a level in the lake",
        steps: 400,
        fingerprint: "0c3b986f42a7c539",
        each: () => ({
            ...inertia,
            absorptionPx: 0.0005,
            flows: [
                { ...HILL_TOP, px: 4 },
                { ...LAKE_CENTRE, px: -1.5, radius: 3 },
                { cellX: LAKE.x + 8, cellY: LAKE.y + 8, px: -1, radius: 2, level: -30 },
                { cellX: 140, cellY: 20, px: 0.8, radius: 1, level: 6 },
            ],
        }),
    },
    {
        name: "rain on the whole map, then dry weather",
        steps: 400,
        fingerprint: "b7cc0e642bfc4e36",
        each: (_run, step) =>
            step < 150
                ? { ...inertia, rainPx: 0.03, sealedRainPx: 0.003, absorptionPx: 0.0005, indoorDrainPx: 0.02 }
                : { ...inertia, evaporationPx: 0.004, absorptionPx: 0.0005, indoorDrainPx: 0.02 },
    },
    {
        name: "a downpour on the whole map, then everything runs",
        steps: 300,
        fingerprint: "0b3f6db52ddf7b9d",
        each: (run, step) => {
            if (step === 0) run.notes.push(run.grid.rainOn(0, 0, undefined, 20));
            if (step === 100) run.notes.push(run.grid.rainOn(0, 0, undefined, 5));
            return { ...inertia, absorptionPx: 0.001, indoorDrainPx: 0.05 };
        },
    },
    {
        name: "a rough sea: three impacts in the lake",
        steps: 300,
        fingerprint: "8da4e552f631d00e",
        setup: (run) => fill(run.grid, -6, inLake),
        each: (run, step) => {
            const strike = (cellX: number, cellY: number, radius: number): void => {
                const taken = run.grid.takeDisc(cellX, cellY, radius);
                run.notes.push(taken?.takenPx ?? -1, taken?.cells ?? -1);
                const ring = run.grid.takeRing(cellX, cellY, radius, radius * 2, (away) => 1 - away / (radius * 2));
                run.notes.push(ring ?? -1);
                const thrown = (taken?.takenPx ?? 0) + (ring ?? 0);
                run.notes.push(run.grid.layRing(cellX, cellY, radius * 2, radius * 3, thrown, 30, 20, true));
            };
            if (step === 5) strike(LAKE_CENTRE.cellX, LAKE_CENTRE.cellY, 5);
            if (step === 60) strike(LAKE.x + 6, LAKE.y + 20, 3);
            if (step === 61) strike(LAKE.x + 34, LAKE.y + 6, 4);
            return inertia;
        },
    },
    {
        name: "a ball dragged through the lake, then taken away",
        steps: 300,
        fingerprint: "83f74706dbe97318",
        setup: (run) => fill(run.grid, -6, inLake),
        each: (run, step) => {
            if (step < 240) {
                const x = (LAKE_CENTRE.cellX + 9 * Math.cos(step / 15)) * TERRAIN_CELL;
                const y = (LAKE_CENTRE.cellY + 7 * Math.sin(step / 15)) * TERRAIN_CELL;
                const level = run.grid.restLevelAt(Math.floor(x / TERRAIN_CELL), Math.floor(y / TERRAIN_CELL), 4);
                run.notes.push(level ?? -1);
                run.notes.push(run.grid.setBalls([{ x, y, radiusPx: 40, levelPx: level ?? 0 }]) ? 1 : 0);
            } else run.notes.push(run.grid.setBalls([]) ? 1 : 0);
            return inertia;
        },
    },
    {
        name: "a house that floods: its door closed, open, closed again",
        steps: 300,
        fingerprint: "603d4177414931b5",
        each: (run, step) => {
            if (step === 100) run.grid.setClosedDoors(undefined);
            if (step === 200) run.grid.setClosedDoors(houseSides().door);
            return {
                ...inertia,
                indoorDrainPx: 0.002,
                flows: [{ cellX: HOUSE.x + 5, cellY: HOUSE.y + 5, px: 6, radius: 2 }],
            };
        },
    },
    {
        name: "a pool its pump fills, under the rain, and its overflow",
        steps: 250,
        fingerprint: "e757910d712b9d2f",
        each: (run, step) => {
            let laid = 0;
            let taken = 0;
            for (let y = POOL.y; y < POOL.y + POOL.height; y++) {
                for (let x = POOL.x; x < POOL.x + POOL.width; x++) {
                    const missing = POOL.depth - 1 - run.grid.depthAt(x, y);
                    if (missing > 0) laid += run.grid.rainOn(x, y, 0, Math.min(missing, 0.2));
                    else if (missing < -0.05) taken += run.grid.drainDisc(x, y, 0, -missing, -missing);
                }
            }
            run.notes.push(laid, taken);
            // At rest and nothing pumped: the grid is not stepped.
            if (step >= 200 && laid <= 0 && taken <= 0) return undefined;
            return step >= 80 && step < 200 ? { ...inertia, rainPx: 0.3, sealedRainPx: 0.05 } : inertia;
        },
    },
    {
        name: "a drain that takes the lake down and a downpour on the hill",
        steps: 300,
        fingerprint: "fa581073b3fe575f",
        setup: (run) => fill(run.grid, -6, inLake),
        each: (run, step) => {
            if (step < 100) run.notes.push(run.grid.drainDisc(LAKE_CENTRE.cellX, LAKE_CENTRE.cellY, 6, 3, 0.5));
            if (step >= 50 && step < 150) run.notes.push(run.grid.rainOn(HILL.x - 4.5, HILL.y + 3, 10, 0.5));
            return inertia;
        },
    },
    {
        name: "an edit of the relief: the water is taken to a new grid",
        steps: 300,
        fingerprint: "5d5c5cbb2475ce67",
        setup: (run) => fill(run.grid, -3, inLake),
        each: (run, step) => {
            if (step === 150) {
                const edited = newGrid(true);
                edited.takeFrom(run.grid);
                run.grid = edited;
            }
            return { ...inertia, flows: [{ ...LAKE_CENTRE, px: 20, radius: 4 }] };
        },
    },
    {
        name: "the time a room missed lived again without inertia, then inertia again",
        steps: 330,
        fingerprint: "42e54240528e1cf8",
        each: (_run, step) => {
            const flows = [{ ...HILL_TOP, px: 2 }];
            if (step >= 100 && step < 130) {
                return { ...creep, rainPx: 1.5, evaporationPx: 0, absorptionPx: 0.2, seconds: 600, flows };
            }
            return { ...inertia, flows };
        },
    },
    {
        name: "a map that goes faster than reality: sinks that ask for more than they find",
        steps: 300,
        fingerprint: "f0041b166a257e56",
        setup: (run) => fill(run.grid, -6, inLake),
        each: () => ({
            ...inertia,
            flowSteps: 4,
            flows: [
                { ...LAKE_CENTRE, px: -400, radius: 3 },
                { ...HILL_TOP, px: 30, radius: 1 },
                { ...POND_CENTRE, px: -5 },
            ],
        }),
    },
    {
        name: "a deep pit: one move a step, eight, then a flow four times as fast",
        steps: 300,
        fingerprint: "a9f9d499f82a9253",
        setup: (run) => {
            fill(run.grid, -20, (x, y) => inPit(x, y) && x < PIT.x + 12);
        },
        each: (_run, step) =>
            step < 100 ? { ...inertia, moves: 1 } : step < 200 ? { ...inertia, moves: 8 } : { ...inertia, pace: 4 },
    },
    {
        name: "a water that dries out wholly, then comes back there and elsewhere",
        steps: 320,
        fingerprint: "9108a7196a8e7f6d",
        each: (run, step) => {
            if (step === 0) run.notes.push(run.grid.rainOn(60, 45, 6, 3));
            if (step === 200) run.notes.push(run.grid.rainOn(64, 47, 5, 4));
            if (step === 230) run.notes.push(run.grid.rainOn(130, 30, 4, 4));
            if (step < 40) return inertia;
            if (step < 200) return { ...inertia, evaporationPx: 0.4 };
            return inertia;
        },
    },
    {
        name: "a puddle taken away while it spreads, a pond that stays, then water again where the puddle was",
        steps: 260,
        fingerprint: "3b09d52585108acf",
        each: (run, step) => {
            if (step === 0) run.notes.push(run.grid.rainOn(POND_CENTRE.cellX, POND_CENTRE.cellY, 6, 8));
            if (step === 0 || step === 120) run.notes.push(run.grid.rainOn(60, 45, 6, 6));
            if (step === 30 || step === 150) run.notes.push(run.grid.takeDisc(60, 45, 30)?.takenPx ?? -1);
            if (step === 60) run.notes.push(run.grid.rainOn(66, 49, 5, 5));
            if (step === 200) run.notes.push(run.grid.rainOn(52, 40, 3, 9));
            return step >= 120 && step < 200 ? { ...inertia, moves: 1 } : inertia;
        },
    },
    {
        name: "a restart: the water saved and read back, then a lower ceiling for the floods",
        steps: 300,
        fingerprint: "5c6b01ea390aba0a",
        setup: (run) => fill(run.grid, 4, (x, y) => x < 75),
        each: (run, step) => {
            if (step === 150) {
                const restarted = newGrid();
                expect(restarted.readDepths(run.grid.writeDepths(true))).toBe(true);
                run.grid = restarted;
            }
            if (step === 0) run.grid.setMaxSurface(256);
            if (step === 220) run.grid.setMaxSurface(18);
            return { ...inertia, flows: [{ cellX: 30, cellY: 50, px: 50, radius: 3 }] };
        },
    },
    {
        name: "a source at the edge of the grid: its water falls off the map",
        steps: 250,
        fingerprint: "1353ef1ec71a3172",
        each: () => ({
            ...inertia,
            flows: [
                { cellX: 2, cellY: 100, px: 5, radius: 1 },
                { cellX: 147, cellY: 55, px: 5 },
                { cellX: 75, cellY: 1, px: 3 },
                { cellX: 400, cellY: 400, px: 3 },
            ],
        }),
    },
];

const STATE_ARRAYS = ["depth", "flowEast", "flowSouth", "speedEast", "speedSouth", "under", "ground", "spill"] as const;

function arrayOf(grid: WaterGrid, name: (typeof STATE_ARRAYS)[number]): Uint8Array {
    const array = Reflect.get(grid, name) as Float32Array;
    return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/** A fingerprint that takes bytes in, one after the other (FNV-1a, 32 bits, twice with two seeds). */
class Fingerprint {
    private low = 0x811c9dc5;
    private high = 0x01234567;
    public bytes(bytes: Uint8Array | undefined): void {
        if (!bytes) return;
        let low = this.low;
        let high = this.high;
        for (let at = 0; at < bytes.length; at++) {
            low = Math.imul(low ^ bytes[at], 0x01000193);
            high = Math.imul(high ^ bytes[at], 0x01000193) + at;
        }
        this.low = low;
        this.high = high | 0;
    }
    public numbers(values: readonly number[]): void {
        this.bytes(new Uint8Array(Float64Array.from(values).buffer));
    }
    public text(): string {
        return ((this.low >>> 0).toString(16) + (this.high >>> 0).toString(16)).padStart(16, "0");
    }
}

const tallyFigures = (tally: WaterTally): number[] => [
    tally.rainPx,
    tally.sourcesPx,
    tally.sinksPx,
    tally.evaporationPx,
    tally.absorptionPx,
    tally.lostPx,
    tally.moved ? 1 : 0,
];

/** Everything a grid holds and tells, into a fingerprint. */
function take(print: Fingerprint, grid: WaterGrid): void {
    for (const name of STATE_ARRAYS) print.bytes(arrayOf(grid, name));
    print.bytes(grid.writeDepths());
    print.bytes(grid.writeDepths(true));
    const told = grid.writeSpeedBytes(1.05);
    print.bytes(told?.speeds);
    print.bytes(told?.slow);
    print.numbers([grid.totalPx(), grid.wetCells()]);
}

/**
 * Runs a scenario and returns its two fingerprints: `whole`, of everything the grid holds and tells, and `water`,
 * the same without the water lost at each step (WaterTally.lostPx), a figure for the dashboard that no water
 * depends on.
 */
function play(scenario: Scenario): { whole: string; water: string } {
    const run: Run = { grid: newGrid(), notes: [] };
    const whole = new Fingerprint();
    const water = new Fingerprint();
    scenario.setup?.(run);
    for (let step = 0; step < scenario.steps; step++) {
        const input = scenario.each(run, step);
        const tally = input ? run.grid.step(input) : undefined;
        whole.numbers(tally ? tallyFigures(tally) : [-1]);
        water.numbers(tally ? tallyFigures({ ...tally, lostPx: 0 }) : [-1]);
        if (step % 20 === 19 || step === scenario.steps - 1) {
            take(whole, run.grid);
            take(water, run.grid);
        }
    }
    whole.numbers(run.notes);
    water.numbers(run.notes);
    return { whole: whole.text(), water: water.text() };
}

/**
 * The fingerprint of the water alone of each scenario (without the water lost at each step), recorded with the
 * code of the commit eb17d9b92.
 */
const WATER_ALONE: Record<string, string> = {
    "a dry grid": "557f65b5196929e7",
    "a lake at rest": "ea2e42156aadcdaf",
    "a lake at rest and a source far from it": "853445d7710326db",
    "a source on a hill from a dry start, a sink and a sink that holds a level in the lake": "08f0168b081112b6",
    "rain on the whole map, then dry weather": "b7cc0e642bfc4e36",
    "a downpour on the whole map, then everything runs": "f59e70d1bfd64661",
    "a rough sea: three impacts in the lake": "ef3eaa2c8cf0edca",
    "a ball dragged through the lake, then taken away": "d379bda2a5c6e5dc",
    "a house that floods: its door closed, open, closed again": "f63e124fb663b8b5",
    "a pool its pump fills, under the rain, and its overflow": "e757910d712b9d2f",
    "a drain that takes the lake down and a downpour on the hill": "df3b5ebe14777b76",
    "an edit of the relief: the water is taken to a new grid": "c2c0148b2e3c0c57",
    "the time a room missed lived again without inertia, then inertia again": "13bd2db1daadae1d",
    "a map that goes faster than reality: sinks that ask for more than they find": "4fdad9dab3498266",
    "a deep pit: one move a step, eight, then a flow four times as fast": "a9f9d499f82a9253",
    "a water that dries out wholly, then comes back there and elsewhere": "9108a7196a8e7f6d",
    "a puddle taken away while it spreads, a pond that stays, then water again where the puddle was":
        "3b09d52585108acf",
    "a restart: the water saved and read back, then a lower ceiling for the floods": "aa9bc747a7218d61",
    "a source at the edge of the grid: its water falls off the map": "78cf2454bed3730a",
};

/** A scenario takes a second or two alone; more when the whole suite runs at once on a busy machine. */
const SCENARIO_TIMEOUT_MS = 60_000;

describe("WaterGrid, the same water to the bit", () => {
    // RECORD_WATER_FINGERPRINTS=1 prints the fingerprints instead of checking them.
    const record = process.env.RECORD_WATER_FINGERPRINTS === "1";

    for (const scenario of SCENARIOS) {
        it(
            `ends on the fingerprint of the water as it was: ${scenario.name}`,
            () => {
                const { whole, water } = play(scenario);
                if (record) {
                    process.stdout.write(`FINGERPRINT\t${scenario.name}\t${whole}\t${water}\n`);
                    return;
                }
                expect(water).toBe(WATER_ALONE[scenario.name]);
                expect(whole).toBe(scenario.fingerprint);
            },
            SCENARIO_TIMEOUT_MS,
        );
    }
});

describe("WaterGrid, the same water to the bit with its arrays in a memory threads share", () => {
    beforeAll(() => setWaterArrays(sharedWaterArrays));
    afterAll(() => setWaterArrays(ordinaryWaterArrays));

    for (const scenario of SCENARIOS) {
        it(
            `ends on the fingerprint of the water as it was: ${scenario.name}`,
            () => {
                const { whole, water } = play(scenario);
                expect(water).toBe(WATER_ALONE[scenario.name]);
                expect(whole).toBe(scenario.fingerprint);
            },
            SCENARIO_TIMEOUT_MS,
        );
    }

    it("asks what makes the place of its arrays once, with its cells and its rows", () => {
        const asked: [number, number][] = [];
        setWaterArrays((cells, rows) => {
            asked.push([cells, rows]);
            return sharedWaterArrays;
        });
        const grid = newGrid();
        fill(grid, 4);
        grid.step(inertia);
        setWaterArrays(sharedWaterArrays);
        expect(asked).toEqual([[WIDTH * HEIGHT, HEIGHT]]);
        expect((Reflect.get(grid, "flowEast") as Float32Array).buffer).toBeInstanceOf(SharedArrayBuffer);
    });

    it("keeps the arrays of its moves there, and nowhere else unless told", () => {
        const shared = newGrid();
        setWaterArrays(ordinaryWaterArrays);
        const ordinary = newGrid();
        setWaterArrays(sharedWaterArrays);
        for (const grid of [shared, ordinary]) {
            fill(grid, 4);
            grid.step(inertia);
        }
        const names = ["depth", "ground", "spill", "rough", "hollow", "closed", "flowEast", "flowSouth", "afford"];
        const names2 = ["speedEast", "speedSouth", "nextSpeedEast", "nextSpeedSouth", "next", "rowLost"];
        for (const name of [...names, ...names2]) {
            const where = (grid: WaterGrid): unknown => (Reflect.get(grid, name) as Float32Array).buffer;
            expect(where(shared), name).toBeInstanceOf(SharedArrayBuffer);
            expect(where(ordinary), name).toBeInstanceOf(ArrayBuffer);
        }
    });
});

describe("WaterGrid, the same water to the bit with its passes shared in slices of rows (WaterBands)", () => {
    const bands = bandsOnOneThread(3, 20261123);
    beforeAll(() => {
        setWaterArrays(sharedWaterArrays);
        setWaterPassRunner(bands);
    });
    afterAll(() => {
        setWaterArrays(ordinaryWaterArrays);
        setWaterPassRunner(undefined);
    });

    for (const scenario of SCENARIOS) {
        it(
            `ends on the fingerprint of the water as it was: ${scenario.name}`,
            () => {
                const { whole, water } = play(scenario);
                expect(water).toBe(WATER_ALONE[scenario.name]);
                expect(whole).toBe(scenario.fingerprint);
            },
            SCENARIO_TIMEOUT_MS,
        );
    }

    it("shared the passes indeed: slices computed by who leads and by the others, for each grid", () => {
        const { here, others } = bands.slices();
        expect(here).toBeGreaterThan(1000);
        expect(others).toBeGreaterThan(1000);
        // Each grid was told to who follows, and forgotten when its arrays changed.
        expect(bands.told.filter((news) => news.arrays).length).toBeGreaterThan(SCENARIOS.length / 2);
    });
});
