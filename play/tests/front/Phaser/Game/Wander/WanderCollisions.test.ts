import { describe, expect, it } from "vitest";
import { blockRectangles, sameGrids } from "../../../../../src/front/Phaser/Game/Wander/WanderCollisions";

const TILE = { width: 32, height: 32 };
const emptyGrid = (): number[][] => Array.from(Array(3), () => Array(4).fill(0));

describe("blockRectangles", () => {
    it("returns the grid itself without rectangles", () => {
        const grid = emptyGrid();
        expect(blockRectangles(grid, [], TILE)).toBe(grid);
    });

    it("blocks the tile of a facade foot without touching the tile below", () => {
        // Foot of a facade placed on tile (1, 0): 3 px at the bottom of the tile.
        const grid = emptyGrid();
        const blocked = blockRectangles(grid, [{ x: 32, y: 29, width: 32, height: 3 }], TILE);
        expect(blocked).toEqual([
            [0, 1, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]);
        // The source grid is left untouched.
        expect(grid[0][1]).toBe(0);
    });

    it("blocks both tiles a vertical wall stands between", () => {
        // Vertical thin wall placed on tile (1, 1): 6 px wide, centered on the border of columns 1 and 2.
        const blocked = blockRectangles(emptyGrid(), [{ x: 32 + 29, y: 32, width: 6, height: 32 }], TILE);
        expect(blocked).toEqual([
            [0, 0, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
        ]);
    });

    it("ignores what lies outside of the map and empty rectangles", () => {
        const blocked = blockRectangles(
            emptyGrid(),
            [
                { x: -40, y: -40, width: 50, height: 50 },
                { x: 64, y: 64, width: 0, height: 10 },
            ],
            TILE,
        );
        expect(blocked).toEqual([
            [1, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]);
    });
});

describe("sameGrids", () => {
    it("compares the content", () => {
        expect(sameGrids(emptyGrid(), emptyGrid())).toBe(true);
        const other = emptyGrid();
        other[2][3] = 1;
        expect(sameGrids(emptyGrid(), other)).toBe(false);
        expect(sameGrids(emptyGrid(), [[0]])).toBe(false);
    });
});
