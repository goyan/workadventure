import { describe, expect, it } from "vitest";
import {
    DEFAULT_POOL_STYLE,
    POOL_FILL_SECONDS,
    POOL_FREEBOARD_PX,
    poolBasins,
    poolCells,
    poolSoilCode,
} from "../src/Terrain/Pools";
import { cellKey, heightAt, soilAt, withHeights, withSoils } from "../src/Terrain/TerrainGrid";
import { gridBoundsOf, WaterGrid } from "../src/Terrain/WaterGrid";

/** A pool of 4 × 2 cells of the first style at (10, 10), and one cell of the second style at (20, 10). */
const painted = withSoils(
    undefined,
    new Map([
        ...[0, 1, 2, 3].flatMap((x) => [0, 1].map((y): [string, number] => [cellKey(10 + x, 10 + y), poolSoilCode(0)])),
        [cellKey(20, 10), poolSoilCode(1)],
    ]),
);
const styles = [DEFAULT_POOL_STYLE, { ...DEFAULT_POOL_STYLE, depthPx: 24, hot: true }];

describe("the basins of the pools", () => {
    it("digs each cell of a pool as deep as its style, under the ground it is painted on", () => {
        const basins = poolBasins(painted, styles);
        expect(heightAt(basins, 10, 10)).toBe(-48);
        expect(heightAt(basins, 13, 11)).toBe(-48);
        expect(heightAt(basins, 20, 10)).toBe(-24);
        expect(heightAt(basins, 14, 10)).toBe(0);
        // The soils are kept: a pool is still a pool.
        expect(soilAt(basins, 10, 10)).toBe(poolSoilCode(0));
        // A cell of the pool on a bump of the ground: the floor of the pool is flat, under its rim.
        const bumped = withHeights(painted, new Map([[cellKey(10, 10), 30]]));
        expect(heightAt(poolBasins(bumped, styles), 10, 10)).toBe(-48);
    });

    it("digs the default style on a map that keeps none, and nothing on a map without pools", () => {
        expect(heightAt(poolBasins(painted, undefined), 20, 10)).toBe(-48);
        const plain = withHeights(undefined, new Map([[cellKey(1, 1), -5]]));
        expect(poolBasins(plain, styles)).toBe(plain);
        expect(poolBasins(undefined, styles)).toBeUndefined();
    });

    it("is the same relief for the same map and the same styles: read once", () => {
        expect(poolBasins(painted, styles)).toBe(poolBasins(painted, styles));
        expect(poolBasins(painted, [...styles])).not.toBe(poolBasins(painted, styles));
    });

    it("lists the cells of the pools with their depth, for the pump that fills them", () => {
        const cells = poolCells(painted, styles);
        expect(cells).toHaveLength(9);
        expect(cells).toContainEqual({ cellX: 10, cellY: 10, depthPx: 48, fullPx: 48 - POOL_FREEBOARD_PX });
        expect(cells).toContainEqual({ cellX: 20, cellY: 10, depthPx: 24, fullPx: 24 - POOL_FREEBOARD_PX });
        expect(poolCells(undefined, styles)).toEqual([]);
        expect(POOL_FILL_SECONDS).toBe(8);
        expect(POOL_FREEBOARD_PX).toBeGreaterThan(0);
    });

    it("gives a pool one level, under the lowest ground around it: on a slope it does not run over its low side", () => {
        // The ground is 10 px high on the west of the pool, flat on the east, 6 px lower along its south side.
        const heights = new Map<string, number>();
        for (let y = 8; y <= 13; y++) for (let x = 6; x <= 11; x++) heights.set(cellKey(x, y), 10);
        for (let x = 9; x <= 14; x++) heights.set(cellKey(x, 12), -6);
        const sloped = withHeights(painted, heights);
        const basins = poolBasins(sloped, styles);
        // One flat floor, 48 px under the lowest rim (-6).
        for (const [x, y] of [
            [10, 10],
            [11, 11],
            [13, 10],
        ]) {
            expect(heightAt(basins, x, y)).toBe(-54);
        }
        const cells = poolCells(sloped, styles).filter((cell) => cell.cellY < 12 && cell.cellX < 15);
        expect(cells).toHaveLength(8);
        // Full, every cell holds the same water: its surface is level, a little under that lowest rim.
        for (const cell of cells) expect(cell.fullPx).toBe(48 - POOL_FREEBOARD_PX);
        // The ground around is left as it is.
        expect(heightAt(basins, 9, 10)).toBe(10);
        expect(heightAt(basins, 12, 12)).toBe(-6);
    });

    it("keeps two pools that do not touch apart: each has its own rim", () => {
        const heights = new Map([[cellKey(21, 10), -10]]);
        const basins = poolBasins(withHeights(painted, heights), styles);
        expect(heightAt(basins, 10, 10)).toBe(-48);
        // The second pool (24 px deep) stands by a ditch 10 px deep: its floor is under the ditch.
        expect(heightAt(basins, 20, 10)).toBe(-34);
    });

    it("makes a hollow the water of the relief stands in, sealed: its floor drinks nothing", () => {
        const basins = poolBasins(painted, styles);
        const bounds = gridBoundsOf(basins, [], { width: 60, height: 40 });
        expect(bounds).toBeDefined();
        const grid = new WaterGrid(basins, bounds);
        grid.rainOn(11, 10, 0, 20);
        const step = { rainPx: 0, evaporationPx: 0, absorptionPx: 5, flows: [] };
        for (let turn = 0; turn < 50; turn++) grid.step(step);
        let held = 0;
        for (let x = 10; x < 14; x++) for (let y = 10; y < 12; y++) held += grid.depthAt(x, y);
        // The 20 px poured on one cell spread over the eight of the pool, and none left it nor sank into its floor.
        expect(held).toBeCloseTo(20, 1);
        expect(grid.depthAt(14, 10)).toBe(0);
    });

    it("takes the rain that falls on it only: its coping keeps the runoff of the ground around out", () => {
        const basins = poolBasins(painted, styles);
        const lake = withHeights(basins, new Map([[cellKey(30, 10), -20]]));
        const bounds = gridBoundsOf(lake, [], { width: 60, height: 40 });
        const grid = new WaterGrid(lake, bounds);
        grid.seal(poolCells(painted, styles));
        // A rain of 1 px a step with the runoff, of which 0.1 px falls on the cell itself.
        grid.step({ rainPx: 1, sealedRainPx: 0.1, evaporationPx: 0, absorptionPx: 0, flows: [] });
        expect(grid.depthAt(11, 10)).toBeCloseTo(0.1);
        expect(grid.depthAt(30, 10)).toBeCloseTo(1);
        // Without the share of the sealed cells, a pool takes the rain as any hollow.
        const plain = new WaterGrid(lake, bounds);
        plain.seal(poolCells(painted, styles));
        plain.step({ rainPx: 1, evaporationPx: 0, absorptionPx: 0, flows: [] });
        expect(plain.depthAt(11, 10)).toBeCloseTo(1);
    });
});
