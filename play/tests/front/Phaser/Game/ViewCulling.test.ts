import { describe, expect, it } from "vitest";
import { reachesView, VIEW_CULL_MARGIN_PX } from "../../../../src/front/Phaser/Game/ViewCulling";

const view = { x: 1000, y: 500, right: 1800, bottom: 950 };
const box = (x: number, y: number, width = 32, height = 32) => ({ x, y, width, height });

describe("reachesView", () => {
    it("keeps what is in the view, whole or in part", () => {
        expect(reachesView(box(1200, 600), view)).toBe(true);
        expect(reachesView(box(990, 490), view)).toBe(true);
        expect(reachesView(box(1790, 940), view)).toBe(true);
        // Larger than the view: still in it.
        expect(reachesView(box(0, 0, 5000, 5000), view)).toBe(true);
    });

    it("leaves out what is out of the view on any side, past the margin", () => {
        expect(VIEW_CULL_MARGIN_PX).toBe(64);
        expect(reachesView(box(1000 - 64 - 33, 600), view)).toBe(false);
        expect(reachesView(box(1800 + 65, 600), view)).toBe(false);
        expect(reachesView(box(1200, 500 - 64 - 33), view)).toBe(false);
        expect(reachesView(box(1200, 950 + 65), view)).toBe(false);
    });

    it("keeps what stands within the margin: an outline or a lean in the wind reaches past the image", () => {
        expect(reachesView(box(1000 - 64 - 32, 600), view)).toBe(true);
        expect(reachesView(box(1800 + 64, 600), view)).toBe(true);
        expect(reachesView(box(1200, 500 - 64 - 32), view)).toBe(true);
        expect(reachesView(box(1200, 950 + 64), view)).toBe(true);
    });

    it("takes the margin it is given", () => {
        expect(reachesView(box(1801, 600), view, 0)).toBe(false);
        expect(reachesView(box(1800, 600), view, 0)).toBe(true);
    });
});
