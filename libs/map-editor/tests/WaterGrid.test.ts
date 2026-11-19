import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import {
    CELL_LITRES_PER_PX,
    gridBoundsOf,
    MAX_WATER_SURFACE_PX,
    WATER_GRID_MARGIN,
    WaterGrid,
} from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import type { TerrainData } from "../src/types";

const terrainOf = (cells: [number, number, number][]): TerrainData =>
    withHeights(undefined, new Map(cells.map(([x, y, height]) => [cellKey(x, y), height])));
const nothing: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
const run = (grid: WaterGrid, steps: number, input = nothing): void => {
    for (let step = 0; step < steps; step++) grid.step(input);
};

describe("gridBoundsOf", () => {
    it("covers the relief and the water objects, with a margin for a flood, and nothing on a flat map", () => {
        expect(gridBoundsOf(undefined, [])).toBeUndefined();
        const bounds = gridBoundsOf(terrainOf([[10, 20, -8]]), [{ cellX: 40, cellY: 22 }]);
        expect(bounds).toEqual({
            x: 10 - WATER_GRID_MARGIN,
            y: 20 - WATER_GRID_MARGIN,
            width: 31 + 2 * WATER_GRID_MARGIN,
            height: 3 + 2 * WATER_GRID_MARGIN,
        });
        // A source on flat ground alone still has its grid: it floods.
        expect(gridBoundsOf(undefined, [{ cellX: 0, cellY: 0 }])?.width).toBe(1 + 2 * WATER_GRID_MARGIN);
    });

    it("never covers more than its largest size", () => {
        const far = gridBoundsOf(terrainOf([[0, 0, -8]]), [{ cellX: 5000, cellY: 5000 }]);
        expect((far?.width ?? 0) * (far?.height ?? 0)).toBeLessThanOrEqual(600 * 600);
    });
});

describe("gridBoundsOf on a map of a known size", () => {
    const map = { width: 100, height: 80 };

    it("stops at the edges of the map: the margin of a flood never goes past them", () => {
        expect(gridBoundsOf(terrainOf([[10, 20, -8]]), [], map)).toEqual({
            x: 0,
            y: 0,
            width: 10 + 1 + WATER_GRID_MARGIN,
            height: 20 + 1 + WATER_GRID_MARGIN,
        });
        expect(gridBoundsOf(terrainOf([[90, 70, -8]]), [], map)).toEqual({
            x: 90 - WATER_GRID_MARGIN,
            y: 70 - WATER_GRID_MARGIN,
            width: 100 - (90 - WATER_GRID_MARGIN),
            height: 80 - (70 - WATER_GRID_MARGIN),
        });
    });

    it("leaves out the relief and the water objects that are outside the map", () => {
        const inside = gridBoundsOf(terrainOf([[10, 20, -8]]), [], map);
        expect(
            gridBoundsOf(
                terrainOf([
                    [10, 20, -8],
                    [300, 20, -8],
                    [10, -40, -8],
                ]),
                [{ cellX: 100, cellY: 20 }],
                map,
            ),
        ).toEqual(inside);
    });

    it("has nothing to simulate when all the relief is outside the map", () => {
        expect(gridBoundsOf(terrainOf([[100, 80, -8]]), [{ cellX: -1, cellY: 3 }], map)).toBeUndefined();
    });
});

describe("WaterGrid", () => {
    // A slope dug from (0,0) down to (8,0): each cell 4 px lower than the one before.
    const slope = terrainOf(Array.from({ length: 9 }, (_, x) => [x, 0, -4 - 4 * x] as [number, number, number]));

    it("holds a litre scale: a cell under one pixel of water", () => {
        // 0.3 m² × (1/32 × √1.2) m × 1000
        expect(CELL_LITRES_PER_PX).toBeCloseTo(0.3 * (Math.sqrt(1.2) / 32) * 1000, 6);
    });

    it("pours a source where it stands, the water running down to the lowest cell", () => {
        const grid = new WaterGrid(slope, gridBoundsOf(slope, []));
        // 2 px of water a step at the top of the slope.
        run(grid, 400, { ...nothing, flows: [{ cellX: 0, cellY: 0, px: 2 }] });
        // The bottom fills first and deepest: a river down the slope, a pool at its end.
        expect(grid.depthAt(8, 0)).toBeGreaterThan(grid.depthAt(4, 0));
        expect(grid.depthAt(8, 0)).toBeGreaterThan(20);
        // Water runs all along the bed while the source pours.
        for (let x = 0; x <= 8; x++) expect(grid.depthAt(x, 0)).toBeGreaterThan(0);
    });

    it("sends the water of a strong source down to the hollows before it floods the ground around", () => {
        // A source in a shallow dip, a bed going down from it to a deep hollow of 100 cells.
        const cells: [number, number, number][] = [[0, 0, -2]];
        for (let x = 1; x <= 10; x++) cells.push([x, 0, -2 - 2 * x]);
        for (let x = 11; x <= 20; x++) for (let y = -5; y <= 4; y++) cells.push([x, y, -40]);
        const land = terrainOf(cells);
        const grid = new WaterGrid(land, gridBoundsOf(land, []));
        let lost = 0;
        // 100 px of water a step: far more than one cell holds or passes on in a step.
        for (let step = 0; step < 10; step++)
            lost += grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 100 }] }).lostPx;
        let inHollow = 0;
        for (let x = 11; x <= 20; x++) for (let y = -5; y <= 4; y++) inHollow += grid.depthAt(x, y);
        // Nothing is thrown away, most of it is already down in the hollow, and the bed is wet all along.
        expect(lost).toBe(0);
        expect(inHollow).toBeGreaterThan(800);
        for (let x = 1; x <= 10; x++) expect(grid.depthAt(x, 0)).toBeGreaterThan(0);
        // The flat ground away from the bed stays dry: the hollow is far from full.
        expect(grid.depthAt(-12, 0)).toBe(0);
        expect(grid.depthAt(0, -12)).toBe(0);
        expect(grid.depthAt(0, 12)).toBe(0);
    });

    it("keeps every drop: what the grid holds is what came in, less what went out", () => {
        const grid = new WaterGrid(slope, gridBoundsOf(slope, []));
        let poured = 0;
        for (let step = 0; step < 300; step++) {
            const tally = grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 1.5 }] });
            poured += tally.sourcesPx - tally.sinksPx - tally.evaporationPx - tally.absorptionPx - tally.lostPx;
        }
        expect(grid.totalPx()).toBeCloseTo(poured, 3);
    });

    it("comes to rest level in a hollow, and then stops moving", () => {
        const pit = terrainOf([
            [0, 0, -32],
            [1, 0, -32],
            [2, 0, -16],
        ]);
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []));
        // Poured in a deep cell, under the rim: nothing spills on the flat ground.
        grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 30 }] });
        run(grid, 600);
        // 30 px of water for two cells 32 deep and one 16 deep: 15 px in each deep cell, level at -17, the shallow one dry.
        expect(grid.depthAt(0, 0)).toBeCloseTo(15, 1);
        expect(grid.depthAt(1, 0)).toBeCloseTo(15, 1);
        expect(grid.depthAt(2, 0)).toBeLessThan(0.05);
        expect(grid.step(nothing).moved).toBe(false);
        expect(grid.wetCells()).toBe(2);
        // A sink in a dry cell takes nothing and does not wake the grid.
        expect(grid.step({ ...nothing, flows: [{ cellX: 9, cellY: 9, px: -5 }] }).moved).toBe(false);
    });

    it("overflows a full hollow onto the flat ground around, rising and advancing while water comes", () => {
        const pit = terrainOf([[0, 0, -8]]);
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []));
        const source = { ...nothing, flows: [{ cellX: 0, cellY: 0, px: 4 }] };
        run(grid, 200, source);
        const nearEarly = grid.depthAt(3, 0);
        const reachEarly = [...Array(40).keys()].filter((x) => grid.depthAt(x, 0) > 0.05).length;
        run(grid, 800, source);
        const reachLate = [...Array(40).keys()].filter((x) => grid.depthAt(x, 0) > 0.05).length;
        expect(nearEarly).toBeGreaterThan(0);
        // More water: deeper near the hollow, and further out.
        expect(grid.depthAt(3, 0)).toBeGreaterThan(nearEarly);
        expect(reachLate).toBeGreaterThan(reachEarly);
    });

    it("stops at the blocked cells and goes through a gap in them", () => {
        const pit = terrainOf([[0, 0, -8]]);
        const bounds = gridBoundsOf(pit, []);
        // A wall along x = 3, with a door at y = 0.
        const walled = new WaterGrid(pit, bounds, (x) => x === 3);
        const door = new WaterGrid(pit, bounds, (x, y) => x === 3 && y !== 0);
        const source = { ...nothing, flows: [{ cellX: 0, cellY: 0, px: 4 }] };
        run(walled, 600, source);
        run(door, 600, source);
        expect(walled.depthAt(5, 0)).toBe(0);
        expect(walled.depthAt(3, 0)).toBe(0);
        expect(door.depthAt(5, 0)).toBeGreaterThan(0);
        expect(door.depthAt(3, 4)).toBe(0);
    });

    describe("walls between cells", () => {
        // Flat ground, a wall from top to bottom between the columns 9 and 10, but for a doorway at the row 10.
        const flat = terrainOf([[100, 100, -1]]);
        const bounds = { x: 0, y: 0, width: 20, height: 20 };
        const wall = (doorway: boolean): { east: Set<string>; south: Set<string> } => {
            const east = new Set<string>();
            for (let y = 0; y < 20; y++) if (!doorway || y !== 10) east.add(cellKey(9, y));
            return { east, south: new Set<string>() };
        };
        const eastSide = (grid: WaterGrid): number => {
            let total = 0;
            for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) total += grid.depthAt(x, y);
            return total;
        };

        it("holds the water on its side of a wall, and lets it through a doorway", () => {
            const closed = new WaterGrid(flat, bounds, undefined, wall(false));
            run(closed, 300, { ...nothing, flows: [{ cellX: 5, cellY: 10, px: 2 }] });
            expect(eastSide(closed)).toBe(0);
            expect(closed.depthAt(9, 10)).toBeGreaterThan(1);
            const open = new WaterGrid(flat, bounds, undefined, wall(true));
            run(open, 300, { ...nothing, flows: [{ cellX: 5, cellY: 10, px: 2 }] });
            expect(eastSide(open)).toBeGreaterThan(10);
        });

        it("holds it at a wall along a row too", () => {
            const south = new Set<string>();
            for (let x = 0; x < 20; x++) south.add(cellKey(x, 9));
            const grid = new WaterGrid(flat, bounds, undefined, { east: new Set<string>(), south });
            run(grid, 300, { ...nothing, flows: [{ cellX: 10, cellY: 5, px: 2 }] });
            let below = 0;
            for (let y = 10; y < 20; y++) for (let x = 0; x < 20; x++) below += grid.depthAt(x, y);
            expect(below).toBe(0);
        });

        it("never lets a sink take water, nor a source pour it, through a wall", () => {
            const grid = new WaterGrid(flat, bounds, undefined, wall(false));
            // A source 2 cells from the wall, pouring over a disc of 4 cells: nothing lands behind the wall.
            grid.step({ ...nothing, flows: [{ cellX: 8, cellY: 10, px: 60, radius: 4 }] });
            expect(eastSide(grid)).toBe(0);
            expect(grid.totalPx()).toBeCloseTo(60, 3);
            // A sink behind the wall, its disc reaching over it, takes nothing.
            const tally = grid.step({ ...nothing, flows: [{ cellX: 11, cellY: 10, px: -1000, radius: 6 }] });
            expect(tally.sinksPx).toBe(0);
        });
    });

    it("takes water at a sink, never more than is there", () => {
        const pit = terrainOf([
            [0, 0, -32],
            [1, 0, -32],
        ]);
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []));
        // Under the rim: all of it stays in the hollow.
        grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 30 }] });
        run(grid, 200);
        const before = grid.totalPx();
        const tally = grid.step({ ...nothing, flows: [{ cellX: 1, cellY: 0, px: -5 }] });
        expect(tally.sinksPx).toBeCloseTo(5);
        expect(grid.totalPx()).toBeCloseTo(before - 5, 3);
        let taken = 0;
        for (let step = 0; step < 400; step++)
            taken += grid.step({ ...nothing, flows: [{ cellX: 1, cellY: 0, px: -5 }] }).sinksPx;
        // All of it but the film too thin to move.
        expect(taken).toBeCloseTo(before - 5, 1);
        expect(grid.totalPx()).toBeLessThan(0.05);
    });

    it("drains the water around a sink at the rate of the sink, not only the cell where it stands", () => {
        // A lake 9 cells by 9, 16 px deep; a sink in its middle asking 40 px of water a step.
        const lake = terrainOf(
            Array.from(
                { length: 81 },
                (_, index) => [index % 9, Math.floor(index / 9), -16] as [number, number, number],
            ),
        );
        const grid = new WaterGrid(lake, gridBoundsOf(lake, []));
        // 10 px of rain in each cell: level, under the rim.
        run(grid, 100, { ...nothing, rainPx: 0.1 });
        const before = grid.totalPx();
        const tally = grid.step({ ...nothing, flows: [{ cellX: 4, cellY: 4, px: -40 }] });
        // The cell of the sink holds 10 px only: the rest comes from the water next to it.
        expect(tally.sinksPx).toBeCloseTo(40, 3);
        expect(grid.totalPx()).toBeCloseTo(before - 40, 2);
    });

    // Seen in the game: a sink set to its strongest flow took a fraction of a percent of it. It emptied its disc, then
    // waited for the lake to creep in from cell to cell, whatever it was asked.
    describe("a sink that asks for more than its disc holds", () => {
        const square = (side: number): TerrainData => {
            const cells: [number, number, number][] = [];
            for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) cells.push([x, y, -16]);
            return terrainOf(cells);
        };
        // A square lake dug 16 px deep, holding 10 px of still water.
        const lakeOf = (side: number): WaterGrid => {
            const terrain = square(side);
            const grid = new WaterGrid(terrain, gridBoundsOf(terrain, []));
            run(grid, 100, { ...nothing, rainPx: 0.1 });
            return grid;
        };

        it("takes the rest from the whole lake, the more the nearer: the water slopes towards the sink", () => {
            const grid = lakeOf(41);
            const before = grid.totalPx();
            const tally = grid.step({ ...nothing, flows: [{ cellX: 20, cellY: 20, px: -5000 }] });
            // Its disc (29 cells of 10 px) does not hold it: the sink still has all it asks.
            expect(tally.sinksPx).toBeCloseTo(5000, 1);
            expect(grid.totalPx()).toBeCloseTo(before - 5000, 0);
            // Every cell of the lake gave, down to its corner, and the nearer ones gave more: a cone around the sink.
            expect(grid.depthAt(0, 0)).toBeLessThan(9.9);
            expect(grid.depthAt(40, 40)).toBeLessThan(9.9);
            for (const [near, far] of [
                [26, 30],
                [30, 34],
                [34, 38],
            ]) {
                expect(grid.depthAt(near, 20)).toBeLessThan(grid.depthAt(far, 20) - 0.05);
                expect(grid.depthAt(20, 40 - near)).toBeLessThan(grid.depthAt(20, 40 - far) - 0.05);
            }
        });

        it("leaves a film of water beyond its disc, so that it stays joined to the rest of the lake", () => {
            const grid = lakeOf(41);
            // More than the cells next to its disc hold, less than the lake.
            grid.step({ ...nothing, flows: [{ cellX: 20, cellY: 20, px: -9000 }] });
            const taken = grid.step({ ...nothing, flows: [{ cellX: 20, cellY: 20, px: -3000 }] }).sinksPx;
            // The second step still finds the lake: a sink that dried the cells around itself would take nothing more.
            expect(taken).toBeGreaterThan(2500);
        });

        it("empties the lake when it asks for more than the lake holds", () => {
            const grid = lakeOf(41);
            const before = grid.totalPx();
            const tally = grid.step({ ...nothing, flows: [{ cellX: 20, cellY: 20, px: -1e6 }] });
            // All of it but the film of 2 px it leaves beyond its disc (29 cells).
            const film = (41 * 41 - 29) * 2;
            expect(tally.sinksPx).toBeCloseTo(before - film, 0);
            expect(grid.totalPx()).toBeCloseTo(film, 0);
        });

        it("leaves the lake alone while its disc holds what it asks", () => {
            const grid = lakeOf(41);
            grid.step({ ...nothing, flows: [{ cellX: 20, cellY: 20, px: -200 }] });
            expect(grid.depthAt(30, 20)).toBeCloseTo(10, 3);
            expect(grid.depthAt(20, 8)).toBeCloseTo(10, 3);
        });

        it("takes nothing behind a wall", () => {
            const flat = terrainOf([[100, 100, -1]]);
            const east = new Set<string>();
            for (let y = 0; y < 20; y++) east.add(cellKey(9, y));
            const flooded = (): WaterGrid => {
                const grid = new WaterGrid(flat, { x: 0, y: 0, width: 20, height: 20 }, undefined, {
                    east,
                    south: new Set<string>(),
                });
                // 10 px of water everywhere.
                const bytes = new Uint8Array(20 * 20 * 2);
                for (let index = 0; index < 400; index++) bytes[index * 2] = 80;
                grid.readDepths(bytes);
                return grid;
            };
            const eastSide = (grid: WaterGrid): number => {
                let total = 0;
                for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) total += grid.depthAt(x, y);
                return total;
            };
            const drained = flooded();
            drained.step({ ...nothing, flows: [{ cellX: 5, cellY: 10, px: -1e6 }] });
            const control = flooded();
            control.step(nothing);
            expect(drained.depthAt(2, 3)).toBeLessThan(2.01);
            expect(eastSide(drained)).toBeCloseTo(eastSide(control), 3);
        });

        it("takes nothing from a lake that dry ground parts from its own", () => {
            // Two ponds in a row, an undug cell between them.
            const ponds = terrainOf(
                Array.from({ length: 21 }, (_, x) => [x, 0, x === 10 ? 0 : -16] as [number, number, number]),
            );
            const grid = new WaterGrid(ponds, gridBoundsOf(ponds, []));
            run(grid, 100, { ...nothing, rainPx: 0.1 });
            grid.step({ ...nothing, flows: [{ cellX: 2, cellY: 0, px: -1e6 }] });
            expect(grid.depthAt(8, 0)).toBeLessThan(2.01);
            expect(grid.depthAt(15, 0)).toBeCloseTo(10, 3);
        });

        it("never takes the water lower than its own foot", () => {
            // A canal: a shelf dug 4 px deep (5 cells), then a pit dug 16 px deep (16 cells), the water 3 px over
            // the shelf.
            const canal = terrainOf(
                Array.from({ length: 21 }, (_, x) => [x, 0, x < 5 ? -4 : -16] as [number, number, number]),
            );
            const grid = new WaterGrid(canal, gridBoundsOf(canal, []));
            run(grid, 100, { ...nothing, rainPx: (5 * 3 + 16 * 15) / 21 / 100 });
            run(grid, 3000);
            expect(grid.depthAt(2, 0)).toBeCloseTo(3, 0);
            // What stands over the level of the shelf, all along the canal (the pit holds 12 px under it), but for the
            // film the sink leaves on the shelf.
            let over = 0;
            for (let x = 0; x < 21; x++) over += grid.depthAt(x, 0) - (x === 0 ? 0 : x < 5 ? 2 : 12);
            expect(over).toBeGreaterThan(35);
            // A sink on the shelf, taking from its own cell only.
            const tally = grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: -1e6, radius: 0 }] });
            expect(tally.sinksPx).toBeCloseTo(over, 1);
            expect(grid.depthAt(2, 0)).toBeCloseTo(2, 1);
            expect(grid.depthAt(12, 0)).toBeCloseTo(12, 0);
        });

        it("reaches a bounded part of a very large lake only", () => {
            // 22 500 cells, more than a sink reaches (16 384).
            const grid = lakeOf(150);
            const tally = grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: -1e9 }] });
            expect(tally.sinksPx).toBeGreaterThan(100_000);
            expect(tally.sinksPx).toBeLessThanOrEqual(16_384 * 10 + 1);
            expect(grid.depthAt(149, 149)).toBeCloseTo(10, 3);
        });
    });

    it("takes water from its disc first: a larger radius empties more around the sink before the lake goes down", () => {
        const lake = terrainOf(
            Array.from(
                { length: 41 * 41 },
                (_, index) => [index % 41, Math.floor(index / 41), -16] as [number, number, number],
            ),
        );
        const grid = new WaterGrid(lake, gridBoundsOf(lake, []));
        run(grid, 100, { ...nothing, rainPx: 0.1 });
        // A disc of radius 10: 317 cells of 10 px, just what the sink asks.
        const tally = grid.step({ ...nothing, flows: [{ cellX: 20, cellY: 20, px: -3170, radius: 10 }] });
        // Eight cells away the water is taken; fifteen cells away it is not.
        expect(grid.depthAt(28, 20)).toBeLessThan(5);
        expect(grid.depthAt(35, 20)).toBeCloseTo(10, 3);
        expect(tally.sinksPx).toBeCloseTo(3170, 0);
    });

    it("pours a source over the disc it was given, not at one point", () => {
        const flat = terrainOf([[100, 100, -1]]);
        const grid = new WaterGrid(flat, { x: 0, y: 0, width: 40, height: 40 });
        // 81 px over a disc of radius 5 (81 cells): about a pixel of water each, before it runs.
        const tally = grid.step({ ...nothing, flows: [{ cellX: 20, cellY: 20, px: 81, radius: 5 }] });
        expect(tally.lostPx).toBe(0);
        expect(grid.totalPx()).toBeCloseTo(81, 3);
        expect(grid.depthAt(20, 20)).toBeLessThan(3);
        expect(grid.depthAt(24, 20)).toBeGreaterThan(0.2);
        expect(grid.depthAt(20, 16)).toBeGreaterThan(0.2);
        expect(grid.depthAt(28, 20)).toBe(0);
    });

    // Seen in the game: a strong sink emptied its disc, and the water around took so long to run in that the sink
    // took almost nothing (42 m³ an hour for thousands asked).
    it("feeds a strong sink faster when the water is given more moves a step", () => {
        const side = 61;
        const cells: [number, number, number][] = [];
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) cells.push([x, y, -16]);
        const lake = terrainOf(cells);
        const taken = (flowSteps: number | undefined): number => {
            const grid = new WaterGrid(lake, gridBoundsOf(lake, []));
            // A film of water (0.8 px), too thin for the sink to take it from afar: it has to run to it.
            run(grid, 100, { ...nothing, rainPx: 0.008 });
            let total = 0;
            for (let step = 0; step < 60; step++) {
                total += grid.step({ ...nothing, flowSteps, flows: [{ cellX: 30, cellY: 30, px: -1e6 }] }).sinksPx;
            }
            return total;
        };
        const slow = taken(undefined);
        const fast = taken(16);
        expect(taken(1)).toBeCloseTo(slow, 3);
        expect(fast).toBeGreaterThan(slow * 3);
    });

    it("moves the water again around the sinks only: far from a sink, the water goes as it does without it", () => {
        const side = 121;
        const cells: [number, number, number][] = [];
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) cells.push([x, y, -16]);
        const lake = terrainOf(cells);
        const farAfter = (sink: boolean): number => {
            const grid = new WaterGrid(lake, gridBoundsOf(lake, []));
            // A film of water (0.8 px), too thin for the sink to take it from afar.
            run(grid, 100, { ...nothing, rainPx: 0.008 });
            // A mound of water in a corner, a sink (or none) in the opposite one.
            grid.step({ ...nothing, flows: [{ cellX: 10, cellY: 10, px: 4 }] });
            for (let step = 0; step < 5; step++) {
                grid.step({ ...nothing, flowSteps: 16, flows: sink ? [{ cellX: 100, cellY: 100, px: -1e6 }] : [] });
            }
            return grid.depthAt(10, 10);
        };
        expect(farAfter(true)).toBeCloseTo(farAfter(false), 4);
    });

    describe("over long distances", () => {
        // A canal 200 cells long and one wide, dug 16 px deep, holding 10 px of still water.
        const canal = terrainOf(Array.from({ length: 200 }, (_, x) => [x, 0, -16] as [number, number, number]));
        const filled = (walls?: { east: Set<string>; south: Set<string> }): WaterGrid => {
            const grid = new WaterGrid(canal, gridBoundsOf(canal, []), undefined, walls);
            run(grid, 100, { ...nothing, rainPx: 0.1 });
            return grid;
        };
        // Water poured at one end: how much higher the other end of the canal stands after 150 steps.
        const riseAtFarEnd = (flowSteps: number, walls?: { east: Set<string>; south: Set<string> }): number => {
            const grid = filled(walls);
            const before = grid.depthAt(190, 0);
            run(grid, 150, { ...nothing, flowSteps, flows: [{ cellX: 2, cellY: 0, px: 4 }] });
            return grid.depthAt(190, 0) - before;
        };

        it("levels a long stretch of water much sooner on a map that goes faster than reality", () => {
            expect(riseAtFarEnd(1)).toBeLessThan(0.05);
            expect(riseAtFarEnd(15)).toBeGreaterThan(0.5);
        });

        it("still never crosses a wall", () => {
            const wall = { east: new Set([cellKey(99, 0)]), south: new Set<string>() };
            expect(riseAtFarEnd(15, wall)).toBe(0);
        });

        it("never carries water over dry ground, nor over a film of water: two ponds stay two ponds", () => {
            // Two ponds 30 cells long, 20 cells of ground between them, 6 px lower than their rims.
            const cells: [number, number, number][] = [];
            for (let x = 0; x < 30; x++) cells.push([x, 0, -16], [x + 50, 0, -16]);
            for (let x = 30; x < 50; x++) cells.push([x, 0, -6]);
            const ponds = terrainOf(cells);
            const grid = new WaterGrid(ponds, gridBoundsOf(ponds, []));
            // 8 px of water in the first pond only: its surface is 2 px under the ground between the ponds.
            for (let step = 0; step < 60; step++) {
                grid.step({ ...nothing, flowSteps: 15, flows: [{ cellX: 5, cellY: 0, px: 4 }] });
            }
            let second = 0;
            for (let x = 50; x < 80; x++) second += grid.depthAt(x, 0);
            expect(grid.depthAt(20, 0)).toBeGreaterThan(5);
            expect(second).toBe(0);
        });

        it("keeps every drop", () => {
            const grid = filled();
            const before = grid.totalPx();
            let poured = 0;
            let lost = 0;
            for (let step = 0; step < 100; step++) {
                const tally = grid.step({ ...nothing, flowSteps: 15, flows: [{ cellX: 2, cellY: 0, px: 4 }] });
                poured += tally.sourcesPx;
                lost += tally.lostPx;
            }
            expect(grid.totalPx()).toBeCloseTo(before + poured - lost, 1);
        });

        it("comes to rest: still water stays still", () => {
            const grid = filled();
            run(grid, 300, { ...nothing, flowSteps: 15 });
            expect(grid.step({ ...nothing, flowSteps: 15 }).moved).toBe(false);
        });
    });

    it("keeps every drop whatever the number of moves a step", () => {
        const grid = new WaterGrid(slope, gridBoundsOf(slope, []));
        let poured = 0;
        let out = 0;
        for (let step = 0; step < 200; step++) {
            const tally = grid.step({
                ...nothing,
                flowSteps: 8,
                flows: [
                    { cellX: 0, cellY: 0, px: 2 },
                    { cellX: 8, cellY: 0, px: -1 },
                ],
            });
            poured += tally.sourcesPx;
            out += tally.sinksPx + tally.lostPx;
        }
        expect(grid.totalPx()).toBeCloseTo(poured - out, 1);
    });

    it("never breaks on a broken number of moves", () => {
        const grid = new WaterGrid(slope, gridBoundsOf(slope, []));
        for (const flowSteps of [Number.NaN, -3, 0, 1e9]) {
            expect(() => grid.step({ ...nothing, flowSteps, flows: [{ cellX: 0, cellY: 0, px: 2 }] })).not.toThrow();
        }
        expect(grid.totalPx()).toBeGreaterThan(0);
    });

    it("leaves alone the water lower than a sink: it would never run to it", () => {
        // A sink at the top of a dug slope, water at the bottom only.
        const grid = new WaterGrid(slope, gridBoundsOf(slope, []));
        run(grid, 300, { ...nothing, flows: [{ cellX: 8, cellY: 0, px: 0.1 }] });
        const held = grid.totalPx();
        expect(grid.depthAt(0, 0)).toBe(0);
        const tally = grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: -1000 }] });
        expect(tally.sinksPx).toBe(0);
        expect(grid.totalPx()).toBeCloseTo(held, 3);
    });

    it("smooths a checkerboard of water away on flat ground instead of keeping it flickering", () => {
        const flat = terrainOf([[0, 0, -1]]);
        const bounds = { x: 10, y: 10, width: 12, height: 12 };
        const grid = new WaterGrid(flat, bounds);
        const flows = [];
        for (let y = 12; y < 20; y++)
            for (let x = 12; x < 20; x++) if ((x + y) % 2 === 0) flows.push({ cellX: x, cellY: y, px: 8 });
        grid.step({ ...nothing, flows });
        run(grid, 12);
        // Two neighbours in the middle of the wet patch end at nearly the same depth.
        expect(Math.abs(grid.depthAt(15, 15) - grid.depthAt(16, 15))).toBeLessThan(0.5);
    });

    it("rains on the hollows only, evaporates from every wet cell, and lets the flat ground drink", () => {
        const pit = terrainOf([[0, 0, -32]]);
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []));
        const rain = grid.step({ ...nothing, rainPx: 2 });
        expect(rain.rainPx).toBeCloseTo(2);
        expect(grid.depthAt(0, 0)).toBeCloseTo(2);
        expect(grid.depthAt(5, 5)).toBe(0);
        const dry = grid.step({ ...nothing, evaporationPx: 0.5 });
        expect(dry.evaporationPx).toBeCloseTo(0.5);
        expect(grid.depthAt(0, 0)).toBeCloseTo(1.5);
        // Evaporation never takes more than there is.
        expect(grid.step({ ...nothing, evaporationPx: 9 }).evaporationPx).toBeCloseTo(1.5);
        // A sheet on flat ground is drunk by it; the water of a hollow is not.
        const flood = new WaterGrid(pit, gridBoundsOf(pit, []));
        flood.step({ ...nothing, flows: [{ cellX: 6, cellY: 6, px: 1 }] });
        const drunk = flood.step({ ...nothing, absorptionPx: 0.25 });
        expect(drunk.absorptionPx).toBeGreaterThan(0);
        flood.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 3 }] });
        const held = flood.depthAt(0, 0);
        flood.step({ ...nothing, absorptionPx: 0.25 });
        expect(flood.depthAt(0, 0)).toBeGreaterThanOrEqual(held - 0.8);
    });

    it("loses the water that reaches the edge of the grid, and counts it", () => {
        const pit = terrainOf([[0, 0, -4]]);
        const grid = new WaterGrid(pit, { x: -3, y: -3, width: 7, height: 7 });
        let lost = 0;
        for (let step = 0; step < 400; step++)
            lost += grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 3 }] }).lostPx;
        expect(lost).toBeGreaterThan(0);
        // The water does not pile up against the edge.
        expect(grid.depthAt(3, 0)).toBeLessThan(3);
    });

    it("never breaks on a broken input, and bounds the depth of a cell", () => {
        const pit = terrainOf([[0, 0, -4]]);
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []));
        grid.step({
            rainPx: Number.NaN,
            evaporationPx: Number.NaN,
            absorptionPx: -4,
            flows: [{ cellX: 0, cellY: 0, px: Number.NaN }],
        });
        expect(grid.totalPx()).toBe(0);
        const tally = grid.step({
            ...nothing,
            flows: [
                { cellX: 0, cellY: 0, px: 1e9 },
                { cellX: 9999, cellY: 0, px: 5 },
            ],
        });
        // Asked by the user: a flood rises just over the depth where an avatar swims (16 px, about half a metre), and
        // so stays far under the first raised floor (52 px): one swims in the street and keeps dry feet upstairs.
        expect(MAX_WATER_SURFACE_PX).toBe(18);
        expect(grid.depthAt(0, 0)).toBeLessThanOrEqual(MAX_WATER_SURFACE_PX + 4);
        expect(Number.isFinite(grid.totalPx())).toBe(true);
        expect(tally.lostPx).toBeGreaterThan(0);
    });

    // Seen on a map under the rain: the water of a wide dug region piled up into a dome hundreds of pixels high,
    // its surface sloping everywhere, because the rain brings water faster than it can run away.
    it("never lets the rain pile the water of a wide hollow into a dome: what is over the highest level is lost", () => {
        const side = 61;
        const wide = terrainOf(
            Array.from(
                { length: side * side },
                (_, index) => [index % side, Math.floor(index / side), -8] as [number, number, number],
            ),
        );
        const grid = new WaterGrid(wide, gridBoundsOf(wide, []));
        let rain = 0;
        let lost = 0;
        for (let step = 0; step < 1500; step++) {
            const tally = grid.step({ ...nothing, rainPx: 0.5 });
            rain += tally.rainPx;
            lost += tally.lostPx;
        }
        // In the middle, far from any edge, the surface is at the highest level and no higher, and it is level.
        const middle = (side - 1) / 2;
        expect(grid.depthAt(middle, middle) - 8).toBeLessThanOrEqual(MAX_WATER_SURFACE_PX + 0.01);
        expect(grid.depthAt(middle, middle) - 8).toBeGreaterThan(MAX_WATER_SURFACE_PX - 1);
        expect(Math.abs(grid.depthAt(middle, middle) - grid.depthAt(middle + 6, middle))).toBeLessThan(0.5);
        // Every drop is counted: what the grid holds is the rain less what was lost.
        expect(grid.totalPx()).toBeCloseTo(rain - lost, -1);
        expect(lost).toBeGreaterThan(0);
    });

    it("never lets a flood rise over its highest level, however much water comes", () => {
        const pit = terrainOf([[0, 0, -8]]);
        // A small closed yard: walls all around, so the water can only rise.
        const yard = (x: number, y: number): boolean => Math.abs(x) === 4 || Math.abs(y) === 4;
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []), yard);
        run(grid, 3000, { ...nothing, flows: [{ cellX: 0, cellY: 0, px: 50 }] });
        for (let y = -3; y <= 3; y++) {
            for (let x = -3; x <= 3; x++) {
                const surface = grid.depthAt(x, y) + (x === 0 && y === 0 ? -8 : 0);
                expect(surface).toBeLessThanOrEqual(MAX_WATER_SURFACE_PX + 0.01);
            }
        }
        // The yard is flooded to the brim of what is allowed.
        expect(grid.depthAt(3, 3)).toBeGreaterThan(MAX_WATER_SURFACE_PX - 2);
    });

    it("carries its water over to a new relief, cell by cell", () => {
        const pit = terrainOf([[0, 0, -32]]);
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []));
        grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 20 }] });
        const wider = terrainOf([
            [0, 0, -32],
            [30, 0, -8],
        ]);
        const next = new WaterGrid(wider, gridBoundsOf(wider, []));
        next.takeFrom(grid);
        expect(next.depthAt(0, 0)).toBeCloseTo(20);
        expect(next.totalPx()).toBeCloseTo(20);
    });

    it("writes its state as bytes and reads it back", () => {
        const pit = terrainOf([[0, 0, -32]]);
        const grid = new WaterGrid(pit, gridBoundsOf(pit, []));
        grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 20.3 }] });
        run(grid, 50);
        const copy = new WaterGrid(pit, gridBoundsOf(pit, []));
        copy.readDepths(grid.writeDepths());
        // An eighth of a pixel of precision.
        expect(copy.depthAt(0, 0)).toBeCloseTo(grid.depthAt(0, 0), 0);
        expect(Math.abs(copy.totalPx() - grid.totalPx())).toBeLessThan(0.2);
        // Bytes of another size are refused, the grid stays as it was.
        copy.readDepths(new Uint8Array(7));
        expect(copy.depthAt(0, 0)).toBeCloseTo(grid.depthAt(0, 0), 0);
    });
});

describe("water on a relief raised over the ground", () => {
    it("gives a mount its grid, like a hollow", () => {
        expect(gridBoundsOf(terrainOf([[10, 20, 32]]), [])).toEqual({
            x: 10 - WATER_GRID_MARGIN,
            y: 20 - WATER_GRID_MARGIN,
            width: 1 + 2 * WATER_GRID_MARGIN,
            height: 1 + 2 * WATER_GRID_MARGIN,
        });
    });

    it("keeps the water poured on a plateau, which runs off it", () => {
        // A plateau 5 cells wide, 64 px over the ground: far over the highest level of a flood on the ground.
        const cells: [number, number, number][] = [];
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) cells.push([x, y, 64]);
        const plateau = terrainOf(cells);
        const grid = new WaterGrid(plateau, gridBoundsOf(plateau, []));
        const tally = grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 6 }] });
        // Nothing is lost for being over the level of a flood of the ground.
        expect(tally.lostPx).toBe(0);
        expect(grid.totalPx()).toBeCloseTo(6);
        run(grid, 400);
        // Left alone, the water has run down to the ground around the plateau.
        expect(grid.depthAt(0, 0)).toBeLessThan(0.5);
        expect(grid.depthAt(4, 0) + grid.depthAt(-4, 0) + grid.depthAt(0, 4) + grid.depthAt(0, -4)).toBeGreaterThan(0);
    });

    it("never lets the water of a plateau rise over its own highest level", () => {
        const cells: [number, number, number][] = [];
        for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) cells.push([x, y, 64]);
        const plateau = terrainOf(cells);
        // Walls around the middle of the plateau: the water can only rise.
        const yard = (x: number, y: number): boolean => Math.max(Math.abs(x), Math.abs(y)) === 2;
        const grid = new WaterGrid(plateau, gridBoundsOf(plateau, []), yard);
        run(grid, 2000, { ...nothing, flows: [{ cellX: 0, cellY: 0, px: 50 }] });
        expect(grid.depthAt(0, 0)).toBeLessThanOrEqual(MAX_WATER_SURFACE_PX + 0.01);
        expect(grid.depthAt(1, 1)).toBeGreaterThan(MAX_WATER_SURFACE_PX - 2);
    });

    it("stops a flood of the ground at the foot of a mount", () => {
        const land = terrainOf([
            [0, 0, -8],
            [3, 0, 64],
        ]);
        const grid = new WaterGrid(land, gridBoundsOf(land, []));
        run(grid, 3000, { ...nothing, flows: [{ cellX: 0, cellY: 0, px: 50 }] });
        expect(grid.depthAt(2, 0)).toBeGreaterThan(1);
        expect(grid.depthAt(3, 0)).toBe(0);
    });
});

describe("a lake on a mount", () => {
    // A mount 9 cells wide, 64 px high, with a crater 3 cells wide dug 32 px into its top.
    const cells: [number, number, number][] = [];
    for (let y = -4; y <= 4; y++) {
        for (let x = -4; x <= 4; x++) cells.push([x, y, Math.max(Math.abs(x), Math.abs(y)) <= 1 ? 32 : 64]);
    }
    const mount = terrainOf(cells);
    const gridOf = (): WaterGrid => new WaterGrid(mount, gridBoundsOf(mount, []));

    it("fills the crater up to its rim, deeper than a flood of the ground ever is", () => {
        const grid = gridOf();
        run(grid, 3000, { ...nothing, flows: [{ cellX: 0, cellY: 0, px: 20 }] });
        expect(grid.depthAt(0, 0)).toBeGreaterThan(31);
        expect(grid.depthAt(1, 1)).toBeGreaterThan(31);
        // Over its rim the water runs down the mount.
        expect(grid.depthAt(0, 0)).toBeLessThanOrEqual(32 + MAX_WATER_SURFACE_PX + 0.01);
    });

    it("rains into the crater as into a hollow of the ground, not on the top of the mount", () => {
        const grid = gridOf();
        const tally = grid.step({ ...nothing, rainPx: 2 });
        expect(grid.depthAt(0, 0)).toBeCloseTo(2);
        expect(grid.depthAt(3, 0)).toBe(0);
        expect(tally.rainPx).toBeCloseTo(18);
    });

    it("keeps the water of the crater: the ground drinks only what lies where it cannot stay", () => {
        const grid = gridOf();
        grid.step({ ...nothing, rainPx: 10 });
        const tally = grid.step({ ...nothing, absorptionPx: 1 });
        expect(tally.absorptionPx).toBe(0);
        expect(grid.depthAt(0, 0)).toBeCloseTo(10);
    });
});

describe("the highest water of a map", () => {
    const flat = { x: 0, y: 0, width: 40, height: 40 };

    it("is 18 px over the ground unless the map says otherwise", () => {
        const grid = new WaterGrid(undefined, flat);
        grid.layRing(20, 20, -1, 4, 1e6);
        expect(grid.depthAt(20, 20)).toBeCloseTo(MAX_WATER_SURFACE_PX, 3);
    });

    it("can be raised by the map: a flood then stands higher, and the running water keeps it", () => {
        const grid = new WaterGrid(undefined, flat);
        grid.setMaxSurface(120);
        grid.layRing(20, 20, -1, 4, 1e6);
        expect(grid.depthAt(20, 20)).toBeCloseTo(120, 3);
        run(grid, 1);
        // One step lets the pile run to its neighbours, but takes nothing away for standing over 18 px.
        expect(grid.depthAt(20, 20)).toBeGreaterThan(MAX_WATER_SURFACE_PX);
    });

    it("lowered again, loses what stands over it", () => {
        const grid = new WaterGrid(undefined, flat);
        grid.setMaxSurface(120);
        grid.layRing(20, 20, -1, 4, 1e6);
        grid.setMaxSurface(MAX_WATER_SURFACE_PX);
        const tally = grid.step(nothing);
        expect(grid.depthAt(20, 20)).toBeLessThanOrEqual(MAX_WATER_SURFACE_PX + 1e-3);
        expect(tally.lostPx).toBeGreaterThan(0);
    });

    it("never goes under the usual height nor over the highest a map may set", () => {
        const grid = new WaterGrid(undefined, flat);
        grid.setMaxSurface(1);
        expect(grid.maxSurface()).toBe(MAX_WATER_SURFACE_PX);
        grid.setMaxSurface(1e9);
        expect(grid.maxSurface()).toBe(256);
        grid.setMaxSurface(Number.NaN);
        expect(grid.maxSurface()).toBe(MAX_WATER_SURFACE_PX);
    });
});
