import { describe, expect, it } from "vitest";
import { RaisedCover } from "../../../../../src/front/Phaser/Game/Weather/RaisedCover";

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
});
