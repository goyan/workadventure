import { describe, expect, it, vi } from "vitest";
import { quantizeWind } from "../../../../../src/front/Phaser/Game/Autumn/LeafDensity";
import { LeafScatterLayer } from "../../../../../src/front/Phaser/Game/Autumn/LeafScatterLayer";

describe("LeafScatterLayer", () => {
    it("fades its leaves with the layer alpha", () => {
        const graphics = { setDepth: vi.fn(() => graphics), setAlpha: vi.fn(() => graphics) };
        const scene = { add: { graphics: () => graphics } } as unknown as Phaser.Scene;
        new LeafScatterLayer(scene).setAlpha(0.6);
        expect(graphics.setAlpha).toHaveBeenLastCalledWith(0.6);
    });

    it("draws no leaf when the map is seen from far, and draws them again closer", () => {
        const graphics = {
            setDepth: vi.fn(() => graphics),
            clear: vi.fn(() => graphics),
            fillStyle: vi.fn(() => graphics),
            fillRect: vi.fn(() => graphics),
        };
        const camera = { zoom: 1 };
        const scene = { add: { graphics: () => graphics }, cameras: { main: camera } } as unknown as Phaser.Scene;
        const layer = new LeafScatterLayer(scene);
        const view = { x: 0, y: 0, width: 480, height: 480 };
        const sources = {
            trees: [{ x: 240, y: 240, width: 64 }],
            wind: quantizeWind(undefined, undefined),
            progress: 1,
        };
        expect(layer.update(view, () => true, sources, false)).toBe(true);
        const near = graphics.fillRect.mock.calls.length;
        expect(near).toBeGreaterThan(0);
        camera.zoom = 0.3;
        expect(layer.update(view, () => true, sources, false)).toBe(true);
        expect(graphics.clear).toHaveBeenCalledTimes(2);
        expect(graphics.fillRect.mock.calls.length).toBe(near);
        // Nothing more to do while it stays far.
        expect(layer.update(view, () => true, sources, false)).toBe(false);
        camera.zoom = 1;
        expect(layer.update(view, () => true, sources, false)).toBe(true);
        expect(graphics.fillRect.mock.calls.length).toBe(near * 2);
    });
});
