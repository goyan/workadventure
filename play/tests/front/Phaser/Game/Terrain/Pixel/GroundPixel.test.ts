import { describe, expect, it } from "vitest";
import { Season } from "@workadventure/map-editor";
import {
    castShadow,
    groundColor,
    isContour,
    lightOfRise,
    shadowedLight,
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

    it("draws a level line on the deeper side wherever the ground crosses a tile of depth", () => {
        expect(isContour(-33, -33, -33, -31, -33)).toBe(true);
        expect(isContour(-31, -31, -31, -31, -33)).toBe(false);
        expect(isContour(-40, -40, -40, -40, -40)).toBe(false);
        expect(isContour(-70, -70, -63, -70, -70)).toBe(true);
        // Under the first tile of height or depth: no line.
        expect(isContour(10, 40, 10, 10, 10)).toBe(false);
        const plain = average((x, y) => groundColor("snow", x, y, 0, -40));
        const line = average((x, y) => groundColor("snow", x, y, 0, -40, undefined, true));
        expect(line).toBeLessThan(plain);
    });
});

describe("the shape of a mount and of the snow", () => {
    it("draws a level line on the higher side wherever a mount crosses a tile of height", () => {
        expect(isContour(33, 33, 33, 31, 33)).toBe(true);
        expect(isContour(31, 31, 31, 31, 33)).toBe(false);
        expect(isContour(40, 40, 40, 40, 40)).toBe(false);
        expect(isContour(70, 70, 63, 70, 70)).toBe(true);
        // The foot of a mount on a hollow's rim: the line on the mount, and on the floor of the hollow.
        expect(isContour(33, -1, 33, 33, 33)).toBe(true);
    });

    const lightness = (color: Rgb) => (color[0] + color[1] + color[2]) / 3;

    it("spreads the shades of the snow wide enough for its shape to show, at night too", () => {
        for (const season of [undefined, Season.Winter]) {
            const snow = rampsFor(season).snow;
            expect(lightness(snow[0])).toBeLessThan(lightness(snow[3]) * 0.65);
        }
    });

    it("shades a slope of the snow, a level line on it and its shadow clearly", () => {
        const at = (light: number, contour = false) =>
            average((x, y) => groundColor("snow", x, y, light, 40, undefined, contour, Season.Winter));
        // Sums of the three channels: before, 72, 51 and 45 (hard to see at night).
        expect(at(lightOfRise(2)) - at(lightOfRise(-2))).toBeGreaterThan(100);
        expect(at(0) - at(0, true)).toBeGreaterThan(70);
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
            const color = groundColor("grass", 5, 9, 0, 0, undefined, false, season, false);
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
            count((x, y) => groundColor("grass", x, y, 0, 0, undefined, false, season, dense), FLOWERS);
        expect(flowers(Season.Spring, true)).toBeGreaterThan(0);
        expect(flowers(Season.Summer, true)).toBeLessThan(flowers(Season.Spring, true));
        expect(flowers(Season.Spring, false)).toBe(0);
        expect(flowers(Season.Autumn, true)).toBe(0);
        expect(flowers(Season.Winter, true)).toBe(0);
    });

    it("strews fallen leaves on the grass in autumn only", () => {
        const leaves = (season: Season) =>
            count((x, y) => groundColor("grass", x, y, 0, 0, undefined, false, season, true), LEAVES);
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
        expect(
            shades((x, y) => groundColor("grass", x, y, 0, 0, undefined, false, Season.Summer), straw),
        ).toBeGreaterThan(500);
        expect(shades((x, y) => groundColor("grass", x, y, 0, 0, undefined, false, Season.Spring), straw)).toBe(0);
    });

    it("lets the grass pierce the snow here and there in winter only", () => {
        const grass = rampsFor(Season.Winter).grass;
        const pierced = shades((x, y) => groundColor("snow", x, y, 0, 0, undefined, false, Season.Winter), grass);
        expect(pierced).toBeGreaterThan(0);
        expect(pierced).toBeLessThan(160 * 160 * 0.2);
        expect(shades((x, y) => groundColor("snow", x, y, 0, 0, undefined, false, Season.Autumn), grass)).toBe(0);
    });
});

describe("the shadow cast by a mount", () => {
    // A mount 128 px high over x and y from 100 to 200, flat ground around it.
    const mount = (x: number, y: number): number => (x >= 100 && x <= 200 && y >= 100 && y <= 200 ? 128 : 0);

    it("falls south-east of it, not north-west, nor beyond its reach", () => {
        expect(castShadow(mount, 220, 220, 128)).toBe(true);
        expect(castShadow(mount, 80, 80, 128)).toBe(false);
        expect(castShadow(mount, 280, 280, 128)).toBe(false);
    });

    it("never on flat ground, nor on the top of the mount", () => {
        expect(castShadow(() => 0, 50, 50, 0)).toBe(false);
        expect(castShadow(mount, 150, 150, 128)).toBe(false);
    });
});
