import { describe, expect, it } from "vitest";
import { insidePolygon } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowGeometry";

describe("insidePolygon", () => {
    const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ];
    // A shadow leaning away from its box: a parallelogram.
    const leaning = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 30, y: 20 },
        { x: 20, y: 20 },
    ];

    it("tells a point inside from a point outside", () => {
        expect(insidePolygon(square, 5, 5)).toBe(true);
        expect(insidePolygon(square, 15, 5)).toBe(false);
        expect(insidePolygon(square, 5, -1)).toBe(false);
        expect(insidePolygon(leaning, 20, 15)).toBe(true);
        expect(insidePolygon(leaning, 5, 15)).toBe(false);
    });

    it("says outside for no polygon", () => {
        expect(insidePolygon([], 0, 0)).toBe(false);
    });
});
