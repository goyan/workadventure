import { describe, expect, it } from "vitest";
import { DRY_LAND_PX, landPlacesOf, WADE_DEPTH_PX } from "../src/Life/LandPlaces";
import { cellKey } from "../src/Terrain/TerrainGrid";

/**
 * A land drawn row by row, a character a cell: "." dry, "p" a puddle (3 px of water), "w" water one swims in
 * (20 px). `east` and `south` list the cells whose east or south side is a wall.
 */
function landOf(rows: string[], east: [number, number][] = [], south: [number, number][] = []) {
    const depths: Record<string, number> = { ".": 0, p: 3, w: 20 };
    return landPlacesOf({
        width: rows[0].length,
        height: rows.length,
        walls: {
            east: new Set(east.map(([x, y]) => cellKey(x, y))),
            south: new Set(south.map(([x, y]) => cellKey(x, y))),
        },
        depthAt: (x, y) => depths[rows[y]?.[x] ?? "."] ?? 0,
    });
}

describe("the outdoor land of a map", () => {
    it("is one body on an open plain", () => {
        const land = landOf(["....", "....", "...."]);
        expect(land.bodyAt(0, 0)).toBe(1);
        expect(land.bodyAt(3, 2)).toBe(1);
        expect(land.sizes[1]).toEqual({ cells: 12, deep: 0 });
        expect(land.bodyAt(-1, 0)).toBe(0);
        expect(land.bodyAt(4, 0)).toBe(0);
    });

    it("leaves out what is closed by walls: a room is not outdoors", () => {
        // The cell (2, 2) of a 5 × 5 land, walled on its four sides.
        const land = landOf(
            [".....", ".....", ".....", ".....", "....."],
            [
                [1, 2],
                [2, 2],
            ],
            [
                [2, 1],
                [2, 2],
            ],
        );
        expect(land.bodyAt(2, 2)).toBe(0);
        expect(land.bodyAt(1, 2)).toBe(1);
        expect(land.sizes[1].cells).toBe(24);
        expect(land.canCross(1, 2, 1, 0)).toBe(false);
        expect(land.canCross(2, 2, 0, 1)).toBe(false);
        expect(land.canCross(1, 1, 1, 0)).toBe(true);
        expect(land.passable(2, 2, WADE_DEPTH_PX)).toBe(false);
    });

    it("is cut in two by water one swims in", () => {
        const land = landOf(["..w..", "..w..", "..w.."]);
        expect(land.bodyAt(0, 0)).not.toBe(0);
        expect(land.bodyAt(4, 0)).not.toBe(0);
        expect(land.bodyAt(0, 0)).not.toBe(land.bodyAt(4, 0));
        expect(land.bodyAt(2, 1)).toBe(0);
    });

    it("lets a predator wade through a puddle, not an antelope", () => {
        const land = landOf(["..p.."]);
        expect(land.bodyAt(2, 0)).toBe(land.bodyAt(0, 0));
        expect(land.passable(2, 0, WADE_DEPTH_PX)).toBe(true);
        expect(land.passable(2, 0, DRY_LAND_PX)).toBe(false);
        expect(land.passable(1, 0, DRY_LAND_PX)).toBe(true);
        expect(land.comfortAt(1, 0)).toBeGreaterThan(land.comfortAt(2, 0));
    });

    it("gives random cells of a body for a level, near or anywhere", () => {
        const land = landOf(["..p..", "..p.."]);
        const first = (): number => 0;
        expect(land.anyCell(1, DRY_LAND_PX, first)).toBeDefined();
        const near = land.randomCell(1, { cellX: 2, cellY: 0 }, 1, DRY_LAND_PX, first);
        expect(near).toBeDefined();
        expect(near?.cellX).not.toBe(2);
        expect(land.randomCell(0, { cellX: 2, cellY: 0 }, 1, DRY_LAND_PX, first)).toBeUndefined();
        expect(land.anyCell(0, DRY_LAND_PX, first)).toBeUndefined();
    });

    it("is nothing on a map without size", () => {
        const land = landPlacesOf({
            width: 0,
            height: 0,
            walls: { east: new Set(), south: new Set() },
            depthAt: () => 0,
        });
        expect(land.sizes).toEqual([{ cells: 0, deep: 0 }]);
        expect(land.bodyAt(0, 0)).toBe(0);
    });
});
