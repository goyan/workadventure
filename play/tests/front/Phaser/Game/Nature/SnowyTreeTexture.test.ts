import { describe, expect, it } from "vitest";
import { snowyTreePixel } from "../../../../../src/front/Phaser/Game/Nature/SnowyTreeTexture";

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
