import { describe, expect, it } from "vitest";
import { blockCanvasArea } from "../../../../../src/front/Phaser/Game/Weather/BlockSurface";

describe("blockCanvasArea", () => {
    it("covers the view with one pixel a block, on a grid fixed to the map", () => {
        expect(blockCanvasArea({ x: -20, y: 10, width: 100, height: 50 }, 16)).toEqual({
            x: -32,
            y: 0,
            columns: 8,
            rows: 5,
        });
    });

    it("keeps the same size while the view scrolls: the canvas is never made again during a scroll", () => {
        const sizes = new Set<string>();
        for (let x = 0; x < 64; x += 3) {
            const area = blockCanvasArea({ x, y: x / 2, width: 1000, height: 600 }, 16);
            sizes.add(`${area.columns}x${area.rows}`);
            // Still covering the whole view.
            expect(area.x + area.columns * 16).toBeGreaterThanOrEqual(x + 1000);
            expect(area.y + area.rows * 16).toBeGreaterThanOrEqual(x / 2 + 600);
        }
        expect(sizes.size).toBe(1);
    });
});
