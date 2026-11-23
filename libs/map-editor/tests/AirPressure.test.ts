import { describe, expect, it } from "vitest";
import {
    lowShare,
    lowShareFast,
    MOST_DRAG,
    pressureHeads,
    seaDrag,
    waterHeightOfPressure,
    windPush,
    windStress,
} from "../src/Terrain/AirPressure";
import type { AirPressure } from "../src/Terrain/AirPressure";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { WasmWaterKernel } from "../src/Terrain/WaterKernelWasm";
import {
    HURRICANE_HOLLAND_B,
    HURRICANE_RMAX_PX,
    hurricaneMaxWind,
    hurricaneHere,
    hurricanePressure,
    hurricanePressureDrop,
    hurricaneWind,
    hurricaneAt,
} from "../src/Catastrophe/Hurricane";
import type { Hurricane } from "../src/Catastrophe/Hurricane";
import { TERRAIN_CELL, TILE_PX } from "../src/types";
import { TILE_AREA_M2 } from "../src/Terrain/Scale";

const PX_PER_METRE = TILE_PX / Math.sqrt(TILE_AREA_M2);
const inertia: WaterStepInput = {
    rainPx: 0,
    evaporationPx: 0,
    absorptionPx: 0,
    flows: [],
    inertia: true,
    seconds: 0.1,
};

/** A closed basin dug `depth` pixels deep, `length` cells by `width`, its corner at the cell 2,2, full to the brim. */
function basin(length: number, width: number, depth: number, kernel?: WasmWaterKernel): WaterGrid {
    const cells = new Map<string, number>();
    for (let y = 2; y < 2 + width; y++) for (let x = 2; x < 2 + length; x++) cells.set(cellKey(x, y), -depth);
    const grid = new WaterGrid(
        withHeights(undefined, cells),
        { x: 0, y: 0, width: length + 4, height: width + 4 },
        undefined,
        undefined,
        undefined,
        kernel,
    );
    const { width: columns, height: rows } = grid.bounds;
    const bytes = new Uint8Array(columns * rows * 2);
    for (let y = 2; y < 2 + width; y++) {
        for (let x = 2; x < 2 + length; x++) {
            const eighths = Math.round(depth * 0.75 * 8);
            bytes[(y * columns + x) * 2] = eighths & 255;
            bytes[(y * columns + x) * 2 + 1] = eighths >> 8;
        }
    }
    expect(grid.readDepths(bytes)).toBe(true);
    return grid;
}

/** The surface of the water along the middle row of a basin, cell by cell. */
function surfaces(grid: WaterGrid, length: number, row: number): number[] {
    return Array.from({ length }, (_, at) => grid.depthAt(2 + at, row));
}

/** Where the water stands over its lowest along a line, on the mean (cells from the start of the line). */
function centreOf(line: number[]): number {
    const lowest = Math.min(...line);
    let weight = 0;
    let sum = 0;
    line.forEach((surface, at) => {
        weight += surface - lowest;
        sum += (surface - lowest) * at;
    });
    return sum / weight;
}

/** A low of the size of the one of the hurricanes, its centre at the cell (cellX, cellY), `dropPx` deep. */
function low(cellX: number, cellY: number, dropPx: number): AirPressure {
    return {
        x: (cellX + 0.5) * TERRAIN_CELL,
        y: (cellY + 0.5) * TERRAIN_CELL,
        dropPx,
        radiusPx: HURRICANE_RMAX_PX,
        b: HURRICANE_HOLLAND_B,
    };
}

describe("the pressure of the air as a height of water (the inverted barometer)", () => {
    it("holds up about a centimetre of water for each hPa of a low", () => {
        expect(waterHeightOfPressure(100) * 100).toBeCloseTo(1.02, 2);
    });

    it("follows the profile of Holland: the whole drop at the centre, nothing far away, read fast within 1e-4", () => {
        expect(lowShare(0, 1.5)).toBe(1);
        expect(lowShare(1, 1.5)).toBeCloseTo(1 - Math.exp(-1), 12);
        expect(lowShare(1000, 1.5)).toBeLessThan(1e-4);
        for (let distance = 0; distance < 80; distance += 0.037) {
            expect(Math.abs(lowShareFast(distance, 1.5) - lowShare(distance, 1.5)), `${distance}`).toBeLessThan(1e-4);
        }
    });

    it("of a hurricane: a drop of its centre by its strongest wind (Holland), as the pressures of the categories", () => {
        // Δp = ρ_air e V² / B: 26, 74 and 100 hPa for the categories 1, 4 and 5, within the central pressures of the
        // Saffir-Simpson scale (980 hPa and over, 920 to 944, under 920) under 1010 hPa far from it.
        const hpa = (category: number): number => hurricanePressureDrop(category) / 100;
        expect(hpa(1)).toBeGreaterThan(20);
        expect(hpa(1)).toBeLessThan(30);
        expect(hpa(4)).toBeGreaterThan(66);
        expect(hpa(4)).toBeLessThan(90);
        expect(hpa(5)).toBeGreaterThan(90);
        for (let category = 1; category < 5; category++) expect(hpa(category + 1)).toBeGreaterThan(hpa(category));
        expect(hurricaneMaxWind(5)).toBeGreaterThan(hurricaneMaxWind(4));
    });

    it("of a hurricane on the map: under its eye, as deep as its drop, fading in and out with the storm", () => {
        const hurricane: Hurricane = {
            id: 1,
            category: 4,
            durationMs: 300_000,
            heading: 90,
            southern: false,
            startedAt: 1_000_000,
            fromX: 0,
            fromY: 500,
            toX: 6000,
            toY: 500,
            anchorX: 3000,
            anchorY: 500,
        };
        expect(hurricanePressure(hurricane, 999_000)).toBeUndefined();
        const middle = hurricanePressure(hurricane, 1_150_000);
        expect(middle?.x).toBeCloseTo(3000, 6);
        expect(middle?.dropPx).toBeCloseTo(waterHeightOfPressure(hurricanePressureDrop(4)) * PX_PER_METRE, 6);
        // About 0.75 m of water, 22 map pixels.
        expect(middle?.dropPx).toBeGreaterThan(19);
        expect(middle?.dropPx).toBeLessThan(26);
        const starting = hurricanePressure(hurricane, 1_000_500);
        expect(starting?.dropPx ?? 0).toBeLessThan((middle?.dropPx ?? 0) * 0.1);
        expect(hurricanePressure(hurricane, 1_300_000)).toBeUndefined();
    });

    it("lays the heights over the cells of a grid: lowest under the centre", () => {
        const columns = 400;
        const out = new Float32Array(columns * 5);
        pressureHeads(low(4, 2, 20), 0, 0, columns, 5, TERRAIN_CELL, out);
        expect(out[2 * columns + 4]).toBeCloseTo(-20, 4);
        expect(Math.min(...out)).toBe(out[2 * columns + 4]);
        // Far from it (7 radii), a twentieth of the drop.
        const far = out[2 * columns + columns - 1];
        expect(far).toBeGreaterThan(-20 * 0.06);
        expect(far).toBeCloseTo(-20 * lowShare(((columns - 5) * TERRAIN_CELL) / HURRICANE_RMAX_PX, 1.5), 2);
    });
});

describe("the water of a closed basin under a low", () => {
    const LENGTH = 200;
    const WIDTH = 9;
    const ROW = 2 + Math.floor(WIDTH / 2);

    it("rises in a dome under the centre, as high as the heights of the pressure say, and nothing is lost", () => {
        const grid = basin(LENGTH, WIDTH, 60);
        const before = grid.totalPx();
        const centre = 2 + LENGTH / 2;
        const pressure = low(centre, ROW, 22);
        grid.setPressure(pressure);
        // The basin sloshes a while (a seiche of about two minutes, slowly damped), then rests.
        for (let step = 0; step < 6000; step++) grid.step(inertia);
        const line = surfaces(grid, LENGTH, ROW);
        // At rest, surface + height of the pressure is level: the dome is what the heights say between two cells.
        const heads = new Float32Array(grid.bounds.width * grid.bounds.height);
        pressureHeads(pressure, 0, 0, grid.bounds.width, grid.bounds.height, TERRAIN_CELL, heads);
        const headAt = (x: number): number => heads[ROW * grid.bounds.width + x];
        const wanted = headAt(2) - headAt(centre);
        const got = line[centre - 2] - line[0];
        expect(wanted).toBeGreaterThan(5);
        expect(Math.abs(got - wanted) / wanted).toBeLessThan(0.1);
        // The dome stands over the centre of the low: its top is wide (the low is the whole drop within half a radius,
        // 27 cells), its middle where the low is.
        expect(Math.abs(centreOf(line) + 2 - centre)).toBeLessThan(1);
        expect(grid.totalPx()).toBeCloseTo(before, 0);
        // And it stays there: no swing left at rest.
        const settled = surfaces(grid, LENGTH, ROW);
        for (let step = 0; step < 50; step++) grid.step(inertia);
        const later = surfaces(grid, LENGTH, ROW);
        for (let at = 0; at < LENGTH; at++) expect(Math.abs(later[at] - settled[at])).toBeLessThan(0.1);
    });

    it("follows the centre as it moves on, and falls back once the low is gone", () => {
        const grid = basin(LENGTH, WIDTH, 60);
        // A hurricane crosses the map in a few minutes: about 0.9 m/s, 26 map pixels a second.
        const speedPx = 26;
        let x = (2 + 40) * TERRAIN_CELL;
        grid.setPressure({ ...low(0, ROW, 22), x });
        for (let step = 0; step < 1500; step++) grid.step(inertia);
        const startCell = Math.round(x / TERRAIN_CELL - 0.5);
        const before = surfaces(grid, LENGTH, ROW);
        for (let step = 0; step < 300; step++) {
            x += speedPx * 0.1;
            grid.setPressure({ ...low(0, ROW, 22), x });
            grid.step(inertia);
        }
        // 30 s later the eye is 49 cells on (27 m): the water rose where it came, and fell where it was.
        const eyeCell = Math.round(x / TERRAIN_CELL - 0.5);
        const after = surfaces(grid, LENGTH, ROW);
        expect(eyeCell - startCell).toBeGreaterThan(45);
        expect(after[eyeCell - 2] - before[eyeCell - 2]).toBeGreaterThan(3);
        expect(before[startCell - 2] - after[startCell - 2]).toBeGreaterThan(3);
        // The middle of the dome went on with it, a little behind.
        expect(centreOf(after) - centreOf(before)).toBeGreaterThan(10);
        grid.setPressure(undefined);
        for (let step = 0; step < 3000; step++) grid.step(inertia);
        const line = surfaces(grid, LENGTH, ROW);
        expect(Math.max(...line) - Math.min(...line)).toBeLessThan(1);
    });

    it("is the same, to the bit, with the kernel compiled to WebAssembly, its wind included", () => {
        const grids = [basin(60, 7, 60), basin(60, 7, 60, new WasmWaterKernel())];
        expect(grids.map((grid) => grid.kernelName())).toStrictEqual(["typescript", "wasm"]);
        for (let step = 0; step < 200; step++) {
            for (const grid of grids) {
                // A low that moves on, and a wind that turns round it.
                const x = (20 + step * 0.1) * TERRAIN_CELL;
                grid.setPressure({
                    ...low(20, 5, 22),
                    x,
                    wind: (at, row) => ({ east: (row - 90) / 3, south: (x - at) / 30 }),
                });
                grid.step(inertia);
            }
            const [one, other] = grids.map((grid) => {
                const depth = Reflect.get(grid, "depth") as Float32Array;
                return Buffer.from(depth.buffer, depth.byteOffset, depth.byteLength);
            });
            if (Buffer.compare(one, other) !== 0) expect.fail(`the depths differ after step ${step}`);
        }
    });
});

describe("the wind over the water (its stress)", () => {
    it("drags the surface as the measures say: Large and Pond to 25 m/s, levelling off in a hurricane (Powell 2003)", () => {
        expect(seaDrag(8)).toBeCloseTo(1.2e-3, 9);
        expect(seaDrag(20)).toBeCloseTo((0.49 + 0.065 * 20) * 1e-3, 9);
        expect(seaDrag(40)).toBe(MOST_DRAG);
        expect(seaDrag(70)).toBe(MOST_DRAG);
        // About 9 Pa in the wall of a category 4 (55 m/s).
        expect(windStress(55)).toBeGreaterThan(8);
        expect(windStress(55)).toBeLessThan(9.5);
        expect(windStress(0)).toBe(0);
        const push = windPush(30, -40, TERRAIN_CELL);
        expect(push.east / push.south).toBeCloseTo(-0.75, 9);
    });

    it("of a hurricane: the wind of hurricaneHere, the same at every point", () => {
        const hurricane: Hurricane = {
            id: 2,
            category: 3,
            durationMs: 300_000,
            heading: 290,
            southern: false,
            startedAt: 0,
            fromX: 6000,
            fromY: 3000,
            toX: 0,
            toY: 1000,
            anchorX: 3000,
            anchorY: 2000,
        };
        const storm = hurricaneAt(hurricane, 100_000);
        if (!storm) throw new Error("the storm crosses the map at 100 s");
        for (const [x, y] of [
            [100, 200],
            [3500, 1800],
            [storm.eyeX + 900, storm.eyeY],
        ]) {
            const here = hurricaneHere(hurricane, 100_000, x, y);
            const wind = hurricaneWind(hurricane, storm, x, y);
            expect(Math.hypot(wind.east, wind.north)).toBeCloseTo(here?.windSpeed ?? NaN, 9);
        }
    });

    it("holds the water of a closed channel aslant at rest: dη/dx = τ / (ρ_w g h)", () => {
        const LENGTH = 200;
        const grid = basin(LENGTH, 5, 80);
        // 40 m/s towards the east over the whole channel, no low.
        grid.setPressure({ x: 0, y: 0, dropPx: 0, radiusPx: 1, b: 1, wind: () => ({ east: 40, south: 0 }) });
        for (let step = 0; step < 6000; step++) grid.step(inertia);
        const line = surfaces(grid, LENGTH, 4);
        const depthM = 60 / PX_PER_METRE;
        const slope = windStress(40) / (1000 * 9.81 * depthM);
        const wanted = slope * (LENGTH - 1) * (TERRAIN_CELL / PX_PER_METRE) * PX_PER_METRE;
        const got = line[LENGTH - 1] - line[0];
        // A few centimetres over 110 m: the water stands higher downwind.
        expect(wanted).toBeGreaterThan(0.5);
        expect(Math.abs(got - wanted) / wanted).toBeLessThan(0.15);
    });

    it("turns the water of a lake round a still eye, the way the wind goes round it", () => {
        const SIDE = 120;
        const grid = basin(SIDE, SIDE, 60);
        const centre = 2 + SIDE / 2;
        const eye = { x: centre * TERRAIN_CELL, y: centre * TERRAIN_CELL };
        // The wind of a category 4 round a still eye: anticlockwise seen from above in the north (y down: clockwise on
        // the screen), turned in, strongest at 30 m.
        const hurricane: Hurricane = {
            id: 3,
            category: 4,
            durationMs: 3_600_000,
            heading: 90,
            southern: false,
            startedAt: 0,
            fromX: eye.x,
            fromY: eye.y,
            toX: eye.x + 1e-3,
            toY: eye.y,
            anchorX: eye.x,
            anchorY: eye.y,
        };
        const storm = hurricaneAt(hurricane, 1_000_000);
        if (!storm) throw new Error("the storm is there");
        grid.setPressure({
            x: eye.x,
            y: eye.y,
            dropPx: 0,
            radiusPx: HURRICANE_RMAX_PX,
            b: HURRICANE_HOLLAND_B,
            wind: (x, y) => {
                const wind = hurricaneWind(hurricane, storm, x, y);
                return { east: wind.east / 3.6, south: -wind.north / 3.6 };
            },
        });
        for (let step = 0; step < 600; step++) grid.step(inertia);
        // The circulation of the flows round the eye, and that of the wind: the same way.
        const east = Reflect.get(grid, "flowEast") as Float32Array;
        const south = Reflect.get(grid, "flowSouth") as Float32Array;
        const width = grid.bounds.width;
        let water = 0;
        let air = 0;
        for (let row = 2; row < 2 + SIDE; row++) {
            for (let column = 2; column < 2 + SIDE; column++) {
                const dx = (column + 0.5) * TERRAIN_CELL - eye.x;
                const dy = (row + 0.5) * TERRAIN_CELL - eye.y;
                const index = row * width + column;
                water += east[index] * -dy + south[index] * dx;
                const wind = hurricaneWind(hurricane, storm, (column + 0.5) * TERRAIN_CELL, (row + 0.5) * TERRAIN_CELL);
                air += (wind.east / 3.6) * -dy + (-wind.north / 3.6) * dx;
            }
        }
        expect(Math.sign(water)).toBe(Math.sign(air));
        expect(Math.abs(water)).toBeGreaterThan(0);
        // At the radius of the strongest winds the water picks up as the stress says, τ / (ρ_w h) a second, held back
        // a little by the friction of the bottom: some 0.2 m/s after a minute (and on, to a metre or two).
        const rmaxCells = Math.round(HURRICANE_RMAX_PX / TERRAIN_CELL);
        const at = (centre - rmaxCells) * width + centre;
        const speed = (Math.hypot(east[at], south[at]) / 60) * (TERRAIN_CELL / PX_PER_METRE);
        const wall = hurricaneWind(hurricane, storm, eye.x, eye.y - rmaxCells * TERRAIN_CELL);
        const free = (windStress(Math.hypot(wall.east, wall.north) / 3.6) / (1000 * (60 / PX_PER_METRE))) * 60;
        expect(speed).toBeGreaterThan(0.5 * free);
        expect(speed).toBeLessThan(1.05 * free);
    });
});
