import { describe, expect, it } from "vitest";
import {
    capThickness,
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
