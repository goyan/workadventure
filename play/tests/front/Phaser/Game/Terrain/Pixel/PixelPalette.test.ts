import { describe, expect, it } from "vitest";
import { hash2, valueNoise } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelNoise";
import { bayer, RAMPS, shadeAt } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";

describe("the noise of the pixel-art terrain", () => {
    it("gives the same number for the same point, in [0, 1)", () => {
        for (let index = 0; index < 1000; index++) {
            const x = (index * 37) % 211;
            const y = (index * 53) % 197;
            const value = hash2(x, y);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
            expect(hash2(x, y)).toBe(value);
        }
    });

    it("is smooth between whole points", () => {
        expect(valueNoise(3, 4)).toBeCloseTo(hash2(3, 4), 10);
        expect(Math.abs(valueNoise(3.01, 4) - valueNoise(3, 4))).toBeLessThan(0.01);
    });
});

describe("the palettes of the pixel-art terrain", () => {
    const ramp = RAMPS.grass;

    it("gives the darkest shade at 0 and the lightest at 1, everywhere", () => {
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                expect(shadeAt(ramp, 0, x, y)).toBe(ramp[0]);
                expect(shadeAt(ramp, 1, x, y)).toBe(ramp[3]);
            }
        }
    });

    it("dithers a value between two shades with the 4 × 4 pattern: each 8 times", () => {
        const counts = new Map<unknown, number>();
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                const shade = shadeAt(ramp, 0.5, x, y);
                counts.set(shade, (counts.get(shade) ?? 0) + 1);
            }
        }
        expect(counts.get(ramp[1])).toBe(8);
        expect(counts.get(ramp[2])).toBe(8);
        for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) expect(bayer(x, y)).toBeGreaterThan(0);
    });

    it("orders every ramp from the darkest to the lightest", () => {
        for (const [name, shades] of Object.entries(RAMPS)) {
            const sums = shades.map((shade) => shade[0] + shade[1] + shade[2]);
            for (let index = 1; index < 4; index++) expect(sums[index], name).toBeGreaterThan(sums[index - 1]);
        }
    });
});
