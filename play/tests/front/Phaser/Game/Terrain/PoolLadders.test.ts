import { describe, expect, it } from "vitest";
import { edgeLadders } from "@wa/front/Phaser/Game/Terrain/PoolLadders";

const area = { x: 160, y: 320, cell: 16 };

describe("edgeLadders", () => {
    it("puts the ladders of the style on an edge with none put by hand", () => {
        expect(edgeLadders({ column: 0, length: 4, row: 2, ladders: 1 }, area, new Set())).toEqual([2]);
    });

    it("puts only the ladders put by hand on an edge that has some, in the middle of their cell", () => {
        // The canvas starts at the cell (10, 20) of the map: its column 1, row 2 is the cell "11,22".
        const edge = { column: 0, length: 10, row: 2, ladders: 2 };
        expect(edgeLadders(edge, area, new Set(["11,22", "50,50"]))).toEqual([1.5]);
    });
});
