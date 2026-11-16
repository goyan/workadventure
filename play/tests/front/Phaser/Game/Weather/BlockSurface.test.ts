import { describe, expect, it } from "vitest";
import { blockCanvasArea, paintBlocks } from "../../../../../src/front/Phaser/Game/Weather/BlockSurface";

describe("blockCanvasArea", () => {
    it("covers the view with one pixel a block, on a grid fixed to the map", () => {
        expect(blockCanvasArea({ x: -20, y: 10, width: 100, height: 50 }, 16)).toEqual({
            x: -32,
            y: 0,
            columns: 7,
            rows: 4,
        });
    });
});

describe("paintBlocks", () => {
    const area = { x: 0, y: 0, columns: 4, rows: 2 };
    const pixel = (pixels: Uint8ClampedArray, column: number, row: number) =>
        Array.from(pixels.slice((row * 4 + column) * 4, (row * 4 + column) * 4 + 4));

    it("paints each block as its pixels, of its colour, more opaque at a higher level", () => {
        const pixels = new Uint8ClampedArray(4 * 2 * 4);
        paintBlocks(
            pixels,
            area,
            16,
            [{ x: 16, y: 0, width: 32, height: 16, level: 4 }],
            0xff8000,
            (level) => level / 8,
        );
        expect(pixel(pixels, 0, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(pixels, 1, 0)).toEqual([255, 128, 0, 128]);
        expect(pixel(pixels, 2, 0)).toEqual([255, 128, 0, 128]);
        expect(pixel(pixels, 1, 1)).toEqual([0, 0, 0, 0]);
    });

    it("lays a layer over the one before as the screen would (white clouds over black shadows)", () => {
        const pixels = new Uint8ClampedArray(4 * 2 * 4);
        const block = [{ x: 0, y: 0, width: 16, height: 16, level: 8 }];
        paintBlocks(pixels, area, 16, block, 0x000000, () => 0.5);
        paintBlocks(pixels, area, 16, block, 0xffffff, () => 0.5);
        // 0.5 white over 0.5 black: 0.75 opaque (the black kept as 128 / 255), a third of the way from black to white.
        expect(pixel(pixels, 0, 0)).toEqual([170, 170, 170, 192]);
    });

    it("rounds a block cut by a wall to the nearest pixel, never past the canvas", () => {
        const pixels = new Uint8ClampedArray(4 * 2 * 4);
        paintBlocks(pixels, area, 16, [{ x: 50, y: 0, width: 40, height: 16, level: 8 }], 0xffffff, () => 1);
        expect(pixel(pixels, 2, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(pixels, 3, 0)).toEqual([255, 255, 255, 255]);
    });
});
