import { describe, expect, it } from "vitest";
import { Season } from "@workadventure/map-editor";
import { rampsFor } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";
import type { Rgb } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";
import { waterColor } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/WaterPixel";

const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sum = (color: Rgb) => color[0] + color[1] + color[2];
const average = (depth: number, season?: Season) => {
    let total = 0;
    for (let x = 0; x < 32; x++)
        for (let y = 0; y < 32; y++) total += sum(waterColor(depth, x, y, season, undefined, false));
    return total / 1024;
};
const GROUND: Rgb = [10, 200, 10];

describe("the colour of a point of water in pixel art", () => {
    it("is a shade of the water of its season, darker deeper down", () => {
        for (const season of [undefined, Season.Spring, Season.Summer, Season.Autumn, Season.Winter]) {
            const color = waterColor(20, 3, 7, season, undefined, false);
            expect(
                rampsFor(season).water.some((shade) => same(shade, color)),
                String(season),
            ).toBe(true);
        }
        expect(average(40)).toBeLessThan(average(6));
        expect(rampsFor(Season.Summer).water).not.toEqual(rampsFor(Season.Autumn).water);
    });

    it("draws a line of foam 1 px wide at the edge of the water, of ice in winter, and clear water behind it", () => {
        expect(waterColor(20, 3, 7, Season.Autumn, undefined, false, true)).toEqual([0xd6, 0xec, 0xf6]);
        expect(waterColor(20, 3, 7, Season.Winter, undefined, false, true)).toEqual([0xe3, 0xf0, 0xf7]);
        // Shallow water off the edge: the clearest shade of the water, not foam.
        expect(waterColor(2, 3, 7, Season.Autumn, undefined, false, false)).toEqual(rampsFor(Season.Autumn).water[3]);
        expect(waterColor(4, 3, 7, Season.Winter, undefined, false, false)).not.toEqual([0xe3, 0xf0, 0xf7]);
    });

    it("lets the bottom show through, one pixel in two, while the relief is edited", () => {
        let ground = 0;
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                if (same(waterColor(20, x, y, undefined, GROUND, true), GROUND)) ground++;
                expect(same(waterColor(20, x, y, undefined, GROUND, false), GROUND)).toBe(false);
            }
        }
        expect(ground).toBeGreaterThan(4);
        expect(ground).toBeLessThan(12);
    });

    it("keeps the water one wades in clear, and darkens it from where one swims (16 px)", () => {
        const clear = rampsFor(Season.Autumn).water[3];
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                expect(waterColor(12, x, y, Season.Autumn, undefined, false)).toEqual(clear);
                expect(waterColor(17, x, y, Season.Autumn, undefined, false)).not.toEqual(clear);
            }
        }
    });
});
