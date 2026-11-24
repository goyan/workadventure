import { describe, expect, it } from "vitest";
import {
    TSUNAMI_BACKWASH_MS,
    TSUNAMI_DEFAULT_METRES,
    TSUNAMI_DEFAULT_MINUTES,
    TSUNAMI_FRONT_SECONDS,
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
import { MAX_WATER_MAX_SURFACE } from "../src/types";

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
