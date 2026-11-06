import { describe, expect, it } from "vitest";
import {
    blockRectangles,
    sameGrids,
    withAreaBorders,
} from "../../../../../src/front/Phaser/Game/Wander/WanderCollisions";
import { TileBarriers } from "../../../../../src/front/Utils/TileBarriers";

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

describe("withAreaBorders", () => {
    // Locked area covering tiles (1..2, 1..2): x 32..96, y 32..96.
    const area = { x: 32, y: 32, width: 64, height: 64 };

    it("returns the walls themselves without locked area", () => {
        const walls = new TileBarriers(6);
        expect(withAreaBorders(walls, [], TILE)).toBe(walls);
    });

    it("closes the four sides of a locked area, inside and outside stay free", () => {
        const barriers = withAreaBorders(TileBarriers.NONE, [area], TILE);

        // Crossing any side is blocked.
        expect(barriers.blocksMove({ x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true); // west
        expect(barriers.blocksMove({ x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true); // east
        expect(barriers.blocksMove({ x: 1, y: 0 }, { x: 1, y: 1 })).toBe(true); // north
        expect(barriers.blocksMove({ x: 2, y: 2 }, { x: 2, y: 3 })).toBe(true); // south
        expect(barriers.blocksMove({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true); // diagonal through the corner
        // Moves inside, and outside along the area, are free.
        expect(barriers.blocksMove({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
        expect(barriers.blocksMove({ x: 0, y: 1 }, { x: 0, y: 2 })).toBe(false);
        expect(barriers.blocksMove({ x: 3, y: 0 }, { x: 3, y: 1 })).toBe(false);
    });

    it("keeps the walls and their thickness, and leaves them untouched", () => {
        const walls = new TileBarriers(6);
        walls.addWestBorder(5, 5);

        const barriers = withAreaBorders(walls, [area], TILE);

        expect(barriers.halfThickness).toBe(6);
        expect(barriers.blocksMove({ x: 4, y: 5 }, { x: 5, y: 5 })).toBe(true);
        expect(barriers.blocksMove({ x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true);
        expect(walls.blocksMove({ x: 0, y: 1 }, { x: 1, y: 1 })).toBe(false);
    });

    it("rounds an area off the grid to the nearest tile lines", () => {
        // 33..95 rounds to the same tiles as 32..96.
        const barriers = withAreaBorders(TileBarriers.NONE, [{ x: 33, y: 31, width: 62, height: 66 }], TILE);
        expect(barriers.equals(withAreaBorders(TileBarriers.NONE, [area], TILE))).toBe(true);
    });
});
