import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { currentPush, sweptShare, waterCurrentAt } from "../../../../../src/front/Phaser/Game/Terrain/WaterCurrent";

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

describe("the current of a water whose speed the server tells", () => {
    /** Level water `depth` px deep running at `x`, `y` cells a second: its surface says nothing of it. */
    const running = (depth: number, x: number, y = 0) => ({ ...waterOf(() => depth), speedAt: () => ({ x, y }) });

    it("carries who floats at the very speed of the water, whatever its surface looks like", () => {
        // 30 px deep (one swims), 5 cells a second towards the east: 80 map pixels a second.
        const push = currentPush(running(30, 5), 8, 8, 0, 1, 180);
        expect(push.x).toBeCloseTo(80, 5);
        expect(push.y).toBe(0);
        // Faster than one walks under the wave of a tsunami.
        expect(currentPush(running(30, 15), 8, 8, 0, 1, 180).x).toBeGreaterThan(180);
        // The strength of the map still weighs on it, and nothing in water at rest.
        expect(currentPush(running(30, 5), 8, 8, 0, 0.5, 180).x).toBeCloseTo(40, 5);
        expect(currentPush(running(30, 0.1), 8, 8, 0, 1, 180)).toEqual({ x: 0, y: 0 });
        expect(currentPush(running(30, 5), 8, 8, 0, 0, 180)).toEqual({ x: 0, y: 0 });
    });

    it("leaves on their feet who stands in a thin sheet, and sweeps them along as the water takes their footing", () => {
        // 8 px of water (27 cm) at 2 cells a second (1.1 m/s): 0.3 m²/s, one keeps one's footing.
        expect(currentPush(running(8, 2), 8, 8, 0, 1, 180)).toEqual({ x: 0, y: 0 });
        // The same sheet at 8 cells a second (4.4 m/s): 1.2 m²/s, swept along at the speed of the water.
        expect(currentPush(running(8, 8), 8, 8, 0, 1, 180).x).toBeCloseTo(8 * 16, 0);
        // In between, by as much.
        const half = currentPush(running(8, 5.33), 8, 8, 0, 1, 180).x;
        expect(half).toBeGreaterThan(0);
        expect(half).toBeLessThan(5.33 * 16);
    });

    it("gives the foam its way and its strength", () => {
        const current = waterCurrentAt(running(30, 0, 1.5), 8, 8, 0);
        expect(current.x).toBeCloseTo(0, 5);
        expect(current.y).toBeCloseTo(0.5, 5);
        // Never more than all of it.
        expect(waterCurrentAt(running(30, 20), 8, 8, 0).x).toBeCloseTo(1, 5);
    });
});

describe("sweptShare", () => {
    it("is nothing under 0.4 m²/s, everything from 1.2 m²/s on", () => {
        // A pixel of water is 3.42 cm, a cell a second 0.548 m/s.
        expect(sweptShare(8, 2)).toBe(0);
        expect(sweptShare(0, 30)).toBe(0);
        expect(sweptShare(15, 8)).toBe(1);
        const between = sweptShare(12, 4);
        expect(between).toBeGreaterThan(0);
        expect(between).toBeLessThan(1);
    });
});
