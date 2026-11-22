import { describe, expect, it } from "vitest";
import { MapGroundLayout } from "../../../../../src/front/Phaser/Game/Terrain/MapGroundLayout";

/** A map of 10 × 6 tiles (320 × 192 px), outdoors all over, with no floor and no grass tile. */
function layout() {
    return new MapGroundLayout({
        grid: () => undefined,
        gridVersion: () => 0,
        wam: () => undefined,
        isGrassTile: () => true,
        mapSize: () => ({ width: 320, height: 192 }),
    });
}

describe("the layout of the map the ground is drawn with", () => {
    it("stops at the edges of the map: nothing is outdoors beyond them", () => {
        const map = layout();
        expect(map.outdoor(0, 0)).toBe(true);
        expect(map.outdoor(19, 11)).toBe(true);
        expect(map.outdoor(20, 5)).toBe(false);
        expect(map.outdoor(5, 12)).toBe(false);
        expect(map.outdoor(-1, 5)).toBe(false);
    });
});
