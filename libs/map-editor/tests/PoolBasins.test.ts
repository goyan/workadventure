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
        // On a mount, the basin is dug from the top of the mount.
        const raised = withHeights(painted, new Map([[cellKey(10, 10), 30]]));
        expect(heightAt(poolBasins(raised, styles), 10, 10)).toBe(-18);
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
        expect(cells).toContainEqual({ cellX: 10, cellY: 10, depthPx: 48 });
        expect(cells).toContainEqual({ cellX: 20, cellY: 10, depthPx: 24 });
        expect(poolCells(undefined, styles)).toEqual([]);
        expect(POOL_FILL_SECONDS).toBe(8);
        expect(POOL_FREEBOARD_PX).toBeGreaterThan(0);
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
});
