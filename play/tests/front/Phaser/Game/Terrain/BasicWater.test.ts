import { describe, expect, it } from "vitest";
import { paintBasicWater } from "@wa/front/Phaser/Game/Terrain/BasicWater";
import { SHORE_PX } from "@wa/front/Phaser/Game/Terrain/TerrainShading";

const pixelOf = (pixels: Uint8ClampedArray, index: number): number[] => [...pixels.slice(index * 4, index * 4 + 4)];

describe("paintBasicWater", () => {
    it("shows only water at least SHORE_PX deep, in one flat colour whatever its depth", () => {
        const pixels = new Uint8ClampedArray(4 * 4);

        const painted = paintBasicWater(Float32Array.from([0, SHORE_PX - 0.5, SHORE_PX, 200]), pixels);

        expect(painted).toEqual({ wet: true, changed: true });
        expect(pixelOf(pixels, 0)[3]).toBe(0);
        expect(pixelOf(pixels, 1)[3]).toBe(0);
        expect(pixelOf(pixels, 2)[3]).toBeGreaterThan(0);
        expect(pixelOf(pixels, 3)).toEqual(pixelOf(pixels, 2));
    });

    it("tells no change when the outline of the water stays the same, its depth aside", () => {
        const pixels = new Uint8ClampedArray(2 * 4);
        paintBasicWater(Float32Array.from([10, 0]), pixels);

        expect(paintBasicWater(Float32Array.from([40, 1]), pixels)).toEqual({ wet: true, changed: false });
        expect(paintBasicWater(Float32Array.from([40, 10]), pixels)).toEqual({ wet: true, changed: true });
    });

    it("tells a dry grid", () => {
        expect(paintBasicWater(Float32Array.from([0, 1]), new Uint8ClampedArray(2 * 4))).toEqual({
            wet: false,
            changed: false,
        });
    });
});
