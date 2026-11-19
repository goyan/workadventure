import { describe, expect, it } from "vitest";
import { cellInMap, cellKey, cellOf, dugCells, heightAt, reliefCells, withHeights } from "../src/Terrain/TerrainGrid";
import { TERRAIN_MAX_HEIGHT, TerrainData, WAMFileFormat } from "../src/types";

describe("cellInMap", () => {
    it("holds the cells of the map and none past its edges", () => {
        const map = { width: 100, height: 80 };
        expect(cellInMap(0, 0, map)).toBe(true);
        expect(cellInMap(99, 79, map)).toBe(true);
        expect(cellInMap(100, 79, map)).toBe(false);
        expect(cellInMap(99, 80, map)).toBe(false);
        expect(cellInMap(-1, 0, map)).toBe(false);
        expect(cellInMap(0, -1, map)).toBe(false);
    });

    it("holds every cell while the size of the map is not known", () => {
        expect(cellInMap(-5, 4000, undefined)).toBe(true);
    });
});

describe("terrain grid", () => {
    it("reads 0 outside the relief and the stored height inside", () => {
        const terrain = withHeights(undefined, new Map([[cellKey(3, 20), -24]]));
        expect(heightAt(terrain, 3, 20)).toBe(-24);
        expect(heightAt(terrain, 4, 20)).toBe(0);
        expect(heightAt(undefined, 3, 20)).toBe(0);
        expect(Object.keys(terrain.chunks)).toEqual(["0,1"]);
    });

    it("handles negative cells and drops a chunk back to flat", () => {
        const dug = withHeights(undefined, new Map([[cellKey(-1, -1), -8]]));
        expect(Object.keys(dug.chunks)).toEqual(["-1,-1"]);
        expect(heightAt(dug, -1, -1)).toBe(-8);
        expect(withHeights(dug, new Map([[cellKey(-1, -1), 0]])).chunks).toEqual({});
    });

    it("clamps to the stored range and never changes its argument", () => {
        const before = withHeights(undefined, new Map([[cellKey(0, 0), -8]]));
        const after = withHeights(
            before,
            new Map([
                [cellKey(0, 0), -999],
                [cellKey(1, 0), 999],
            ]),
        );
        expect(heightAt(after, 0, 0)).toBe(-256);
        expect(heightAt(after, 1, 0)).toBe(256);
        expect(heightAt(before, 0, 0)).toBe(-8);
    });

    it("keeps the maximum depth of the map through an edit", () => {
        const terrain = withHeights({ chunks: {}, maxDepthTiles: 5 }, new Map([[cellKey(0, 0), -8]]));
        expect(terrain.maxDepthTiles).toBe(5);
    });

    it("lists the dug cells and reads a cell key back", () => {
        const terrain = withHeights(
            undefined,
            new Map([
                [cellKey(-3, 40), -8],
                [cellKey(2, 2), -16],
            ]),
        );
        expect(dugCells(terrain)).toEqual(
            new Map([
                [cellKey(-3, 40), -8],
                [cellKey(2, 2), -16],
            ]),
        );
        expect(dugCells(undefined).size).toBe(0);
        expect(cellOf(cellKey(-3, 40))).toEqual({ x: -3, y: 40 });
    });

    // A relief written by a modified client or an old file must not make the map unreadable.
    it("keeps a map readable when its relief is broken", () => {
        const wam = { version: "2.1.0", mapUrl: "m.tmj", entities: {}, areas: [], entityCollections: [] };
        for (const terrain of [
            { chunks: { "0,0": [1, 2] } },
            { chunks: { "a,b": new Array<number>(256).fill(0) } },
            { chunks: { "0,0": new Array<number>(256).fill(-9999) } },
            "nonsense",
        ]) {
            const parsed = WAMFileFormat.parse({ ...wam, terrain });
            expect(parsed.terrain).toBeUndefined();
        }
        const fine = WAMFileFormat.parse({ ...wam, terrain: withHeights(undefined, new Map([[cellKey(1, 1), -4]])) });
        expect(heightAt(fine.terrain, 1, 1)).toBe(-4);
    });

    it("keeps the water settings of a map within their bounds", () => {
        const wam = { version: "2.1.0", mapUrl: "m.tmj", entities: {}, areas: [], entityCollections: [] };
        const parsed = WAMFileFormat.parse({ ...wam, settings: { water: { runoff: 10, evaporation: 0.2 } } });
        // A map saved before the speed of the water has the default one.
        expect(parsed.settings?.water).toEqual({
            runoff: 10,
            evaporation: 0.2,
            speed: 60,
            absorption: 5,
            current: 1,
            maxSurface: 18,
        });
        expect(WAMFileFormat.parse({ ...wam, settings: { water: { runoff: -4 } } }).settings?.water).toBeUndefined();
    });
});

describe("relief over the ground", () => {
    it("keeps the height of a raised cell, within the stored range", () => {
        const terrain = withHeights(
            undefined,
            new Map([
                [cellKey(2, 3), 40],
                [cellKey(3, 3), 9999],
            ]),
        );
        expect(heightAt(terrain, 2, 3)).toBe(40);
        expect(heightAt(terrain, 3, 3)).toBe(TERRAIN_MAX_HEIGHT);
        expect(TerrainData.safeParse(terrain).success).toBe(true);
    });

    it("tells the raised cells from the dug ones", () => {
        const terrain = withHeights(
            undefined,
            new Map([
                [cellKey(2, 3), 40],
                [cellKey(5, 3), -8],
            ]),
        );
        expect([...dugCells(terrain).keys()]).toEqual([cellKey(5, 3)]);
        expect(new Map(reliefCells(terrain))).toEqual(
            new Map([
                [cellKey(2, 3), 40],
                [cellKey(5, 3), -8],
            ]),
        );
    });
});
