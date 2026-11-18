import { describe, expect, it } from "vitest";
import {
    SNOW_STEPS,
    accumulatedSnow,
    seedOf,
    snowyTreePixel,
    treeSnowStep,
} from "../../../../../src/front/Phaser/Game/Nature/SnowyTreeTexture";

/** A 12x16 tree: a green crown on rows 0-9 (rounded corners transparent), a brown trunk under it. */
function tree(): { pixels: Uint8ClampedArray; width: number; height: number } {
    const width = 12;
    const height = 16;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const corner = row < 2 && (column < 2 || column > 9);
            const crown = row < 10 && !corner;
            const trunk = row >= 10 && column >= 5 && column <= 6;
            const color = crown ? [70, 150, 60, 255] : trunk ? [120, 80, 50, 255] : [0, 0, 0, 0];
            pixels.set(color, (row * width + column) * 4);
        }
    }
    return { pixels, width, height };
}

describe("snowyTreePixel", () => {
    it("keeps the trunk, its lit side too, in the lower two thirds of the tree", () => {
        expect(snowyTreePixel([110, 72, 44, 255], 0.85)).toEqual([110, 72, 44, 255]);
        expect(snowyTreePixel([196, 140, 96, 255], 0.5)).toEqual([196, 140, 96, 255]);
    });
    it("keeps the shadow on the ground: grey at the foot, or half transparent", () => {
        expect(snowyTreePixel([70, 66, 64, 255], 0.95)).toEqual([70, 66, 64, 255]);
        expect(snowyTreePixel([20, 20, 20, 120], 0.95)).toEqual([20, 20, 20, 120]);
    });
    it("turns the foliage to snow, keeping its light and shade", () => {
        const lit = snowyTreePixel([150, 210, 120, 255], 0.2);
        const shaded = snowyTreePixel([40, 90, 50, 255], 0.2);
        expect(lit).toEqual([255, 255, 255, 255]);
        expect(shaded[0]).toBeLessThan(lit[0]);
        expect(shaded[2]).toBeGreaterThan(shaded[0]);
    });
    it("covers an orange autumn crown, which is not wood, even low in the tree", () => {
        expect(snowyTreePixel([240, 140, 40, 255], 0.2)).not.toEqual([240, 140, 40, 255]);
        expect(snowyTreePixel([110, 72, 44, 255], 0.2)).not.toEqual([110, 72, 44, 255]);
    });
    it("draws the outline in dark blue and leaves transparent pixels alone", () => {
        expect(snowyTreePixel([20, 30, 20, 255], 0.3)).toEqual([36, 46, 72, 255]);
        expect(snowyTreePixel([0, 0, 0, 0], 0.3)).toEqual([0, 0, 0, 0]);
    });
});

describe("snow accumulating on a tree", () => {
    it("settles on the top of the crown first and thickens downwards, never on the trunk before the last step", () => {
        const { pixels, width, height } = tree();
        const at = (mask: Uint8Array, column: number, row: number): number => mask[row * width + column];
        const light = accumulatedSnow(pixels, width, height, 2);
        expect(at(light, 6, 0)).toBe(1);
        expect(at(light, 6, 8)).toBe(0);
        expect(at(light, 5, 12)).toBe(0);
        const heavy = accumulatedSnow(pixels, width, height, 6);
        expect(heavy.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(
            light.reduce((sum, value) => sum + value, 0),
        );
        expect(light.every((value, index) => value === 0 || heavy[index] === 1)).toBe(true);
        expect(at(heavy, 5, 12)).toBe(0);
        expect(accumulatedSnow(pixels, width, height, 0).every((value) => value === 0)).toBe(true);
        expect(accumulatedSnow(pixels, width, height, SNOW_STEPS).every((value) => value === 1)).toBe(true);
    });
    it("lets each tree start at its own pace and catch up with the ground", () => {
        expect(treeSnowStep(0, 0)).toBe(0);
        expect(treeSnowStep(1, 0.9)).toBe(SNOW_STEPS);
        expect(treeSnowStep(0.3, 0)).toBeGreaterThan(treeSnowStep(0.3, 0.9));
        for (const ground of [0.1, 0.3, 0.5, 0.7, 0.95])
            for (const seed of [0, 0.4, 0.99])
                expect(treeSnowStep(ground, seed)).toBeLessThanOrEqual(ground * SNOW_STEPS);
        expect(seedOf("tree-a")).toBe(seedOf("tree-a"));
        expect(seedOf("tree-a")).not.toBe(seedOf("tree-b"));
        expect(seedOf("tree-a")).toBeGreaterThanOrEqual(0);
        expect(seedOf("tree-a")).toBeLessThan(1);
    });
});
