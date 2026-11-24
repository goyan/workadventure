import { describe, expect, it } from "vitest";
import {
    blockWetTiles,
    changedTiles,
    shoresOf,
    WET_OFF_PX,
    WET_ON_PX,
    wetTilesOf,
} from "../../../../../src/front/Phaser/Game/Wander/WanderWater";

const TILE = 32;
const CELL = 16;

/** Depths by cell of the relief ("column,row"), read at map pixels. */
function depths(cells: Record<string, number>): (x: number, y: number) => number {
    return (x, y) => cells[`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`] ?? 0;
}

const wholeMap = { x: 0, y: 0, width: 4 * TILE, height: 4 * TILE };

describe("wetTilesOf", () => {
    it("a tile is wet as soon as one of its four cells holds enough water", () => {
        // The cell (3, 2) is the top right quarter of the tile (1, 1).
        const wet = wetTilesOf(4, 4, TILE, wholeMap, depths({ "3,2": WET_ON_PX }));
        expect(wet.isWet(1, 1)).toBe(true);
        expect(wet.isWet(0, 1)).toBe(false);
        expect(wet.isWet(-1, 0)).toBe(false);
        expect(wet.isWet(9, 9)).toBe(false);
    });

    it("a film of water does not make a tile wet", () => {
        const wet = wetTilesOf(4, 4, TILE, wholeMap, depths({ "3,2": WET_ON_PX - 0.25 }));
        expect(wet.isWet(1, 1)).toBe(false);
    });

    it("a wet tile stays wet until its water is nearly gone: a shore that wavers does not move", () => {
        const before = wetTilesOf(4, 4, TILE, wholeMap, depths({ "3,2": WET_ON_PX }));
        const wavering = wetTilesOf(4, 4, TILE, wholeMap, depths({ "3,2": WET_OFF_PX }), before);
        expect(wavering.isWet(1, 1)).toBe(true);
        const dried = wetTilesOf(4, 4, TILE, wholeMap, depths({ "3,2": WET_OFF_PX - 0.25 }), wavering);
        expect(dried.isWet(1, 1)).toBe(false);
    });

    it("only reads the part of the map the water grid covers", () => {
        const read: string[] = [];
        wetTilesOf(4, 4, TILE, { x: TILE, y: TILE, width: TILE, height: TILE }, (x, y) => {
            read.push(`${x},${y}`);
            return 0;
        });
        expect(read).toHaveLength(4);
    });
});

describe("changedTiles", () => {
    it("lists the tiles that became wet or dry", () => {
        const before = wetTilesOf(4, 4, TILE, wholeMap, depths({ "0,0": 8 }));
        const after = wetTilesOf(4, 4, TILE, wholeMap, depths({ "6,6": 8 }));
        expect(changedTiles(before, after)).toEqual([
            { x: 0, y: 0 },
            { x: 3, y: 3 },
        ]);
        expect(changedTiles(after, after)).toEqual([]);
    });

    it("counts every wet tile when there was no water before", () => {
        const after = wetTilesOf(4, 4, TILE, wholeMap, depths({ "6,6": 8 }));
        expect(changedTiles(undefined, after)).toEqual([{ x: 3, y: 3 }]);
    });
});

describe("blockWetTiles", () => {
    it("turns the wet tiles into colliders, on a copy", () => {
        const grid = [
            [0, 0],
            [0, 3],
        ];
        const wet = wetTilesOf(2, 2, TILE, wholeMap, depths({ "2,2": 8 }));
        const blocked = blockWetTiles(grid, wet, 1);
        expect(blocked).toEqual([
            [0, 0],
            [0, 1],
        ]);
        expect(grid[1][1]).toBe(3);
    });

    it("gives the grid itself back when nothing is wet", () => {
        const grid = [[0]];
        expect(blockWetTiles(grid, wetTilesOf(1, 1, TILE, wholeMap, depths({})), 1)).toBe(grid);
    });
});

describe("shoresOf", () => {
    // A pond on the tile (1, 1).
    const wet = wetTilesOf(4, 4, TILE, wholeMap, depths({ "2,2": 8 }));
    const free = (): boolean => true;
    const open = (): boolean => false;

    it("gives the dry free tiles that touch the water by a side, each turned to the water", () => {
        expect(shoresOf(wet, TILE, free, open)).toEqual([
            { x: 48, y: 16, toward: "down" },
            { x: 16, y: 48, toward: "right" },
            { x: 80, y: 48, toward: "left" },
            { x: 48, y: 80, toward: "up" },
        ]);
    });

    it("leaves out a tile that is taken, and one a wall parts from the water", () => {
        const shores = shoresOf(
            wet,
            TILE,
            (tile) => !(tile.x === 1 && tile.y === 0),
            (from) => from.x === 0 && from.y === 1,
        );
        expect(shores.map((shore) => shore.toward)).toEqual(["left", "up"]);
    });

    it("a tile between two waters is a single shore", () => {
        const two = wetTilesOf(4, 4, TILE, wholeMap, depths({ "0,2": 8, "4,2": 8 }));
        expect(shoresOf(two, TILE, free, open).filter((shore) => shore.x === 48 && shore.y === 48)).toHaveLength(1);
    });
});
