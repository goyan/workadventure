import { describe, expect, it, vi } from "vitest";
import { quantizeWind } from "../../../../../src/front/Phaser/Game/Autumn/LeafDensity";
import { LeafScatterLayer } from "../../../../../src/front/Phaser/Game/Autumn/LeafScatterLayer";
import { DEPTH_TILE_INDEX } from "../../../../../src/front/Phaser/Game/DepthIndexes";
import { tellPixelBlocksShown } from "../../../../../src/front/Phaser/Game/Terrain/PixelBlocksShown";

describe("LeafScatterLayer", () => {
    it("fades its leaves with the layer alpha", () => {
        const graphics = { setDepth: vi.fn(() => graphics), setAlpha: vi.fn(() => graphics) };
        const scene = { add: { graphics: () => graphics } } as unknown as Phaser.Scene;
        new LeafScatterLayer(scene).setAlpha(0.6);
        expect(graphics.setAlpha).toHaveBeenLastCalledWith(0.6);
    });

    it("lies over the ground of whichever engine draws it: higher over the blocks of the relief in 3/4", () => {
        const depths: number[] = [];
        const graphics = {
            setDepth: vi.fn((depth: number) => {
                depths.push(depth);
                return graphics;
            }),
            clear: vi.fn(() => graphics),
            fillStyle: vi.fn(() => graphics),
            fillRect: vi.fn(() => graphics),
        };
        const scene = { add: { graphics: () => graphics }, cameras: { main: { zoom: 1 } } } as unknown as Phaser.Scene;
        const layer = new LeafScatterLayer(scene);
        const view = { x: 0, y: 0, width: 480, height: 480 };
        const sources = { trees: [], wind: quantizeWind(undefined, undefined), progress: 1 };
        // As on a map drawn flat: just over its ground (0.65 over the tiles).
        expect(depths[depths.length - 1]).toBeCloseTo(DEPTH_TILE_INDEX + 0.65);
        tellPixelBlocksShown(() => true);
        layer.update(view, () => true, sources, false);
        expect(depths[depths.length - 1]).toBeCloseTo(DEPTH_TILE_INDEX + 0.67);
        tellPixelBlocksShown(undefined);
        layer.update(view, () => true, sources, false);
        expect(depths[depths.length - 1]).toBeCloseTo(DEPTH_TILE_INDEX + 0.65);
    });

    it("lays its leaves where the ground is drawn on a relief seen in 3/4, and again when that changes", () => {
        const graphics = {
            setDepth: vi.fn(() => graphics),
            clear: vi.fn(() => graphics),
            fillStyle: vi.fn(() => graphics),
            fillRect: vi.fn(() => graphics),
        };
        const scene = { add: { graphics: () => graphics }, cameras: { main: { zoom: 1 } } } as unknown as Phaser.Scene;
        const view = { x: 0, y: 0, width: 480, height: 480 };
        const sources = {
            trees: [{ x: 240, y: 240, width: 64 }],
            wind: quantizeWind(undefined, undefined),
            progress: 1,
        };
        const flat = new LeafScatterLayer(scene);
        flat.update(view, () => true, sources, false);
        const rows = graphics.fillRect.mock.calls.map((call) => (call as unknown as number[])[1]);
        expect(rows.length).toBeGreaterThan(0);
        graphics.fillRect.mockClear();
        // The same leaves on a hollow drawn 40 px lower.
        let drop = 40;
        let version = 1;
        const lower = new LeafScatterLayer(
            scene,
            () => drop,
            () => version,
        );
        lower.update(view, () => true, sources, false);
        expect(graphics.fillRect.mock.calls.map((call) => (call as unknown as number[])[1])).toEqual(
            rows.map((row) => row + 40),
        );
        // Nothing moved: not drawn again.
        expect(lower.update(view, () => true, sources, false)).toBe(false);
        // The relief is seen flat again.
        drop = 0;
        version = 2;
        graphics.fillRect.mockClear();
        expect(lower.update(view, () => true, sources, false)).toBe(true);
        expect(graphics.fillRect.mock.calls.map((call) => (call as unknown as number[])[1])).toEqual(rows);
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
