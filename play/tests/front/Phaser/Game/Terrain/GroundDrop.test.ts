import { describe, expect, it, vi } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { DropCache, groundDropOf } from "../../../../../src/front/Phaser/Game/Terrain/GroundDrop";

/** A relief of one height on the cells 10 to 13 across and 10 to 21 down (x 168 to 216, y 168 to 344 in its middle). */
function plateau(height: number): TerrainData {
    return withHeights(
        undefined,
        new Map(
            Array.from({ length: 4 * 12 }, (_, index): [string, number] => [
                cellKey(10 + (index % 4), 10 + Math.floor(index / 4)),
                height,
            ]),
        ),
    );
}

describe("how much lower what stands on the ground is drawn, the relief seen in 3/4", () => {
    it("is half the depth of the ground under its foot, and higher on a mount", () => {
        expect(groundDropOf(plateau(-64), 192, 250)).toBe(32);
        expect(groundDropOf(plateau(-128), 192, 250)).toBe(64);
        expect(groundDropOf(plateau(256), 192, 250)).toBe(-128);
    });

    it("is nothing on flat ground, out of the relief, or on a map without one", () => {
        expect(groundDropOf(plateau(-64), 192, 60)).toBe(0);
        expect(groundDropOf(plateau(-64), -500, -500)).toBe(0);
        expect(groundDropOf(undefined, 192, 250)).toBe(0);
    });

    it("follows the slope between two cells, as the ground is drawn", () => {
        // Half way between the last cell of the plateau (centre at y 344) and the flat one after it (centre at 360).
        expect(groundDropOf(plateau(-64), 192, 352)).toBe(16);
    });
});

describe("the drops kept for the things that do not move", () => {
    it("reads the ground once for a thing that stays, again when it moved or the relief changed", () => {
        const cache = new DropCache<string>();
        const read = vi.fn((x: number, y: number) => x + y);
        expect(cache.dropOf("tree", 10, 20, 1, read)).toBe(30);
        expect(cache.dropOf("tree", 10, 20, 1, read)).toBe(30);
        expect(read).toHaveBeenCalledTimes(1);
        // It moved.
        expect(cache.dropOf("tree", 10, 21, 1, read)).toBe(31);
        expect(read).toHaveBeenCalledTimes(2);
        // The relief changed under it.
        read.mockReturnValue(7);
        expect(cache.dropOf("tree", 10, 21, 2, read)).toBe(7);
        expect(read).toHaveBeenCalledTimes(3);
    });

    it("keeps each thing apart, and forgets one that is gone", () => {
        const cache = new DropCache<string>();
        const read = vi.fn(() => 5);
        cache.dropOf("a", 0, 0, 1, read);
        cache.dropOf("b", 0, 0, 1, read);
        expect(read).toHaveBeenCalledTimes(2);
        cache.forget("a");
        cache.dropOf("a", 0, 0, 1, read);
        cache.dropOf("b", 0, 0, 1, read);
        expect(read).toHaveBeenCalledTimes(3);
    });
});
