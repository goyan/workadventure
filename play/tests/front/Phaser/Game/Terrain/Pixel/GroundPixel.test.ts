import { describe, expect, it } from "vitest";
import { Season } from "@workadventure/map-editor";
import {
    groundColor,
    contourOf,
    lightOfRise,
    shadowedLight,
    shadowHorizon,
    slopeLight,
} from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/GroundPixel";
import type { Material, Rgb } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";
import { RAMPS, rampsFor } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";

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

    it("draws a level line in relief wherever the ground crosses a tile of depth: dark on the deeper side, light on the other", () => {
        expect(contourOf(-33, -33, -33, -31, -33)).toBe(-1);
        expect(contourOf(-31, -31, -31, -31, -33)).toBe(1);
        expect(contourOf(-40, -40, -40, -40, -40)).toBe(0);
        expect(contourOf(-70, -70, -63, -70, -70)).toBe(-1);
        // Between the ground level and the first tile of height or depth: no line.
        expect(contourOf(10, 30, 10, 10, 10)).toBe(0);
        const plain = average((x, y) => groundColor("snow", x, y, 0, -40));
        expect(average((x, y) => groundColor("snow", x, y, 0, -40, undefined, -1))).toBeLessThan(plain);
        expect(average((x, y) => groundColor("snow", x, y, 0, -40, undefined, 1))).toBeGreaterThan(plain);
    });
});

describe("the shape of a mount and of the snow", () => {
    it("draws a level line in relief wherever a mount crosses a tile of height: dark below, light above", () => {
        expect(contourOf(31, 31, 31, 31, 33)).toBe(-1);
        expect(contourOf(33, 33, 33, 31, 33)).toBe(1);
        expect(contourOf(40, 40, 40, 40, 40)).toBe(0);
        expect(contourOf(63, 63, 70, 63, 63)).toBe(-1);
        // A pixel both under a higher one and over a lower one: the dark wins (the line stays unbroken).
        expect(contourOf(40, 70, 20, 40, 40)).toBe(-1);
    });

    const lightness = (color: Rgb) => (color[0] + color[1] + color[2]) / 3;

    it("spreads the shades of the snow wide enough for its shape to show, at night too", () => {
        for (const season of [undefined, Season.Winter]) {
            const snow = rampsFor(season).snow;
            expect(lightness(snow[0])).toBeLessThan(lightness(snow[3]) * 0.65);
        }
    });

    it("shades a slope of the snow, a level line on it and its shadow clearly", () => {
        const at = (light: number, contour = 0) =>
            average((x, y) => groundColor("snow", x, y, light, 40, undefined, contour, Season.Winter));
        // Sums of the three channels: before, 72, 51 and 45 (hard to see at night).
        expect(at(lightOfRise(2)) - at(lightOfRise(-2))).toBeGreaterThan(100);
        expect(at(0) - at(0, -1)).toBeGreaterThan(70);
        // The light side of a level line: as clear against the snow around it, even at the top of the ramp.
        expect(at(0, 1) - at(0, -1)).toBeGreaterThan(110);
        expect(at(0) - at(shadowedLight(0))).toBeGreaterThan(65);
    });
});

describe("the ground in the four seasons", () => {
    const count = (colorAt: (x: number, y: number) => Rgb, colors: Rgb[]): number => {
        let found = 0;
        for (let x = 0; x < 128; x++) {
            for (let y = 0; y < 128; y++) {
                const color = colorAt(x, y);
                if (colors.some((shade) => shade.every((channel, index) => channel === color[index]))) found++;
            }
        }
        return found;
    };
    const FLOWERS: Rgb[] = [
        [0xff, 0xff, 0xff],
        [0xf6, 0xd8, 0x4a],
        [0xf1, 0x9a, 0xc0],
    ];
    const LEAVES: Rgb[] = [
        [0xd9, 0x66, 0x2a],
        [0xb8, 0x40, 0x2a],
        [0xe8, 0xa3, 0x3a],
    ];

    it("paints the grass with the shades of its season", () => {
        for (const season of [Season.Spring, Season.Summer, Season.Autumn, Season.Winter]) {
            const ramp = rampsFor(season).grass;
            const color = groundColor("grass", 5, 9, 0, 0, undefined, 0, season, false);
            // The summer yellows the grass in patches (seasonPatch).
            const allowed = [...ramp, ...LEAVES, ...(season === Season.Summer ? rampsFor(Season.Summer).straw : [])];
            expect(
                allowed.some((shade) => shade.every((channel, index) => channel === color[index])),
                season,
            ).toBe(true);
        }
        expect(rampsFor(Season.Spring).grass).not.toEqual(rampsFor(Season.Autumn).grass);
        expect(rampsFor(undefined)).toEqual(RAMPS);
    });

    it("sows flowers in dense grass in spring, fewer in summer, none in autumn, in winter or in thin grass", () => {
        const flowers = (season: Season, dense: boolean) =>
            count((x, y) => groundColor("grass", x, y, 0, 0, undefined, 0, season, dense), FLOWERS);
        expect(flowers(Season.Spring, true)).toBeGreaterThan(0);
        expect(flowers(Season.Summer, true)).toBeLessThan(flowers(Season.Spring, true));
        expect(flowers(Season.Spring, false)).toBe(0);
        expect(flowers(Season.Autumn, true)).toBe(0);
        expect(flowers(Season.Winter, true)).toBe(0);
    });

    it("strews fallen leaves on the grass in autumn only", () => {
        const leaves = (season: Season) =>
            count((x, y) => groundColor("grass", x, y, 0, 0, undefined, 0, season, true), LEAVES);
        expect(leaves(Season.Autumn)).toBeGreaterThan(0);
        expect(leaves(Season.Spring)).toBe(0);
        expect(leaves(Season.Winter)).toBe(0);
    });
});

describe("the patches of the seasons", () => {
    const shades = (colorAt: (x: number, y: number) => Rgb, ramp: readonly Rgb[]): number => {
        let found = 0;
        for (let x = 0; x < 160; x++) {
            for (let y = 0; y < 160; y++) {
                const color = colorAt(x, y);
                if (ramp.some((shade) => shade.every((channel, index) => channel === color[index]))) found++;
            }
        }
        return found;
    };

    it("yellows the grass in patches in summer only", () => {
        const straw = rampsFor(Season.Summer).straw;
        expect(shades((x, y) => groundColor("grass", x, y, 0, 0, undefined, 0, Season.Summer), straw)).toBeGreaterThan(
            500,
        );
        expect(shades((x, y) => groundColor("grass", x, y, 0, 0, undefined, 0, Season.Spring), straw)).toBe(0);
    });

    it("lets the grass pierce the snow here and there in winter only", () => {
        const grass = rampsFor(Season.Winter).grass;
        const pierced = shades((x, y) => groundColor("snow", x, y, 0, 0, undefined, 0, Season.Winter), grass);
        expect(pierced).toBeGreaterThan(0);
        expect(pierced).toBeLessThan(160 * 160 * 0.2);
        expect(shades((x, y) => groundColor("snow", x, y, 0, 0, undefined, 0, Season.Autumn), grass)).toBe(0);
    });
});

describe("the shadow cast by a mount", () => {
    // A mount 128 px high over x and y from 100 to 200, flat ground around it.
    const mount = (x: number, y: number): number => (x >= 100 && x <= 200 && y >= 100 && y <= 200 ? 128 : 0);
    const shaded = (x: number, y: number) => shadowHorizon(mount, x, y) > mount(x, y);

    it("falls south-east of it, not north-west, nor further than its ray reaches", () => {
        expect(shaded(220, 220)).toBe(true);
        expect(shaded(80, 80)).toBe(false);
        // 80 px south-east of its corner: the ray from there passes over its top.
        expect(shaded(280, 280)).toBe(false);
    });

    it("never on flat ground, nor on the top of the mount", () => {
        expect(shadowHorizon(() => 0, 50, 50)).toBeLessThan(0);
        expect(shaded(150, 150)).toBe(false);
    });
});
