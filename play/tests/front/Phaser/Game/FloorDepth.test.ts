import { describe, expect, it } from "vitest";
import { floorDepth, floorPieceDepth } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorDepth";

describe("depth of the floors", () => {
    it("leaves the ground as it is and puts each altitude over the lower ones", () => {
        expect(floorDepth(0, 2400)).toBe(2400);
        // Nothing of the ground reaches the first floor, whatever its foot.
        expect(floorDepth(52, 0)).toBeGreaterThan(floorDepth(0, 100_000));
        expect(floorDepth(104, 0)).toBeGreaterThan(floorDepth(52, 100_000));
        // On a floor, the foot still sorts.
        expect(floorDepth(52, 2400)).toBeGreaterThan(floorDepth(52, 2300));
    });

    it("draws a slab under what stands on its floor, over what is lower, and over the slab north of it", () => {
        const slab = { kind: "slab", family: "parquet-clair" } as const;
        const depth = floorPieceDepth(slab, 160, 192 - 52, 52);
        expect(depth).toBeLessThan(floorDepth(52, 0));
        expect(depth).toBeGreaterThan(floorDepth(0, 100_000));
        expect(floorPieceDepth(slab, 160, 224 - 52, 52)).toBeGreaterThan(depth);
    });

    it("sorts a stair by its foot on the floor it starts from", () => {
        const stair = { kind: "stair", direction: "n", width: 1, rise: 52, open: false } as const;
        // Foot tile (10, 20): on the ground down to y = 672; its image starts at y = 608 - 52.
        expect(floorPieceDepth(stair, 320, 608 - 52, 0)).toBe(672);
        expect(floorPieceDepth(stair, 320, 608 - 52 - 52, 52)).toBe(floorDepth(52, 672));
    });
});
