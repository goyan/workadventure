import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
    TSUNAMI_BACKWASH_MS,
    TSUNAMI_DEFAULT_METRES,
    TSUNAMI_DEFAULT_MINUTES,
    TSUNAMI_FRONT_SECONDS,
    TSUNAMI_FULL_CELERITY,
    TSUNAMI_MAX_METRES,
    TSUNAMI_MAX_MINUTES,
    TSUNAMI_MIN_METRES,
    TSUNAMI_MIN_MINUTES,
    tsunamiMetres,
    tsunamiMinutes,
    tsunamiPhase,
    tsunamiRiseAt,
    tsunamiSea,
    tsunamiTopPx,
} from "../src/Catastrophe/Tsunami";
import type { Tsunami } from "../src/Catastrophe/Tsunami";
import { heightOfMetres } from "../src/Terrain/Scale";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { CELL_METRES, WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { DEFAULT_WATER_SETTINGS, MAX_WATER_MAX_SURFACE } from "../src/types";
import type { WAMFileFormat } from "../src/types";
import { threadWaterLoads } from "../src/Terrain/WaterLoad";
import { WATER_STEP_MS } from "../src/Terrain/WaterInputs";
import { WaterSimulation } from "../src/Terrain/WaterSimulation";

const G = 9.81;

describe("the sea a tsunami holds at the coast", () => {
    const tsunami: Tsunami = { id: 1, startedAt: 1000, metres: 8, durationMs: 180_000 };

    it("keeps what a player asks within its bounds", () => {
        expect(tsunamiMetres(undefined)).toBe(TSUNAMI_DEFAULT_METRES);
        expect(tsunamiMetres(Number.NaN)).toBe(TSUNAMI_DEFAULT_METRES);
        expect(tsunamiMetres(0.2)).toBe(TSUNAMI_MIN_METRES);
        expect(tsunamiMetres(40)).toBe(TSUNAMI_MAX_METRES);
        expect(tsunamiMetres(6.3)).toBe(6.5);
        expect(tsunamiMinutes(undefined)).toBe(TSUNAMI_DEFAULT_MINUTES);
        expect(tsunamiMinutes(0)).toBe(TSUNAMI_DEFAULT_MINUTES);
        expect(tsunamiMinutes(0.4)).toBe(TSUNAMI_MIN_MINUTES);
        expect(tsunamiMinutes(500)).toBe(TSUNAMI_MAX_MINUTES);
    });

    it("rises as its bore passes, then falls evenly to the rest level: a saw tooth", () => {
        const front = TSUNAMI_FRONT_SECONDS * 1000;
        expect(tsunamiRiseAt(tsunami, 0)).toBe(0);
        expect(tsunamiRiseAt(tsunami, 1000)).toBe(0);
        expect(tsunamiRiseAt(tsunami, 1000 + front / 2)).toBeCloseTo(4, 6);
        expect(tsunamiRiseAt(tsunami, 1000 + front)).toBeCloseTo(8, 6);
        // Halfway down the fall, half the height.
        const middle = 1000 + front + (tsunami.durationMs - front) / 2;
        expect(tsunamiRiseAt(tsunami, middle)).toBeCloseTo(4, 6);
        expect(tsunamiRiseAt(tsunami, 1000 + tsunami.durationMs)).toBe(0);
        expect(tsunamiRiseAt(undefined, 5000)).toBe(0);
    });

    it("goes through its front, its fall and its backwash, the sea at rest for that last part", () => {
        expect(tsunamiPhase(tsunami, 2000)).toBe("front");
        expect(tsunamiPhase(tsunami, 60_000)).toBe("ebb");
        expect(tsunamiPhase(tsunami, 1000 + tsunami.durationMs + 1)).toBe("backwash");
        expect(tsunamiSea(tsunami, 1000 + tsunami.durationMs + 1)?.levelPx).toBe(0);
        expect(tsunamiPhase(tsunami, 1000 + tsunami.durationMs + TSUNAMI_BACKWASH_MS)).toBe("over");
        expect(tsunamiSea(tsunami, 1000 + tsunami.durationMs + TSUNAMI_BACKWASH_MS)).toBeUndefined();
        expect(tsunamiSea(tsunami, 0)).toBeUndefined();
    });

    it("lifts the ceiling of the water to two and a half times its height, never under the usual one", () => {
        expect(tsunamiTopPx({ metres: 10 }, MAX_WATER_MAX_SURFACE)).toBe(Math.ceil(heightOfMetres(10) * 2.5));
        expect(tsunamiTopPx({ metres: 1 }, MAX_WATER_MAX_SURFACE)).toBe(MAX_WATER_MAX_SURFACE);
        expect(tsunamiTopPx(undefined, 18)).toBe(18);
    });
});

/**
 * A channel running west from the coast (the last column of the grid), walled north and south, closed at its west
 * end; its bed at `bedPx(column)`, its water at rest at the altitude 0. The coast stands at the altitude 0 of the
 * map (a sill between the sea and a lake), or, `sea`, at the bed of the channel (the sea goes on into it).
 */
function channel(length: number, bedPx: (column: number) => number, sea = false): { grid: WaterGrid; row: number } {
    const height = 5;
    const cells = new Map<string, number>();
    for (let column = 0; column < (sea ? length : length - 1); column++) {
        for (let row = 1; row < height - 1; row++) cells.set(cellKey(column, row), bedPx(column));
    }
    const grid = new WaterGrid(
        withHeights(undefined, cells),
        { x: 0, y: 0, width: length, height },
        (x, y) => y === 0 || y === height - 1 || x === 0,
    );
    const bytes = new Uint8Array(length * height * 2);
    for (let column = 1; column < length; column++) {
        for (let row = 1; row < height - 1; row++) {
            if (column === length - 1 && !sea) continue;
            const eighths = Math.round(-bedPx(column) * 8);
            const index = row * length + column;
            bytes[index * 2] = eighths & 255;
            bytes[index * 2 + 1] = eighths >> 8;
        }
    }
    grid.readDepths(bytes);
    return { grid, row: 2 };
}

/** A step of the water with inertia; `frictionless`: no friction of the ground, no damping (as Green's law has it). */
function stepOf(moves: number, frictionless = false): WaterStepInput {
    return {
        rainPx: 0,
        evaporationPx: 0,
        absorptionPx: 0,
        flows: [],
        inertia: true,
        seconds: 0.1,
        waves: frictionless
            ? { roughness: 0, damping: 0, breaking: 1, momentum: 1 }
            : { roughness: 1, damping: 0.01, breaking: 1, momentum: 1 },
        moves,
        pace: 1,
    };
}

/**
 * Sends a step of the sea of `rise` metres (reached in two seconds, then held) up the channel, and returns when the
 * water first rose by half of it at each column asked (seconds).
 */
function arrivals(grid: WaterGrid, row: number, columns: number[], rise: number, moves: number, seconds: number) {
    const risePx = heightOfMetres(rise);
    const rest = columns.map((column) => grid.depthAt(column, row));
    const reached: (number | undefined)[] = columns.map(() => undefined);
    const input = stepOf(moves);
    for (let step = 1; step <= seconds * 10; step++) {
        const t = step / 10;
        grid.setSea({ levelPx: risePx * Math.min(1, t / 2), topPx: MAX_WATER_MAX_SURFACE });
        grid.step(input);
        columns.forEach((column, at) => {
            if (reached[at] === undefined && grid.depthAt(column, row) - rest[at] > risePx / 2) reached[at] = t;
        });
    }
    return reached;
}

describe("a tsunami up a channel: what the water of the map makes of the sea at its coast", () => {
    it("runs at the square root of g times the depth (long waves), given the moves that depth asks for", () => {
        for (const depth of [1, 3, 6]) {
            const { grid, row } = channel(700, () => -heightOfMetres(depth), true);
            // A small wave (5 cm), between two points 150 cells apart, away from the coast, before the west end.
            const [near, far] = arrivals(grid, row, [650, 500], 0.05, 8, 60);
            expect(near).toBeDefined();
            expect(far).toBeDefined();
            const speed = (150 * CELL_METRES) / ((far ?? 0) - (near ?? 0));
            expect(speed / Math.sqrt(G * depth)).toBeGreaterThan(0.9);
            expect(speed / Math.sqrt(G * depth)).toBeLessThan(1.1);
        }
    });

    it("runs slower in deep water with the fewer moves of a lighter fineness: the ceiling the tsunami lifts", () => {
        const { grid, row } = channel(700, () => -heightOfMetres(6), true);
        const [near, far] = arrivals(grid, row, [650, 500], 0.05, 2, 60);
        const speed = (150 * CELL_METRES) / ((far ?? Infinity) - (near ?? 0));
        // Two moves a step bear the waves of 1.5 m of water at most: 3.8 m/s instead of 7.7.
        expect(speed / Math.sqrt(G * 6)).toBeLessThan(0.6);
    });

    it("comes as a bore at the speed of a hydraulic jump (Rankine-Hugoniot), faster than a small wave", () => {
        // From 2 m of still water to 4 m behind the bore: it runs at h₂·u₂/(h₂ − h₁), u₂ the flow behind it.
        const [still, behind] = [2, 4];
        const { grid, row } = channel(700, () => -heightOfMetres(still));
        const [near, far] = arrivals(grid, row, [600, 400], behind - still, 8, 40);
        const speed = (200 * CELL_METRES) / ((far ?? 0) - (near ?? 0));
        const flow = (behind - still) * Math.sqrt((G * (behind + still)) / (2 * behind * still));
        const bore = (behind * flow) / (behind - still);
        expect(bore).toBeCloseTo(7.67, 1);
        expect(speed / bore).toBeGreaterThan(0.85);
        expect(speed / bore).toBeLessThan(1.15);
        expect(speed).toBeGreaterThan(1.4 * Math.sqrt(G * still));
    });

    it("grows as it shoals, as Green's law says: as the depth to the power -1/4", () => {
        // From 4 m of water at the coast to 1 m 330 m inland, gently: a crest 20 s long, small (10 cm).
        const length = 800;
        const probes = [780, 199];
        const deep = 4;
        const shallow = 1;
        const bed = (column: number): number => {
            const share = Math.min(1, Math.max(0, (length - 1 - column) / (length - 200)));
            return -heightOfMetres(deep + (shallow - deep) * share);
        };
        const { grid, row } = channel(length, bed, true);
        const highest = probes.map(() => 0);
        const rest = probes.map((column) => grid.depthAt(column, row));
        const input = stepOf(8, true);
        const crestPx = heightOfMetres(0.1);
        // Until the crest has passed the shallow probe, before what the west end reflects comes back to it.
        for (let step = 1; step <= 1300; step++) {
            const t = step / 10;
            const level = t < 20 ? crestPx * Math.sin((Math.PI * t) / 20) ** 2 : 0;
            grid.setSea({ levelPx: level, topPx: MAX_WATER_MAX_SURFACE });
            grid.step(input);
            probes.forEach((column, at) => {
                highest[at] = Math.max(highest[at], grid.depthAt(column, row) - rest[at]);
            });
        }
        const depthAt = (column: number): number => -bed(column) / heightOfMetres(1);
        const green = (depthAt(probes[0]) / depthAt(probes[1])) ** 0.25;
        expect(green).toBeGreaterThan(1.3);
        expect(highest[1] / highest[0] / green).toBeGreaterThan(0.85);
        expect(highest[1] / highest[0] / green).toBeLessThan(1.15);
    });
});

describe("the coast that holds the level of the sea", () => {
    it("does not keep the water between it and a wall swinging: the swing dies down once the sea is at rest", () => {
        // A basin of 2 m of water, 44 m from the coast to a wall: the sea rises by 1 m, then goes back to rest.
        const { grid, row } = channel(80, () => -heightOfMetres(2), true);
        const tsunami: Tsunami = { id: 1, startedAt: 0, metres: 1, durationMs: 60_000 };
        const input = stepOf(8);
        const rest = grid.depthAt(2, row);
        const swing = [0, 0, 0];
        for (let step = 1; step <= 1200; step++) {
            grid.setSea(tsunamiSea(tsunami, step * 100));
            grid.step(input);
            // While the sea is at rest (its backwash): three windows of 20 s, half a period of the basin each (a
            // quarter wave between an open end and a wall: 4 L / √(g·h), 40 s).
            const window = [600, 800, 1000].findIndex((from) => step > from && step <= from + 200);
            if (window >= 0) swing[window] = Math.max(swing[window], Math.abs(grid.depthAt(2, row) - rest));
        }
        expect(swing[0]).toBeGreaterThan(heightOfMetres(0.05));
        expect(swing[1]).toBeLessThan(swing[0]);
        expect(swing[2]).toBeLessThan(0.7 * swing[0]);
    });
});

describe("a tsunami over a dry coastal plain", () => {
    /** A plain at the altitude 0, `length` cells from the coast, walled north and south and at its west end. */
    function plain(length: number): { grid: WaterGrid; row: number } {
        return channel(length, () => 0);
    }

    it("floods it as the wave of a broken dam, its front slower than without friction (Ritter)", () => {
        const { grid, row } = plain(400);
        const tsunami: Tsunami = { id: 1, startedAt: 0, metres: 4, durationMs: 120_000 };
        const input = stepOf(8);
        let reached: number | undefined;
        for (let step = 1; step <= 600 && reached === undefined; step++) {
            grid.setSea(tsunamiSea(tsunami, step * 100));
            grid.step(input);
            if (grid.depthAt(100, row) > heightOfMetres(0.1)) reached = step / 10;
        }
        expect(reached).toBeDefined();
        // 298 cells of plain from the coast to the probe; the front set out as the bore reached half its height.
        const speed = (298 * CELL_METRES) / ((reached ?? 0) - TSUNAMI_FRONT_SECONDS / 2);
        expect(speed).toBeLessThan(2 * Math.sqrt(G * 4));
        // As the fronts of 2004 seen on the videos of Banda Aceh: a few metres a second (Chanson 2006).
        expect(speed).toBeGreaterThan(3);
    });

    it("counts what crosses the coast as coming in and going out: nothing of it is lost by the edge", () => {
        const { grid } = plain(200);
        const tsunami: Tsunami = { id: 1, startedAt: 0, metres: 3, durationMs: 60_000 };
        const input = stepOf(8);
        const before = grid.totalPx();
        const sums = { in: 0, out: 0, lost: 0 };
        let backwash = 0;
        // For as long as the sea stands at the coast, its backwash included: after, the coast is an edge again.
        for (let step = 1; step * 100 < tsunami.durationMs + TSUNAMI_BACKWASH_MS; step++) {
            const now = step * 100;
            grid.setSea(tsunamiSea(tsunami, now));
            const tally = grid.step(input);
            sums.in += tally.sourcesPx;
            sums.out += tally.sinksPx;
            sums.lost += tally.lostPx;
            if (now > tsunami.durationMs) backwash += tally.sinksPx;
        }
        expect(sums.in).toBeGreaterThan(0);
        // The water left on the plain is what came in, less what went back to the sea: none lost besides.
        expect(grid.totalPx() - before).toBeCloseTo(sums.in - sums.out - sums.lost, 0);
        expect(Math.abs(sums.lost)).toBeLessThan(sums.in * 1e-3);
        // Once the sea is down, the plain runs back to it.
        expect(backwash).toBeGreaterThan(0.5 * (sums.in - sums.out + backwash));
    });

    it("keeps a bore that meets a wall instead of cutting it at the usual ceiling", () => {
        const { grid, row } = plain(120);
        const tsunami: Tsunami = { id: 1, startedAt: 0, metres: 8, durationMs: 120_000 };
        const input = stepOf(8);
        let highest = 0;
        let lost = 0;
        for (let step = 1; step <= 400; step++) {
            grid.setSea(tsunamiSea(tsunami, step * 100));
            lost += grid.step(input).lostPx;
            highest = Math.max(highest, grid.depthAt(2, row));
        }
        // Against the west wall the water stands higher than the sea, over the usual ceiling of 8.8 m.
        expect(highest).toBeGreaterThan(MAX_WATER_MAX_SURFACE);
        expect(lost).toBeLessThan(1);
    });
});

describe("the ceiling of the water under a tsunami", () => {
    it("comes back to the usual one with the water, and leaves nothing over it", () => {
        // A plain walled at 66 m from the coast: an 8 m bore piles up against the wall, over the usual 8.8 m.
        const { grid } = channel(120, () => 0);
        const tsunami: Tsunami = { id: 1, startedAt: 0, metres: 8, durationMs: 60_000 };
        const input = stepOf(8);
        let highest = 0;
        let raised = false;
        let back: number | undefined;
        for (let step = 1; step <= 3000; step++) {
            grid.setSea(tsunamiSea(tsunami, step * 100));
            grid.step(input);
            let over = 0;
            for (let column = 0; column < 120; column++) over = Math.max(over, grid.depthAt(column, 2));
            highest = Math.max(highest, over);
            if (grid.ceilingPx() > MAX_WATER_MAX_SURFACE) raised = true;
            if (raised && back === undefined && grid.ceilingPx() === MAX_WATER_MAX_SURFACE) back = step;
            // Once back, no water stands over the usual ceiling.
            if (back !== undefined) expect(over).toBeLessThanOrEqual(MAX_WATER_MAX_SURFACE);
        }
        expect(highest).toBeGreaterThan(MAX_WATER_MAX_SURFACE);
        expect(raised).toBe(true);
        expect(back).toBeDefined();
    });
});

describe("the moves a tsunami asks for, within what the thread lets the water take", () => {
    /** A lake of 4.4 m dug in a plain, at the pace of reality, its map asking for two moves a step. */
    function room(costPerMoveMs: number) {
        const heights = new Map<string, number>();
        for (let y = 5; y < 35; y++) for (let x = 10; x < 70; x++) heights.set(cellKey(x, y), -128);
        const wam: WAMFileFormat = {
            version: "2.1.0",
            mapUrl: "map.tmj",
            areas: [],
            entityCollections: [],
            entities: {},
            settings: {
                water: {
                    ...DEFAULT_WATER_SETTINGS,
                    inertia: true,
                    precision: 2,
                    updates: 1,
                    evaporation: 0,
                    absorption: 0,
                },
            },
            terrain: withHeights(undefined, heights),
        };
        threadWaterLoads.clear();
        let now = 1_000_000;
        let time = 0;
        let calls = 0;
        const stepsMs: number[] = [];
        const celerities: number[] = [];
        const held: { water?: WaterSimulation } = {};
        // A step costs 2 ms, and `costPerMoveMs` for each move it made (the clock is read at its start and its end).
        const clock = (): number => {
            calls++;
            if (calls % 2 === 0) {
                const ms = 2 + costPerMoveMs * (held.water?.getGrid()?.movesMade() ?? 0);
                stepsMs.push(ms);
                time += ms;
            }
            return time;
        };
        const water = new WaterSimulation(
            {
                getWam: () => wam,
                sendSubMessageToRoom: (message) => {
                    if (message.message?.$case !== "terrainWaterMessage") return;
                    const celerity = message.message.terrainWaterMessage.stats?.seaCelerity;
                    if (celerity !== undefined) celerities.push(celerity);
                },
            },
            { slotsFor: () => undefined },
            (bytes) => bytes,
            () => now,
            () => ({ width: 80, height: 40 }),
            clock,
            WATER_STEP_MS,
        );
        held.water = water;
        const simulation = water;
        simulation.mapChanged();
        simulation.pause();
        const grid = simulation.getGrid();
        if (!grid) throw new Error("no grid");
        const full = new Uint8Array(grid.writeDepths().length);
        for (let y = 5; y < 35; y++) for (let x = 10; x < 70; x++) full[(y * 80 + x) * 2 + 1] = 4; // 128 px
        grid.readDepths(full);
        const tsunami: Tsunami = { id: 1, startedAt: now + 5000, metres: 4, durationMs: 60_000 };
        simulation.seaUnder(() => tsunami);
        const moves: number[] = [];
        const live = (steps: number): void => {
            for (let step = 0; step < steps; step++) {
                simulation.step();
                moves.push(grid.movesMade());
                now += WATER_STEP_MS;
            }
        };
        return { live, moves, stepsMs, celerities };
    }

    it("asks for the moves the depth of the bore asks for, one more a second, when the thread affords them", () => {
        const { live, moves, celerities } = room(1);
        live(50);
        expect(Math.max(...moves.slice(0, 50))).toBeLessThanOrEqual(2);
        live(200);
        // 4 m over 4.4 m of lake: the waves of 8.4 m ask for five moves a step; they come one a second.
        expect(Math.max(...moves.slice(50, 60))).toBeLessThanOrEqual(3);
        expect(Math.max(...moves.slice(150))).toBeGreaterThanOrEqual(5);
        expect(celerities[celerities.length - 1]).toBe(1);
    });

    it("never takes more of the thread than it lets the water take before it eases, and says the speed it gives up", () => {
        // 12 ms a move: the thread of the rooms (half of 100 ms) affords three.
        const { live, moves, stepsMs, celerities } = room(12);
        live(400);
        expect(Math.max(...moves)).toBeLessThanOrEqual(3);
        expect(Math.max(...stepsMs)).toBeLessThanOrEqual(50);
        expect(celerities.length).toBeGreaterThan(0);
        expect(Math.min(...celerities)).toBeLessThan(TSUNAMI_FULL_CELERITY);
    });
});

describe("the network a tsunami takes", () => {
    it("keeps the states told under the budget of the network, fewer than one a second if it must", () => {
        // A plain of 160 x 80 cells flooded by a 4 m sea, its states zipped as on the server, a budget of 6 kB a second.
        const wam: WAMFileFormat = {
            version: "2.1.0",
            mapUrl: "map.tmj",
            areas: [],
            entityCollections: [],
            entities: {},
            settings: { water: { ...DEFAULT_WATER_SETTINGS, inertia: true, precision: 4, updates: 1 } },
            // Two pits at opposite corners: the grid covers the whole map.
            terrain: withHeights(
                undefined,
                new Map([
                    [cellKey(0, 0), -16],
                    [cellKey(159, 79), -16],
                ]),
            ),
        };
        threadWaterLoads.clear();
        let now = 1_000_000;
        const told: { at: number; bytes: number }[] = [];
        const budget = 6000;
        const simulation = new WaterSimulation(
            {
                getWam: () => wam,
                sendSubMessageToRoom: (message) => {
                    if (message.message?.$case !== "terrainWaterMessage") return;
                    const state = message.message.terrainWaterMessage;
                    const bytes = state.depths.length + (state.speeds?.length ?? 0) + (state.slowSpeeds?.length ?? 0);
                    told.push({ at: now, bytes });
                },
            },
            { slotsFor: () => undefined },
            (bytes) => gzipSync(bytes),
            () => now,
            () => ({ width: 160, height: 80 }),
            () => 0,
            WATER_STEP_MS,
            budget,
        );
        simulation.mapChanged();
        simulation.pause();
        const grid = simulation.getGrid();
        if (!grid) throw new Error("no grid");
        expect(grid.bounds.width).toBeGreaterThan(40);
        const tsunami: Tsunami = { id: 1, startedAt: now, metres: 4, durationMs: 120_000 };
        simulation.seaUnder(() => tsunami);
        for (let step = 0; step < 900; step++) {
            simulation.step();
            now += WATER_STEP_MS;
        }
        // From the tenth second on (the mean size of a state is known), over the minute that follows.
        const from = 1_000_000 + 10_000;
        const to = from + 60_000;
        const window = told.filter((state) => state.at >= from && state.at < to);
        const sent = window.reduce((sum, state) => sum + state.bytes, 0);
        // The states are bigger than the budget: one a second would not hold it.
        expect(Math.max(...window.map((state) => state.bytes))).toBeGreaterThan(budget);
        expect(sent / 60).toBeLessThanOrEqual(budget * 1.2);
        expect(window.length).toBeGreaterThan(5);
    });
});
