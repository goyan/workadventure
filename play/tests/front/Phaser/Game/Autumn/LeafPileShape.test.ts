import { describe, expect, it } from "vitest";
import { leafPileHeight, leafPileSpan, paintLeafPile } from "../../../../../src/front/Phaser/Game/Autumn/LeafPileShape";
import { LEAF_COLORS } from "../../../../../src/front/Phaser/Game/Autumn/LeafPalette";

function opaque(width: number, height: number): Uint8ClampedArray {
    return new Uint8ClampedArray(width * height).fill(255);
}

describe("leafPileSpan", () => {
    it("keeps the central 70 % of the columns touching the ground", () => {
        expect(leafPileSpan(opaque(32, 32), 32, 32)).toEqual({ left: 5, right: 26 });
    });

    it("has no pile when the bottom of the image is transparent", () => {
        const alpha = opaque(32, 32);
        alpha.fill(0, 28 * 32);
        expect(leafPileSpan(alpha, 32, 32)).toBeUndefined();
    });

    it("follows the base of a narrow object", () => {
        const alpha = new Uint8ClampedArray(32 * 32);
        for (let y = 0; y < 32; y++) for (let x = 12; x < 22; x++) alpha[y * 32 + x] = 255;
        expect(leafPileSpan(alpha, 32, 32)).toEqual({ left: 13, right: 19 });
    });
});

describe("leafPileHeight", () => {
    it("is 12 % of the object, between 4 and 8 px", () => {
        expect(leafPileHeight(10)).toBe(4);
        expect(leafPileHeight(50)).toBe(6);
        expect(leafPileHeight(200)).toBe(8);
    });
});

describe("paintLeafPile", () => {
    function columnHeights(rgba: Uint8ClampedArray, width: number, height: number): number[] {
        return Array.from({ length: width }, (_, x) => {
            let count = 0;
            for (let y = 0; y < height; y++) if (rgba[(y * width + x) * 4 + 3] > 0) count++;
            return count;
        });
    }

    it("is a rounded mound: 1 px at the ends, full height in the middle", () => {
        const rgba = paintLeafPile(22, 6, 1);
        const heights = columnHeights(rgba, 22, 6);
        expect(heights[0]).toBe(1);
        expect(heights[21]).toBe(1);
        expect(Math.max(...heights)).toBe(6);
    });

    it("sits on the bottom row and uses the leaf palette", () => {
        const rgba = paintLeafPile(22, 6, 1);
        const colors = new Set<number>();
        for (let x = 0; x < 22; x++) expect(rgba[(5 * 22 + x) * 4 + 3]).toBe(255);
        for (let i = 0; i < rgba.length; i += 4) {
            if (rgba[i + 3] > 0) colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
        }
        expect([...colors].every((color) => (LEAF_COLORS as readonly number[]).includes(color))).toBe(true);
    });
});
