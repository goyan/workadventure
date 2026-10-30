import { describe, expect, it } from "vitest";
import { TileBarriers } from "../../../src/front/Utils/TileBarriers";

describe("TileBarriers", () => {
    it("blocks the moves across a barrier, in both directions, and only those", () => {
        const barriers = new TileBarriers();
        barriers.addSouthBorder(2, 3);
        barriers.addWestBorder(5, 1);

        expect(barriers.blocksMove({ x: 2, y: 3 }, { x: 2, y: 4 })).toBe(true);
        expect(barriers.blocksMove({ x: 2, y: 4 }, { x: 2, y: 3 })).toBe(true);
        expect(barriers.blocksMove({ x: 2, y: 2 }, { x: 2, y: 3 })).toBe(false);
        expect(barriers.blocksMove({ x: 4, y: 1 }, { x: 5, y: 1 })).toBe(true);
        expect(barriers.blocksMove({ x: 5, y: 1 }, { x: 4, y: 1 })).toBe(true);
        expect(barriers.blocksMove({ x: 5, y: 1 }, { x: 6, y: 1 })).toBe(false);
    });

    it("blocks a diagonal move when a barrier touches the corner it passes by", () => {
        const barriers = new TileBarriers();
        barriers.addSouthBorder(1, 1); // between (1, 1) and (1, 2)

        expect(barriers.blocksMove({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(true);
        expect(barriers.blocksMove({ x: 2, y: 2 }, { x: 1, y: 1 })).toBe(true);
        expect(barriers.blocksMove({ x: 2, y: 1 }, { x: 3, y: 2 })).toBe(false);
    });

    it("tells whether a tile has a barrier on one of its sides", () => {
        const barriers = new TileBarriers();
        barriers.addSouthBorder(2, 3);
        barriers.addWestBorder(5, 1);

        expect(barriers.touchesTile(2, 3)).toBe(true);
        expect(barriers.touchesTile(2, 4)).toBe(true);
        expect(barriers.touchesTile(5, 1)).toBe(true);
        expect(barriers.touchesTile(4, 1)).toBe(true);
        expect(barriers.touchesTile(3, 3)).toBe(false);
    });

    it("has no barrier by default", () => {
        expect(TileBarriers.NONE.blocksMove({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
        expect(TileBarriers.NONE.touchesTile(0, 0)).toBe(false);
    });
});
