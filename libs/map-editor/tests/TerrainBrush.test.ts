import { describe, expect, it } from "vitest";
import {
    capThickness,
    discWeight,
    defaultForcePx,
    chunkedChanges,
    MAX_STROKE_CELLS,
    strokeChanges,
} from "../src/Terrain/TerrainBrush";
import { cellKey, cellOf, heightAt, withHeights } from "../src/Terrain/TerrainGrid";
import type { TerrainData } from "../src/types";

// A sphere 4 tiles wide (radius 64 px) pressed by 16 px, at the centre of the cell (12, 12).
const dig = { diameterTiles: 4, forcePx: 16, maxDepthTiles: 2, mode: "dig" as const };
const centre = [{ x: 200, y: 200 }];
const everywhere = (): boolean => true;

describe("terrain brush", () => {
    it("takes a cap off the ground: thickest at the centre, nothing at the rim", () => {
        expect(capThickness(0, 64, 16)).toBe(16);
        expect(capThickness(32, 64, 16)).toBeCloseTo(12);
        expect(capThickness(64, 64, 16)).toBe(0);
        expect(capThickness(90, 64, 16)).toBe(0);
        // By default an eighth of the diameter.
        expect(defaultForcePx(4)).toBe(16);
    });

    it("digs deepest at the centre and leaves the cells beyond the rim", () => {
        const changes = strokeChanges(undefined, centre, dig, everywhere);
        expect(changes.get(cellKey(12, 12))).toBe(-16);
        expect(changes.has(cellKey(17, 12))).toBe(false); // 80 px away, radius 64
        const near = changes.get(cellKey(15, 12)) ?? 0;
        expect(near).toBeLessThan(0);
        expect(near).toBeGreaterThan(-16);
    });

    it("digs a cell once in one stroke, whatever the number of points", () => {
        const once = strokeChanges(undefined, centre, dig, everywhere);
        const still = strokeChanges(undefined, new Array(60).fill(centre[0]), dig, everywhere);
        expect(still).toEqual(once);
    });

    it("digs between two far points of a stroke", () => {
        const changes = strokeChanges(
            undefined,
            [
                { x: 200, y: 200 },
                { x: 600, y: 200 },
            ],
            dig,
            everywhere,
        );
        expect(changes.get(cellKey(25, 12))).toBe(-16);
    });

    it("digs further on a new stroke, down to the maximum depth", () => {
        let terrain: TerrainData | undefined;
        terrain = withHeights(terrain, strokeChanges(terrain, centre, dig, everywhere));
        terrain = withHeights(terrain, strokeChanges(terrain, centre, dig, everywhere));
        expect(heightAt(terrain, 12, 12)).toBe(-32);
        for (let pass = 0; pass < 10; pass++) {
            terrain = withHeights(terrain, strokeChanges(terrain, centre, dig, everywhere));
        }
        expect(heightAt(terrain, 12, 12)).toBe(-64); // 2 tiles
    });

    it("fills back up to the ground, never above", () => {
        const dug = withHeights(undefined, strokeChanges(undefined, centre, dig, everywhere));
        const fill = { ...dig, mode: "fill" as const, forcePx: 64 };
        const filled = withHeights(dug, strokeChanges(dug, centre, fill, everywhere));
        expect(heightAt(filled, 12, 12)).toBe(0);
        expect(strokeChanges(undefined, centre, fill, everywhere).size).toBe(0);
    });

    it("leaves the cells that may not be dug", () => {
        const changes = strokeChanges(undefined, centre, dig, (x) => x < 12);
        expect(changes.size).toBeGreaterThan(0);
        expect([...changes.keys()].every((key) => cellOf(key).x < 12)).toBe(true);
    });

    it("does not raise what is already deeper than the maximum", () => {
        const deep = withHeights(undefined, new Map([[cellKey(12, 12), -200]]));
        expect(strokeChanges(deep, centre, dig, everywhere).has(cellKey(12, 12))).toBe(false);
    });

    it("gives no change for an empty stroke or a broken brush", () => {
        expect(strokeChanges(undefined, [], dig, everywhere).size).toBe(0);
        expect(strokeChanges(undefined, centre, { ...dig, diameterTiles: Number.NaN }, everywhere).size).toBe(0);
        expect(strokeChanges(undefined, centre, { ...dig, forcePx: -5 }, everywhere).size).toBe(0);
    });

    // A drag across the whole map must still be sent, in commands of a bounded size.
    it("cuts the changes of a huge stroke into commands of a bounded size, losing no cell", () => {
        const big = { ...dig, diameterTiles: 12 };
        const changes = strokeChanges(
            undefined,
            [
                { x: 0, y: 0 },
                { x: 20000, y: 0 },
            ],
            big,
            everywhere,
        );
        expect(changes.size).toBeGreaterThan(MAX_STROKE_CELLS);
        const parts = chunkedChanges(changes);
        expect(parts.length).toBe(Math.ceil(changes.size / MAX_STROKE_CELLS));
        for (const part of parts) expect(part.size).toBeLessThanOrEqual(MAX_STROKE_CELLS);
        expect(new Map(parts.flatMap((part) => [...part]))).toEqual(changes);
        // A usual stroke is one command; no change, no command.
        expect(chunkedChanges(strokeChanges(undefined, centre, dig, everywhere))).toHaveLength(1);
        expect(chunkedChanges(new Map())).toEqual([]);
    });
});

// Flattening towards 20 px under the ground, 16 px at most by stroke, with the same sphere.
const flatten = { diameterTiles: 4, forcePx: 16, maxDepthTiles: 2, mode: "flatten" as const, targetPx: -20 };
const smooth = { diameterTiles: 4, forcePx: 32, maxDepthTiles: 2, mode: "smooth" as const };

describe("terrain brush, flattening", () => {
    it("weighs the whole middle of the disc the same, down to nothing at the rim", () => {
        expect(discWeight(0, 64)).toBe(1);
        expect(discWeight(32, 64)).toBe(1);
        expect(discWeight(48, 64)).toBeCloseTo(0.875);
        expect(discWeight(64, 64)).toBe(0);
        expect(discWeight(90, 64)).toBe(0);
    });

    it("brings the ground towards the level asked, a force at most by stroke, and stops there", () => {
        const first = strokeChanges(undefined, centre, flatten, everywhere);
        expect(first.get(cellKey(12, 12))).toBe(-16);
        // 32 px away: as much as at the centre, so the bottom is flat. 48 px away: less, so the bank is a slope.
        expect(first.get(cellKey(14, 12))).toBe(-16);
        expect(first.get(cellKey(15, 12))).toBe(-14);
        const second = strokeChanges(withHeights(undefined, first), centre, flatten, everywhere);
        expect(second.get(cellKey(12, 12))).toBe(-20);
        const third = strokeChanges(withHeights(withHeights(undefined, first), second), centre, flatten, everywhere);
        expect(third.has(cellKey(12, 12))).toBe(false);
    });

    it("fills what is deeper than the level asked", () => {
        const terrain = withHeights(undefined, new Map([[cellKey(12, 12), -40]]));
        expect(strokeChanges(terrain, centre, flatten, everywhere).get(cellKey(12, 12))).toBe(-24);
    });

    it("never digs under the maximum depth of the map, nor where the ground may not be dug", () => {
        const deep = { ...flatten, targetPx: -100 };
        const terrain = withHeights(undefined, new Map([[cellKey(12, 12), -60]]));
        expect(strokeChanges(terrain, centre, deep, everywhere).get(cellKey(12, 12))).toBe(-64);
        expect(strokeChanges(undefined, centre, flatten, () => false).size).toBe(0);
    });

    it("does nothing without a level to reach", () => {
        expect(strokeChanges(undefined, centre, { ...flatten, targetPx: undefined }, everywhere).size).toBe(0);
    });
});

describe("terrain brush, smoothing", () => {
    it("leaves level ground as it is", () => {
        expect(strokeChanges(undefined, centre, smooth, everywhere).size).toBe(0);
    });

    it("brings a cell to the mean of itself and its eight neighbours", () => {
        const terrain = withHeights(undefined, new Map([[cellKey(12, 12), -27]]));
        const changes = strokeChanges(terrain, centre, smooth, everywhere);
        expect(changes.get(cellKey(12, 12))).toBe(-3);
        expect(changes.get(cellKey(13, 12))).toBe(-3);
        // Two cells away, the pit is not a neighbour.
        expect(changes.has(cellKey(14, 12))).toBe(false);
    });

    it("goes half the way at half the full force", () => {
        const terrain = withHeights(undefined, new Map([[cellKey(12, 12), -27]]));
        const changes = strokeChanges(terrain, centre, { ...smooth, forcePx: 16 }, everywhere);
        expect(changes.get(cellKey(12, 12))).toBe(-15);
    });
});

// The same sphere, adding matter: up to 2 tiles over the ground of a map set to 2 tiles.
const raise = { diameterTiles: 4, forcePx: 16, maxDepthTiles: 2, mode: "raise" as const };

describe("terrain brush, raising", () => {
    it("raises a mount over the ground: highest at the centre, nothing beyond the rim", () => {
        const changes = strokeChanges(undefined, centre, raise, everywhere);
        expect(changes.get(cellKey(12, 12))).toBe(16);
        expect(changes.has(cellKey(17, 12))).toBe(false);
        const near = changes.get(cellKey(15, 12)) ?? 0;
        expect(near).toBeGreaterThan(0);
        expect(near).toBeLessThan(16);
    });

    it("raises further on a new stroke, up to the maximum height of the map", () => {
        let terrain: TerrainData | undefined;
        for (let stroke = 0; stroke < 6; stroke++) {
            terrain = withHeights(terrain, strokeChanges(terrain, centre, raise, everywhere));
        }
        expect(heightAt(terrain, 12, 12)).toBe(64);
    });

    it("fills a hollow then goes on over the ground", () => {
        const terrain = withHeights(undefined, new Map([[cellKey(12, 12), -10]]));
        expect(strokeChanges(terrain, centre, raise, everywhere).get(cellKey(12, 12))).toBe(6);
    });

    it("digs a mount back down, and flattens the ground towards a level over it", () => {
        const mount = withHeights(undefined, new Map([[cellKey(12, 12), 40]]));
        expect(strokeChanges(mount, centre, dig, everywhere).get(cellKey(12, 12))).toBe(24);
        const plateau = { ...flatten, targetPx: 30 };
        expect(strokeChanges(mount, centre, plateau, everywhere).get(cellKey(12, 12))).toBe(30);
        expect(strokeChanges(undefined, centre, plateau, everywhere).get(cellKey(12, 12))).toBe(16);
        // Never over the maximum height of the map.
        const high = withHeights(undefined, new Map([[cellKey(12, 12), 60]]));
        expect(strokeChanges(high, centre, { ...flatten, targetPx: 200 }, everywhere).get(cellKey(12, 12))).toBe(64);
    });

    it("leaves the cells that may not be raised", () => {
        expect(strokeChanges(undefined, centre, raise, () => false).size).toBe(0);
    });
});
