import { describe, expect, it, vi } from "vitest";
import { cellKey, heightAt, poolSoilCode, withHeights, withSoils } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import {
    depthsSeen,
    FlatGround,
    SeenRelief,
    seenTerrain,
} from "../../../../../src/front/Phaser/Game/Terrain/BuiltGround";
import { groundDropOf } from "../../../../../src/front/Phaser/Game/Terrain/GroundDrop";

const MAP = { columns: 60, rows: 60 };

/** A plateau raised 112 px over the cells 0 to 39, both ways. */
function plateau(): TerrainData {
    const cells = new Map<string, number>();
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) cells.set(cellKey(x, y), 112);
    return withHeights(undefined, cells);
}

describe("the ground that is built, kept flat where the relief is seen in 3/4", () => {
    it("is a tile paved with the Carte tool: its four cells, and the cells around them", () => {
        const flat = FlatGround.of({ ...MAP, pavedTiles: ["5,5"] });
        // The tile (5, 5) of 32 px: the cells 10 and 11.
        for (const cell of [10, 11]) expect(flat.has(cell, cell)).toBe(true);
        // One cell around: the ground is drawn straight between the centres of the cells, and must be flat all over
        // the tile.
        expect(flat.has(9, 9)).toBe(true);
        expect(flat.has(12, 12)).toBe(true);
        expect(flat.has(8, 10)).toBe(false);
        expect(flat.has(13, 11)).toBe(false);
        expect(flat.isFlatAt(170, 170)).toBe(true);
        expect(flat.isFlatAt(100, 100)).toBe(false);
    });

    it("is the inside of a building", () => {
        const flat = FlatGround.of({ ...MAP, pavedTiles: [], isIndoorAt: (x, y) => x >= 320 && x < 352 && y < 64 });
        expect(flat.has(20, 0)).toBe(true);
        expect(flat.has(21, 3)).toBe(true);
        expect(flat.has(22, 4)).toBe(true);
        expect(flat.has(23, 0)).toBe(false);
        expect(flat.has(20, 5)).toBe(false);
    });

    it("is a pool: one placed as an image, one painted with the relief tool", () => {
        const painted = withSoils(undefined, new Map([[cellKey(30, 30), poolSoilCode(0)]]));
        const flat = FlatGround.of({
            ...MAP,
            pavedTiles: [],
            pools: [{ x: 100, y: 100, width: 40, height: 20 }],
            terrain: painted,
        });
        // The image covers the cells 6 to 8 across, 6 and 7 down.
        expect(flat.has(6, 6)).toBe(true);
        expect(flat.has(8, 7)).toBe(true);
        expect(flat.has(9, 8)).toBe(true);
        expect(flat.has(10, 7)).toBe(false);
        expect(flat.has(30, 30)).toBe(true);
        expect(flat.has(31, 31)).toBe(true);
        expect(flat.has(32, 30)).toBe(false);
    });

    it("is nowhere out of the map, nor on a map where nothing is built", () => {
        const flat = FlatGround.of({ ...MAP, pavedTiles: ["0,0", "29,29"] });
        expect(flat.has(-1, 0)).toBe(false);
        expect(flat.has(60, 59)).toBe(false);
        expect(FlatGround.of({ ...MAP, pavedTiles: [] }).isEmpty()).toBe(true);
        expect(flat.isEmpty()).toBe(false);
    });
});

describe("the relief as it is seen in 3/4", () => {
    it("is flat under what is built, and itself around", () => {
        const terrain = plateau();
        // A terrace of two tiles on the plateau.
        const flat = FlatGround.of({ ...MAP, pavedTiles: ["5,5", "6,5"] });
        const seen = seenTerrain(terrain, flat);
        expect(heightAt(seen, 10, 10)).toBe(0);
        expect(heightAt(seen, 13, 11)).toBe(0);
        expect(heightAt(seen, 9, 9)).toBe(0);
        expect(heightAt(seen, 20, 20)).toBe(112);
        // The map itself is not touched.
        expect(heightAt(terrain, 10, 10)).toBe(112);
    });

    it("draws what stands anywhere on a paved tile at its place, and what stands on the lawn around higher", () => {
        const seen = seenTerrain(plateau(), FlatGround.of({ ...MAP, pavedTiles: ["5,5"] }));
        // The tile (5, 5): from 160 to 192, its corners and its edges included.
        for (const [x, y] of [
            [160, 160],
            [191, 160],
            [160, 191],
            [191, 191],
            [176, 176],
        ]) {
            expect(groundDropOf(seen, x, y)).toBe(0);
        }
        expect(groundDropOf(seen, 400, 400)).toBe(-56);
        // And the real relief would have raised it.
        expect(groundDropOf(plateau(), 176, 176)).toBe(-56);
    });

    it("is the relief of the map itself where nothing built stands on a relief", () => {
        const terrain = plateau();
        expect(seenTerrain(terrain, FlatGround.of({ ...MAP, pavedTiles: [] }))).toBe(terrain);
        // Paved, on flat ground.
        expect(seenTerrain(terrain, FlatGround.of({ ...MAP, pavedTiles: ["25,25"] }))).toBe(terrain);
        expect(seenTerrain(undefined, FlatGround.of({ ...MAP, pavedTiles: ["5,5"] }))).toBeUndefined();
    });
});

describe("the relief seen, kept while nothing changes", () => {
    it("is worked out once, again when the relief or what is built changes, looked at twice a second", () => {
        let terrain = plateau();
        let signature = "a";
        const build = vi.fn(() => FlatGround.of({ ...MAP, pavedTiles: signature === "a" ? ["5,5"] : ["5,5", "8,8"] }));
        const seen = new SeenRelief({ terrain: () => terrain, signature: () => signature, flat: build });
        seen.refresh(0);
        const first = seen.terrain();
        expect(heightAt(first, 10, 10)).toBe(0);
        expect(seen.isFlatAt(176, 176)).toBe(true);
        seen.refresh(16);
        seen.refresh(400);
        expect(build).toHaveBeenCalledTimes(1);
        expect(seen.terrain()).toBe(first);
        // A floor is laid elsewhere: seen within half a second.
        signature = "b";
        seen.refresh(450);
        expect(seen.terrain()).toBe(first);
        seen.refresh(520);
        expect(build).toHaveBeenCalledTimes(2);
        expect(heightAt(seen.terrain(), 16, 16)).toBe(0);
        expect(seen.terrain()).not.toBe(first);
        // The relief is edited: at once.
        terrain = withHeights(terrain, new Map([[cellKey(50, 50), -64]]));
        seen.refresh(530);
        expect(heightAt(seen.terrain(), 50, 50)).toBe(-64);
        expect(heightAt(seen.terrain(), 10, 10)).toBe(0);
    });

    it("is the relief of the map before it was ever looked at", () => {
        const terrain = plateau();
        const seen = new SeenRelief({
            terrain: () => terrain,
            signature: () => "a",
            flat: () => FlatGround.of({ ...MAP, pavedTiles: ["5,5"] }),
        });
        expect(seen.terrain()).toBe(terrain);
        expect(seen.isFlatAt(176, 176)).toBe(false);
    });
});

describe("the water as it is seen in 3/4", () => {
    it("lies at its place over what is built: a pool, a flooded terrace are drawn where they are", () => {
        const flat = FlatGround.of({ ...MAP, pavedTiles: ["5,5"] });
        // An area of 6 x 2 cells whose corner is the cell (8, 10): the cells 9 to 12 are flat, 8 and 13 are not.
        const depths = Float32Array.from([30, 30, 30, 30, 30, 30, 5, 5, 5, 5, 5, 5]);
        depthsSeen(depths, (x, y) => flat.isFlatAt(x, y), 8, 10, 6, 2);
        expect([...depths]).toEqual([30, 0, 0, 0, 0, 30, 5, 0, 0, 0, 0, 5]);
    });
});
