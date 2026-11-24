import { describe, expect, it } from "vitest";
import {
    BALL_LEVEL_REACH_CELLS,
    BallLevels,
    cellKey,
    WaterGrid,
    waterBodiesOf,
    WaterSnapshot,
    WaterSnapshotView,
    withHeights,
} from "../src";
import type { TerrainData, WaterStepInput, WaterView } from "../src";

const SIDE = 40;
const bounds = { x: -3, y: 5, width: SIDE, height: SIDE };
// A lake with a sloping shore, a mound, and flat ground around.
const heights = new Map<string, number>();
for (let y = 8; y < 30; y++) {
    for (let x = 0; x < 22; x++) {
        const edge = Math.min(x, y - 8, 21 - x, 29 - y);
        heights.set(cellKey(x, y), -Math.min(40, 6 * (edge + 1)));
    }
}
for (let y = 32; y < 40; y++) for (let x = 26; x < 34; x++) heights.set(cellKey(x, y), 12);
const terrain: TerrainData = withHeights(undefined, heights);
const walls = { east: new Set([cellKey(10, 12), cellKey(10, 13), cellKey(10, 14)]), south: new Set([cellKey(4, 20)]) };
const rain: WaterStepInput = {
    rainPx: 0.4,
    evaporationPx: 0,
    absorptionPx: 0,
    flows: [{ cellX: 5, cellY: 12, px: 30, radius: 2 }],
    inertia: true,
    seconds: 0.1,
};
const SIDES = ["east", "west", "south", "north"] as const;

/** Everything a reader can ask of a water, cell by cell (and past the edges of the grid). */
function answers(water: WaterView): number[] {
    const all: number[] = [];
    for (let y = bounds.y - 1; y <= bounds.y + SIDE; y++) {
        for (let x = bounds.x - 1; x <= bounds.x + SIDE; x++) {
            all.push(water.depthAt(x, y));
            for (const side of SIDES) all.push(water.canCross(x, y, side) ? 1 : 0);
            all.push(water.restLevelAt(x, y) ?? -9999);
            // Read around a ball: a search over the water around, costly, so one cell out of nine.
            if (x % 3 === 0 && y % 3 === 0) all.push(water.restLevelAt(x, y, BALL_LEVEL_REACH_CELLS) ?? -9999);
        }
    }
    return all;
}

function lake(): WaterGrid {
    const grid = new WaterGrid(terrain, bounds, undefined, walls);
    for (let step = 0; step < 60; step++) grid.step(rain);
    return grid;
}

describe("WaterSnapshotView", () => {
    for (const shared of [false, true]) {
        it(`answers as the grid it was taken from does (${shared ? "shared" : "own"} memory)`, () => {
            const grid = lake();
            const snapshot = WaterSnapshot.allocate(grid.bounds, shared);
            // The reader is over the same memory, as on another thread.
            const view = new WaterSnapshotView(WaterSnapshot.over(grid.bounds, snapshot.buffers));
            expect(view.refresh()).toBe(false);

            grid.publish(snapshot, 1);
            expect(view.refresh()).toBe(true);
            expect(view.refresh()).toBe(false);
            expect(view.version()).toBe(1);
            expect(answers(view)).toEqual(answers(grid));

            // The water moves on, a door closes, a ball comes, moves and goes: the view follows at each publication.
            const changes: (() => void)[] = [
                () => grid.step(rain),
                () => grid.setClosedDoors({ east: new Set([cellKey(6, 15), cellKey(6, 16)]), south: new Set() }),
                () => grid.setBalls([{ x: 8 * 16, y: 18 * 16, radiusPx: 40, levelPx: -10 }]),
                () => grid.step(rain),
                () => grid.setBalls([{ x: 10 * 16, y: 18 * 16, radiusPx: 40, levelPx: -10 }]),
                () => grid.step(rain),
                () => grid.setClosedDoors(undefined),
                () => grid.setBalls([]),
                () => grid.step(rain),
            ];
            let version = 1;
            for (const change of changes) {
                change();
                const before = answers(view);
                grid.publish(snapshot, ++version);
                // Until it is refreshed the view holds the state it took: a reader sees one water from end to end.
                expect(answers(view)).toEqual(before);
                expect(view.refresh()).toBe(true);
                expect(view.version()).toBe(version);
                expect(answers(view)).toEqual(answers(grid));
            }
        }, 60_000);
    }

    it("gives the life of the water the same bodies of water as the grid", () => {
        const grid = lake();
        const snapshot = WaterSnapshot.allocate(grid.bounds);
        grid.publish(snapshot, 1);
        const view = new WaterSnapshotView(snapshot);
        view.refresh();
        const ofView = waterBodiesOf(view);
        const ofGrid = waterBodiesOf(grid);
        // What they hold but their functions, then what the functions answer, cell by cell.
        expect(JSON.stringify(ofView)).toBe(JSON.stringify(ofGrid));
        expect(ofGrid.sizes.length).toBeGreaterThan(0);
        for (let y = bounds.y; y < bounds.y + SIDE; y++) {
            for (let x = bounds.x; x < bounds.x + SIDE; x++) {
                for (const depth of [1, 8, 20]) {
                    expect(ofView.swimmable(x, y, depth)).toBe(ofGrid.swimmable(x, y, depth));
                }
            }
        }
    });

    it("holds a ball at the same level as the grid does", () => {
        const grid = lake();
        const snapshot = WaterSnapshot.allocate(grid.bounds);
        const view = new WaterSnapshotView(snapshot);
        const onGrid = new BallLevels();
        const onView = new BallLevels();
        for (let move = 0; move < 30; move++) {
            const x = 3 * 16 + move * 9;
            const y = 15 * 16 + move * 5;
            const level = onGrid.levelAt(1, x, y, grid, () => terrain);
            grid.publish(snapshot, move);
            view.refresh();
            expect(onView.levelAt(1, x, y, view, () => terrain)).toBe(level);
            grid.setBalls([{ x, y, radiusPx: 32, levelPx: level }]);
            grid.step(rain);
        }
    });
});

describe("WaterGrid.crossings", () => {
    /** A flat grid of 6 × 1 cells, each under `px` of water. */
    function flat(px: number[]): WaterGrid {
        const grid = new WaterGrid(undefined, { x: 0, y: 0, width: px.length, height: 1 });
        const bytes = new Uint8Array(px.length * 2);
        px.forEach((depth, cell) => {
            const eighths = Math.round(depth * 8);
            bytes[cell * 2] = eighths & 255;
            bytes[cell * 2 + 1] = eighths >> 8;
        });
        grid.readDepths(bytes);
        return grid;
    }

    it("goes up only when a cell crossed a depth the life reads its places by", () => {
        const grid = flat([0, 1, 5, 10, 20, 30]);
        const start = grid.crossings();
        // More water, no depth crossed: 1 → 1.5, 5 → 7, 10 → 15, 20 → 40.
        grid.rainOn(1, 0, 0, 0.5);
        grid.rainOn(2, 0, 0, 2);
        grid.rainOn(3, 0, 0, 5);
        grid.rainOn(4, 0, 0, 20);
        expect(grid.crossings()).toEqual(start);
        // Over the film (2 px): the land and its shores, not the bodies of water.
        grid.rainOn(1, 0, 0, 1);
        expect(grid.crossings()).toEqual({ swim: start.swim, land: start.land + 1 });
        // Deep enough for a fish (8 px): the bodies of water, not the land.
        grid.rainOn(2, 0, 0, 2);
        expect(grid.crossings()).toEqual({ swim: start.swim + 1, land: start.land + 1 });
        // Deep enough for a dolphin, too deep to wade (16 px): both.
        grid.rainOn(3, 0, 0, 2);
        expect(grid.crossings()).toEqual({ swim: start.swim + 2, land: start.land + 2 });
        // Asked again without any change: the same numbers.
        expect(grid.crossings()).toEqual({ swim: start.swim + 2, land: start.land + 2 });
    });

    it("goes up for the bodies of water when a door closes or opens", () => {
        const grid = flat([20, 20, 20, 20]);
        const start = grid.crossings();
        grid.setClosedDoors({ east: new Set([cellKey(1, 0)]), south: new Set() });
        expect(grid.crossings()).toEqual({ swim: start.swim + 1, land: start.land });
        grid.setClosedDoors(undefined);
        expect(grid.crossings()).toEqual({ swim: start.swim + 2, land: start.land });
    });

    it("is told with the copy of the water, as of the copy", () => {
        const grid = flat([0, 5, 20]);
        const snapshot = WaterSnapshot.allocate(grid.bounds);
        const view = new WaterSnapshotView(snapshot);
        grid.publish(snapshot, 1);
        view.refresh();
        const start = view.crossings();
        grid.rainOn(1, 0, 0, 4);
        // Not published yet: the copy still says what it held.
        expect(view.crossings()).toEqual(start);
        grid.publish(snapshot, 2);
        expect(view.crossings()).toEqual(start);
        view.refresh();
        expect(view.crossings()).toEqual({ swim: start.swim + 1, land: start.land });
        expect(view.depthAt(1, 0)).toBe(9);
    });
});
