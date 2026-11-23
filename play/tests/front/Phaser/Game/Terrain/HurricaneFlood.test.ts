import { describe, expect, it } from "vitest";
import { FLOOD_KEPT_MS, FLOOD_MARKS_MS, HurricaneFlood } from "@wa/front/Phaser/Game/Terrain/HurricaneFlood";

/** A strip of 8 cells from x = 10: a lake on the first four (40 px of water), dry land on the last four. */
function strip(depths: number[]): { x: number; y: number; width: number; height: number; depths: Float32Array } {
    return { x: 10, y: 3, width: depths.length, height: 1, depths: Float32Array.from(depths) };
}

describe("what a hurricane does to the water of the map, kept by this browser", () => {
    it("counts the rise of each cell from the water as it stood when the hurricane began", () => {
        const flood = new HurricaneFlood();
        expect(flood.riseAt(10, 3, 50)).toBeUndefined();
        flood.begin(strip([40, 40, 40, 40, 0, 0, 0, 0]));
        flood.observe(strip([62, 58, 51, 45, 12, 3, 0, 0]), 1000);
        expect(flood.riseAt(10, 3, 62)).toBe(22);
        expect(flood.riseAt(14, 3, 12)).toBe(12);
        // Off the grid: nothing to say.
        expect(flood.riseAt(30, 3, 5)).toBeUndefined();
        expect(flood.highestRisePx()).toBe(22);
        // It keeps its highest when the water falls back.
        flood.observe(strip([41, 40, 40, 40, 0, 0, 0, 0]), 2000);
        expect(flood.highestRisePx()).toBe(22);
    });

    it("leaves the land it covered dark, a wrack along the highest line, both fading once the water drew back", () => {
        const flood = new HurricaneFlood();
        flood.begin(strip([40, 40, 40, 40, 0, 0, 0, 0]));
        // The water covers two cells of land, then draws back.
        flood.observe(strip([60, 55, 50, 45, 10, 4, 0, 0]), 1000);
        expect(flood.marks(1000)).toEqual([]);
        flood.observe(strip([40, 40, 40, 40, 0, 0, 0, 0]), 5000);
        const marks = flood.marks(5000);
        expect(marks).toEqual([
            { cellX: 14, cellY: 3, kind: "drowned", strength: 1 },
            { cellX: 15, cellY: 3, kind: "wrack", strength: 1 },
        ]);
        // Half faded half way, gone after FLOOD_MARKS_MS.
        expect(flood.marks(5000 + FLOOD_MARKS_MS / 2)[0].strength).toBeCloseTo(0.5, 9);
        expect(flood.marks(5000 + FLOOD_MARKS_MS + 1)).toEqual([]);
        // The lake that was there before leaves nothing.
        expect(marks.some((mark) => mark.cellX < 14)).toBe(false);
    });

    it("keeps the highest of the storm only while it goes, and forgets it all a while after it ended", () => {
        const flood = new HurricaneFlood();
        flood.begin(strip([40, 40, 40, 40, 0, 0, 0, 0]));
        flood.observe(strip([50, 40, 40, 40, 0, 0, 0, 0]), 1000);
        flood.end(2000);
        // A wave after the end does not count.
        flood.observe(strip([90, 40, 40, 40, 0, 0, 0, 0]), 3000);
        expect(flood.highestRisePx()).toBe(10);
        expect(flood.following(2000 + FLOOD_KEPT_MS)).toBe(true);
        expect(flood.following(2000 + FLOOD_KEPT_MS + 1)).toBe(false);
        expect(flood.highestRisePx()).toBe(0);
        expect(flood.riseAt(10, 3, 40)).toBeUndefined();
    });

    it("starts afresh on a grid of another size (the map changed under it)", () => {
        const flood = new HurricaneFlood();
        flood.begin(strip([40, 40, 0, 0]));
        flood.observe(strip([40, 40, 0, 0, 0, 0]), 1000);
        expect(flood.riseAt(15, 3, 3)).toBe(3);
    });
});
