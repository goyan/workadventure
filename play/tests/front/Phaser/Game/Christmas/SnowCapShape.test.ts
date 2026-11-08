import { describe, expect, it } from "vitest";
import {
    paintSnowCap,
    snowCapThickness,
    snowCapTops,
} from "../../../../../src/front/Phaser/Game/Christmas/SnowCapShape";

/** A width x height alpha mask, opaque (255) inside the given rectangle. */
function mask(width: number, height: number, opaque: { x0: number; x1: number; y0: number; y1: number }) {
    const alpha = new Uint8ClampedArray(width * height);
    for (let y = opaque.y0; y <= opaque.y1; y++) {
        for (let x = opaque.x0; x <= opaque.x1; x++) alpha[y * width + x] = 255;
    }
    return alpha;
}

function pixel(rgba: Uint8ClampedArray, width: number, x: number, y: number): number[] {
    const i = (y * width + x) * 4;
    return Array.from(rgba.slice(i, i + 4));
}

describe("snowCapTops", () => {
    it("finds the first opaque row of each column", () => {
        expect(Array.from(snowCapTops(mask(4, 4, { x0: 1, x1: 2, y0: 2, y1: 3 }), 4, 4))).toEqual([-1, 2, 2, -1]);
    });

    it("ignores nearly transparent pixels", () => {
        const alpha = mask(1, 4, { x0: 0, x1: 0, y0: 3, y1: 3 });
        alpha[1] = 127;
        expect(Array.from(snowCapTops(alpha, 1, 4))).toEqual([3]);
    });

    it("keeps the highest of two spots", () => {
        const alpha = mask(1, 6, { x0: 0, x1: 0, y0: 4, y1: 5 });
        alpha[1] = 255;
        expect(Array.from(snowCapTops(alpha, 1, 6))).toEqual([1]);
    });
});

describe("snowCapThickness", () => {
    it("is 18 % of the height, between 4 and 12 px", () => {
        expect(snowCapThickness(10)).toBe(4);
        expect(snowCapThickness(50)).toBe(9);
        expect(snowCapThickness(200)).toBe(12);
    });
});

describe("paintSnowCap", () => {
    // 10 columns wide, 50 rows high: thickness 9, opaque from row 10 down.
    const width = 10;
    const height = 50;
    const rgba = paintSnowCap(mask(width, height, { x0: 0, x1: 9, y0: 10, y1: 49 }), width, height);

    it("paints the top light and the bottom shaded", () => {
        expect(pixel(rgba, width, 5, 10)).toEqual([0xf6, 0xf8, 0xff, 255]);
        expect(pixel(rgba, width, 5, 16)).toEqual([0xf6, 0xf8, 0xff, 255]);
        expect(pixel(rgba, width, 5, 17)).toEqual([0xc5, 0xd0, 0xee, 255]);
        expect(pixel(rgba, width, 5, 18)).toEqual([0xc5, 0xd0, 0xee, 255]);
        expect(pixel(rgba, width, 5, 19)[3]).toBe(0);
        expect(pixel(rgba, width, 5, 9)[3]).toBe(0);
    });

    it("rounds the ends of each run", () => {
        // Half thickness (4 px, rounded down) on the two columns at each end.
        expect(pixel(rgba, width, 0, 13)[3]).toBe(255);
        expect(pixel(rgba, width, 0, 14)[3]).toBe(0);
        expect(pixel(rgba, width, 9, 14)[3]).toBe(0);
        expect(pixel(rgba, width, 2, 18)[3]).toBe(255);
    });

    it("never paints over transparent pixels", () => {
        const holed = mask(width, height, { x0: 0, x1: 9, y0: 10, y1: 49 });
        holed[12 * width + 5] = 0;
        const painted = paintSnowCap(holed, width, height);
        expect(pixel(painted, width, 5, 12)[3]).toBe(0);
        expect(pixel(painted, width, 5, 13)[3]).toBe(255);
    });
});
