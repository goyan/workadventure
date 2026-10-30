import { describe, expect, it } from "vitest";
import { computeTileSnapTarget, getFeetTile, getTileCenter } from "../../../../src/front/Phaser/Player/TileSnap";

const geometry = { tileWidth: 32, tileHeight: 32, bodyHeight: 16, bodyOffsetY: 8 };

describe("TileSnap", () => {
    it("targets the center of the tile under the feet", () => {
        expect(getFeetTile(100, 50, geometry)).toEqual({ tileX: 3, tileY: 2 });
        expect(computeTileSnapTarget(100, 50, geometry)).toEqual({ x: 112, y: 80 });
    });

    it("returns undefined when the avatar is already centered", () => {
        expect(computeTileSnapTarget(112, 64, geometry)).toBeUndefined();
    });

    it("handles a sprite whose feet are in the first tile", () => {
        expect(computeTileSnapTarget(0, -16, geometry)).toEqual({ x: 16, y: 16 });
    });

    it("gives the center of the tile containing a world point", () => {
        expect(getTileCenter(70, 95, 32, 32)).toEqual({ x: 80, y: 80 });
    });
});
