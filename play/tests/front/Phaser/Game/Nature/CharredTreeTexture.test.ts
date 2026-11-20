import { describe, expect, it } from "vitest";
import { charHole, charredTreePixel } from "../../../../../src/front/Phaser/Game/Nature/CharredTreeTexture";
import { snowyTreePixel, treePixelPart } from "../../../../../src/front/Phaser/Game/Nature/SnowyTreeTexture";

type Rgba = [number, number, number, number];
const leaf: Rgba = [60, 140, 50, 255];
const darkLeaf: Rgba = [30, 70, 25, 255];
const trunk: Rgba = [120, 80, 40, 255];
const shadow: Rgba = [70, 70, 70, 255];
const lightness = ([red, green, blue]: Rgba): number => (Math.max(red, green, blue) + Math.min(red, green, blue)) / 510;

describe("treePixelPart", () => {
    it("tells the foliage from the trunk, the shadow on the ground and what is transparent", () => {
        expect(treePixelPart(leaf, 0.2)).toBe("leaf");
        expect(treePixelPart(trunk, 0.7)).toBe("wood");
        // Brown high in the crown is an autumn leaf, not wood.
        expect(treePixelPart(trunk, 0.1)).toBe("leaf");
        expect(treePixelPart(shadow, 0.95)).toBe("shadow");
        expect(treePixelPart([60, 140, 50, 90], 0.2)).toBe("clear");
    });

    it("leaves the snow as it was", () => {
        expect(snowyTreePixel(trunk, 0.7)).toEqual(trunk);
        expect(snowyTreePixel(shadow, 0.95)).toEqual(shadow);
        expect(snowyTreePixel([200, 230, 190, 255], 0.2)).toEqual([255, 255, 255, 255]);
        expect(snowyTreePixel([20, 30, 20, 255], 0.2)).toEqual([36, 46, 72, 255]);
    });
});

describe("charredTreePixel", () => {
    it("browns the foliage, then blackens it, darker at each degree", () => {
        const degrees = [1, 2, 3, 4].map((degree) => charredTreePixel(leaf, 0.2, degree));
        // Scorched: no longer green-led.
        expect(degrees[0][0]).toBeGreaterThan(degrees[0][1]);
        for (let index = 1; index < degrees.length; index++) {
            expect(lightness(degrees[index])).toBeLessThanOrEqual(lightness(degrees[index - 1]));
        }
        // Black: nearly grey, and dark.
        const [red, green, blue] = degrees[3];
        expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(12);
        expect(lightness(degrees[3])).toBeLessThan(0.2);
        expect(degrees[3][3]).toBe(255);
    });

    it("keeps the light and the shade of the crown: a lit leaf stays lighter than a shaded one", () => {
        for (const degree of [1, 2, 3, 4]) {
            expect(lightness(charredTreePixel(leaf, 0.2, degree))).toBeGreaterThan(
                lightness(charredTreePixel(darkLeaf, 0.2, degree)),
            );
        }
    });

    it("darkens the trunk and leaves the shadow on the ground and what is transparent", () => {
        const burnt = charredTreePixel(trunk, 0.7, 4);
        expect(burnt).toEqual([48, 32, 16, 255]);
        expect(charredTreePixel(shadow, 0.95, 4)).toEqual(shadow);
        expect(charredTreePixel([60, 140, 50, 90], 0.2, 4)).toEqual([60, 140, 50, 90]);
    });
});

describe("charHole", () => {
    const share = (degree: number): number => {
        let holes = 0;
        for (let row = 0; row < 100; row++)
            for (let column = 0; column < 100; column++) {
                if (charHole(column, row, degree)) holes++;
            }
        return holes / 10000;
    };

    it("thins the crown of a tree burnt through, not of one scorched", () => {
        expect(share(1)).toBe(0);
        expect(share(2)).toBe(0);
        expect(share(3)).toBeGreaterThan(0.06);
        expect(share(3)).toBeLessThan(0.2);
        expect(share(4)).toBeGreaterThan(0.38);
        expect(share(4)).toBeLessThan(0.52);
    });

    it("takes the same clumps each time, and those gone at a degree are gone at the next", () => {
        for (let row = 0; row < 40; row++)
            for (let column = 0; column < 40; column++) {
                expect(charHole(column, row, 4)).toBe(charHole(column, row, 4));
                if (charHole(column, row, 3)) expect(charHole(column, row, 4)).toBe(true);
            }
        // By clumps of two pixels.
        expect(charHole(10, 10, 4)).toBe(charHole(11, 11, 4));
    });
});
