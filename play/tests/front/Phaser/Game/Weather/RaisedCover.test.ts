import { describe, expect, it } from "vitest";
import { floorPieceCover, RaisedCover } from "../../../../../src/front/Phaser/Game/Weather/RaisedCover";

describe("RaisedCover", () => {
    it("tells the points under a slab or a tall wall from the others", () => {
        const cover = new RaisedCover();
        expect(cover.empty).toBe(true);
        // A slab of a floor 52 px up, over the tile (2, 3): drawn at y = 3 * 32 - 52 = 44.
        cover.add({ x: 64, y: 44, width: 32, height: 32 });
        expect(cover.empty).toBe(false);
        expect(cover.has(80, 60)).toBe(true);
        expect(cover.has(80, 30)).toBe(false);
        expect(cover.has(100, 60)).toBe(false);
        expect(cover.has(-5, 60)).toBe(false);
    });

    it("keeps an outdoor run it does not touch, and cuts the covered part out of the others", () => {
        const cover = new RaisedCover();
        cover.add({ x: 64, y: 32, width: 32, height: 16 });
        const far = { x: 0, y: 200, width: 320, height: 32 };
        const run = { x: 0, y: 32, width: 160, height: 32 };

        const out = cover.uncovered([far, run]);
        expect(out).toContainEqual(far);
        // The upper half of the run is cut around the cover, the lower half is whole.
        expect(out).toContainEqual({ x: 0, y: 32, width: 64, height: 8 });
        expect(out).toContainEqual({ x: 96, y: 32, width: 64, height: 8 });
        expect(out).toContainEqual({ x: 0, y: 48, width: 160, height: 8 });
        const area = (rects: { width: number; height: number }[]) =>
            rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
        expect(area(out)).toBe(area([far, run]) - 32 * 16);
    });

    it("gives the runs back as they are when nothing is covered", () => {
        const run = { x: 0, y: 32, width: 160, height: 32 };
        expect(new RaisedCover().uncovered([run])).toEqual([run]);
    });

    it("tells a cover that holds the same cells from one that does not", () => {
        const one = new RaisedCover();
        const same = new RaisedCover();
        const other = new RaisedCover();
        one.add({ x: 0, y: 0, width: 32, height: 32 });
        same.add({ x: 0, y: 0, width: 32, height: 32 });
        other.add({ x: 32, y: 0, width: 32, height: 32 });
        expect(one.sameAs(same)).toBe(true);
        expect(one.sameAs(other)).toBe(false);
        other.add({ x: 0, y: 0, width: 32, height: 32 });
        expect(one.sameAs(other)).toBe(false);
        expect(new RaisedCover().sameAs(new RaisedCover())).toBe(true);
    });

    describe("floorPieceCover", () => {
        /** A ramp going up east to 20 px over the tile (184, 44), drawn where the map editor draws it. */
        const ramp = {
            kind: "stair" as const,
            direction: "e" as const,
            width: 1 as const,
            rise: 20 as const,
            open: true,
            ramp: true,
        };
        const rampImage = { x: 5888, y: 1388, width: 32, height: 52 };

        it("covers only the slanted band a ramp going east or west is drawn as, not the empty corners of its image", () => {
            const cover = new RaisedCover();
            for (const rect of floorPieceCover(ramp, rampImage)) cover.add(rect);
            // On its band: at its foot (west) from 20 px under the top of the image, at its head from the top.
            expect(cover.has(5892, 1420)).toBe(true);
            expect(cover.has(5916, 1392)).toBe(true);
            // Over the band at its foot, and under it at its head: the ground shows there, the weather too.
            expect(cover.has(5892, 1392)).toBe(false);
            expect(cover.has(5916, 1436)).toBe(false);
        });

        it("is the mirror of it for a ramp going west", () => {
            const cover = new RaisedCover();
            for (const rect of floorPieceCover({ ...ramp, direction: "o" }, { ...rampImage, x: 6304 })) cover.add(rect);
            expect(cover.has(6332, 1420)).toBe(true);
            expect(cover.has(6308, 1392)).toBe(true);
            expect(cover.has(6332, 1392)).toBe(false);
            expect(cover.has(6308, 1436)).toBe(false);
        });

        it("covers down to the bottom of its image a full stair going east, whose side is drawn", () => {
            const cover = new RaisedCover();
            const stair = { ...ramp, open: false, ramp: undefined };
            for (const rect of floorPieceCover(stair, rampImage)) cover.add(rect);
            expect(cover.has(5916, 1436)).toBe(true);
            expect(cover.has(5892, 1392)).toBe(false);
        });

        it("covers the whole image of a slab and of a stair going north", () => {
            const slab = { x: 64, y: 44, width: 32, height: 40 };
            expect(floorPieceCover({ kind: "slab", family: "bois" }, slab)).toEqual([slab]);
            const north = { x: 64, y: 12, width: 32, height: 52 };
            expect(floorPieceCover({ ...ramp, direction: "n" }, north)).toEqual([north]);
        });
    });
});
