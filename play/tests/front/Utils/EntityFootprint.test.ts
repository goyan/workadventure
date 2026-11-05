import { describe, expect, it } from "vitest";
import { computeFootprint, computeOpaqueBounds, computeWaterArea } from "../../../src/front/Utils/EntityFootprint";

/** An image whose opaque pixels are those of `rows` ("#" opaque, "." transparent). */
function image(rows: string[]): ImageData {
    const width = rows[0].length;
    const data = new Uint8ClampedArray(width * rows.length * 4);
    rows.forEach((row, y) =>
        [...row].forEach((pixel, x) => {
            data[(y * width + x) * 4 + 3] = pixel === "#" ? 255 : 0;
        }),
    );
    return { width, height: rows.length, data, colorSpace: "srgb" };
}

describe("EntityFootprint", () => {
    it("bounds the opaque pixels only", () => {
        expect(computeOpaqueBounds(image(["....", ".##.", ".#..", "...."]))).toEqual({
            x: 1,
            y: 1,
            width: 2,
            height: 2,
        });
    });

    it("covers a standing object but a band at its top, where a head may pass behind", () => {
        // A wardrobe 6 px wide, 12 px high, on a transparent background.
        const wardrobe = image(["........", ...Array.from({ length: 12 }, () => ".######."), "........"]);
        expect(computeFootprint(wardrobe)).toEqual({ x: 1, y: 4, width: 6, height: 9 });
        // A tall one keeps a 16 px band only.
        const tall = image(Array.from({ length: 100 }, () => "####"));
        expect(computeFootprint(tall)).toEqual({ x: 0, y: 16, width: 4, height: 84 });
    });

    it("only reads the first frame of an animated strip", () => {
        expect(computeOpaqueBounds(image(["##....##", "##....##"]), 4)).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    });

    it("gives no hitbox to a fully transparent image", () => {
        expect(computeFootprint(image(["....", "...."]))).toBeUndefined();
    });

    it("leaves a rim around the water of a pool", () => {
        const pool = image(Array.from({ length: 20 }, () => "#".repeat(40)));
        expect(computeWaterArea(pool)).toEqual({ x: 3, y: 3, width: 34, height: 14 });
        expect(computeWaterArea(pool, 40, 5)).toEqual({ x: 5, y: 5, width: 30, height: 10 });
        expect(computeWaterArea(pool, 40, 10)).toBeUndefined();
    });
});
