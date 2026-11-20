import { describe, expect, it } from "vitest";
import {
    groundColor,
    isContour,
    lightOfRise,
    slopeLight,
} from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/GroundPixel";
import type { Material, Rgb } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";
import { RAMPS } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";

const MATERIALS: Material[] = [
    "grass",
    "earth",
    "meadow",
    "clay",
    "sand",
    "rock",
    "gravel",
    "straw",
    "ash",
    "ember",
    "snow",
];
const sum = (color: Rgb): number => color[0] + color[1] + color[2];
const average = (colorAt: (x: number, y: number) => Rgb): number => {
    let total = 0;
    for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) total += sum(colorAt(x, y));
    return total / 4096;
};

describe("the colour of a point of the ground in pixel art", () => {
    it("is a shade of the ramp of its material (embers: ash or glowing orange), the same every time", () => {
        for (const material of MATERIALS) {
            for (let x = 0; x < 40; x++) {
                for (let y = 0; y < 40; y++) {
                    const color = groundColor(material, x, y, 0, -32);
                    const allowed: Rgb[] = [...RAMPS[material]];
                    if (material === "ember") allowed.push([0xff, 0x7a, 0x1a], [0xff, 0xd2, 0x7a]);
                    expect(
                        allowed.some((shade) => shade.every((channel, index) => channel === color[index])),
                        material,
                    ).toBe(true);
                    expect(groundColor(material, x, y, 0, -32)).toEqual(color);
                }
            }
        }
    });

    it("is darker deeper down, by half a ramp at most", () => {
        const at = (height: number) => average((x, y) => groundColor("sand", x, y, 0, height));
        expect(at(-160)).toBeLessThan(at(-32));
        expect(at(-2000)).toBe(at(-160));
    });

    it("is lighter on a slope that faces the north-west", () => {
        // The ground rises towards the south-east: its slope faces the north-west, where the light comes from.
        expect(slopeLight((x, y) => (x + y) * 2, 10, 10)).toBeGreaterThan(0);
        expect(slopeLight((x, y) => -(x + y) * 2, 10, 10)).toBeLessThan(0);
        const lit = average((x, y) => groundColor("earth", x, y, 1, 0));
        const shaded = average((x, y) => groundColor("earth", x, y, -1, 0));
        expect(lit).toBeGreaterThan(shaded);
    });

    it("carries a dark line on the grass side and a light one on the snow side", () => {
        expect(groundColor("grass", 3, 3, 0, 0, "dark")).toEqual([0x22, 0x36, 0x1c]);
        expect(groundColor("sand", 3, 3, 0, 0, "dark")).toEqual(RAMPS.sand[0]);
        expect(groundColor("snow", 3, 3, 0, 0, "light")).toEqual(RAMPS.snow[3]);
    });

    it("shades a gentle slope too, not only a steep one", () => {
        // A bowl dug at half a pixel of height a pixel of ground: the rise over two pixels each way is 2.
        expect(lightOfRise(2)).toBeGreaterThanOrEqual(0.5);
        expect(lightOfRise(-2)).toBeLessThanOrEqual(-0.5);
        expect(lightOfRise(0)).toBe(0);
        expect(lightOfRise(40)).toBe(1);
        const lit = average((x, y) => groundColor("snow", x, y, lightOfRise(2), -20));
        const shaded = average((x, y) => groundColor("snow", x, y, lightOfRise(-2), -20));
        expect(lit - shaded).toBeGreaterThan(20);
    });

    it("draws a level line on the deeper side wherever the ground crosses a tile of depth", () => {
        expect(isContour(-33, -33, -33, -31, -33)).toBe(true);
        expect(isContour(-31, -31, -31, -31, -33)).toBe(false);
        expect(isContour(-40, -40, -40, -40, -40)).toBe(false);
        expect(isContour(-70, -70, -63, -70, -70)).toBe(true);
        // Above the ground: no line (the mounts are lot D).
        expect(isContour(10, 40, 10, 10, 10)).toBe(false);
        const plain = average((x, y) => groundColor("snow", x, y, 0, -40));
        const line = average((x, y) => groundColor("snow", x, y, 0, -40, undefined, true));
        expect(line).toBeLessThan(plain);
    });
});
