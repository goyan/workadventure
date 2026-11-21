import {
    cellKey,
    DEFAULT_POOL_STYLE,
    poolBasins,
    poolSoilCode,
    withHeights,
    withSoils,
} from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { currentPush, waterCurrentAt } from "../../../../../src/front/Phaser/Game/Terrain/WaterCurrent";

/** Water and relief given cell by cell: `depth(x, y)` pixels of water, `ground(x, y)` the height of the ground. */
function waterOf(depth: (x: number, y: number) => number, ground: (x: number, y: number) => number = () => -64) {
    const cells = new Map<string, number>();
    for (let y = -6; y <= 6; y++)
        for (let x = -6; x <= 6; x++) if (ground(x, y) < 0) cells.set(cellKey(x, y), ground(x, y));
    const terrain: TerrainData = withHeights(undefined, cells);
    return {
        relief: () => terrain,
        depthAt: (x: number, y: number) => Math.max(0, depth(Math.floor(x / 16), Math.floor(y / 16))),
    };
}
// The middle of the cell (0, 0).
const HERE = { x: 8, y: 8 };
const at = (water: ReturnType<typeof waterOf>) => waterCurrentAt(water, HERE.x, HERE.y, 0);

describe("waterCurrentAt", () => {
    it("is nothing in still water, and without water", () => {
        expect(at(waterOf(() => 30))).toEqual({ x: 0, y: 0 });
        expect(at(waterOf(() => 0))).toEqual({ x: 0, y: 0 });
        expect(waterCurrentAt(undefined, 8, 8, 0)).toEqual({ x: 0, y: 0 });
    });

    it("goes where the surface of the water goes down, harder on a steeper slope, never more than all of it", () => {
        // The surface loses 1 px a cell towards the east: half of the full push (2 px a cell).
        const gentle = at(waterOf((x) => 30 - x));
        expect(gentle.x).toBeCloseTo(0.5, 5);
        expect(gentle.y).toBeCloseTo(0, 5);
        const steep = at(waterOf((x) => 30 - 4 * x));
        expect(steep.x).toBeCloseTo(1, 5);
        // Towards the north-west, as hard on each axis: the whole push is still 1 at most.
        const diagonal = at(waterOf((x, y) => 30 + 4 * x + 4 * y));
        expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 5);
        expect(diagonal.x).toBeLessThan(0);
        expect(diagonal.y).toBeLessThan(0);
    });

    it("leaves alone a slope too slight to be a current: water coming to rest", () => {
        expect(at(waterOf((x) => 30 - 0.05 * x))).toEqual({ x: 0, y: 0 });
    });

    it("does not carry one who walks in shallow water, carries by half one who wades, fully one who swims", () => {
        const slope = (depth: number) => at(waterOf((x) => depth - x)).x;
        expect(slope(6)).toBe(0);
        expect(slope(12)).toBeCloseTo(0.25, 5);
        expect(slope(16)).toBeCloseTo(0.5, 5);
    });

    it("is not pushed away from a bank: dry ground higher than the water is not a slope", () => {
        // A lake whose east bank (flat ground, dry) begins at the cell 1.
        const lake = waterOf(
            (x) => (x >= 1 ? 0 : 30),
            (x) => (x >= 1 ? 0 : -64),
        );
        expect(at(lake)).toEqual({ x: 0, y: 0 });
    });

    // Seen in the game: swimming in a flood, one was carried to its shore all the time.
    it("is not carried to the shore of a flood: flat ground, dry or barely wet, is not where the water falls", () => {
        // A flood 18 px deep over flat ground, dry from the cell 1 on.
        const dryShore = waterOf(
            (x) => (x >= 1 ? 0 : 18),
            () => 0,
        );
        expect(at(dryShore)).toEqual({ x: 0, y: 0 });
        // The same flood thinning out towards its edge: 18 px here, then a film too thin to carry anyone.
        const thinEdge = waterOf(
            (x) => (x >= 1 ? 5 : 18),
            () => 0,
        );
        expect(at(thinEdge)).toEqual({ x: 0, y: 0 });
    });

    it("is drawn towards a drop: dry ground lower than the water, where it falls", () => {
        // East of the cell 0 the ground is dug deeper and still dry: the water pours there.
        const fall = waterOf(
            (x) => (x >= 1 ? 0 : 30),
            (x) => (x >= 1 ? -128 : -64),
        );
        expect(at(fall).x).toBeCloseTo(1, 5);
    });
});

describe("currentPush", () => {
    it("is the current times a quarter of the walking speed and the strength set for the map", () => {
        const river = waterOf((x) => 30 - x);
        // Half of the hardest current: an eighth of the walking speed.
        expect(currentPush(river, 8, 8, 0, 1, 180).x).toBeCloseTo(22.5, 3);
        expect(currentPush(river, 8, 8, 0, 2, 180).x).toBeCloseTo(45, 3);
        expect(currentPush(river, 8, 8, 0, 0, 180)).toEqual({ x: 0, y: 0 });
        expect(currentPush(river, 8, 8, 0, Number.NaN, 180)).toEqual({ x: 0, y: 0 });
    });
});

describe("the water of a pool", () => {
    // A pool of 9 × 9 cells on a flat ground, full to its rim: 46 px of water over its basin of 48.
    const soils = new Map<string, number>();
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) soils.set(cellKey(x, y), poolSoilCode(0));
    const painted = withSoils(undefined, soils);
    const inPool = (x: number, y: number): boolean => Math.abs(x) <= 4 && Math.abs(y) <= 4;
    const depthAt = (x: number, y: number): number => (inPool(Math.floor(x / 16), Math.floor(y / 16)) ? 46 : 0);

    it("is still when the pool is full: its surface is read over its basin, not over the flat ground drawn", () => {
        const water = { relief: () => painted, basin: () => poolBasins(painted, [DEFAULT_POOL_STYLE]), depthAt };
        // Two cells from the east wall of the pool.
        const current = waterCurrentAt(water, 2 * 16 + 8, 8, 0);
        expect(current.x).toBeCloseTo(0);
        expect(current.y).toBeCloseTo(0);
    });
});
