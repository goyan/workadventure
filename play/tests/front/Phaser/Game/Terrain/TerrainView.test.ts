import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import { TerrainView } from "../../../../../src/front/Phaser/Game/Terrain/TerrainView";
import { TerrainWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import type { WaterState } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";

const pit = withHeights(
    undefined,
    new Map([
        [cellKey(2, 2), -32],
        [cellKey(3, 2), -32],
    ]),
);
/** A whole state of the server: `depth` pixels of water over the two cells of the pit, on a grid around it. */
function stateOf(seq: number, depth: number): WaterState {
    const grid = { x: 0, y: 0, width: 8, height: 8 };
    const depths = new Uint8Array(grid.width * grid.height * 2);
    for (const column of [2, 3]) {
        const index = 2 * grid.width + column;
        depths[index * 2] = (depth * 8) & 255;
        depths[index * 2 + 1] = (depth * 8) >> 8;
    }
    return { ...grid, seq, full: true, depths };
}

function fixture(terrain: TerrainData | undefined = pit, flat = false) {
    const worldView = { x: 0, y: 0, width: 640, height: 480 };
    const scene = { cameras: { main: { worldView } }, markDirty: vi.fn() };
    const surface = {
        begin: vi.fn((_view: unknown, _resolution: number) => ({ x: -160, y: -128, columns: 62, rows: 47 })),
        paintField: vi.fn(),
        end: vi.fn(),
        hide: vi.fn(),
        destroy: vi.fn(),
    };
    const water = new TerrainWater();
    water.setTerrain(flat ? undefined : terrain);
    const view = new TerrainView(scene as unknown as GameScene, water, surface);
    return { view, water, scene, surface, worldView };
}

describe("TerrainView", () => {
    // A map without relief must cost nothing at every image.
    it("draws nothing and asks no redraw on a map without relief", () => {
        const { view, surface, scene } = fixture(undefined, true);
        view.update(0);
        view.update(16);
        view.update(32);
        expect(surface.begin).not.toHaveBeenCalled();
        expect(scene.markDirty).not.toHaveBeenCalled();
    });

    it("draws the relief once, then again only when the water or the relief changed", () => {
        const { view, water, surface, scene } = fixture();
        view.update(0);
        view.update(16);
        expect(surface.begin).toHaveBeenCalledTimes(1);
        expect(surface.begin.mock.calls[0][1]).toBe(16);
        expect(scene.markDirty).toHaveBeenCalledTimes(1);
        water.receive(stateOf(1, 4), 32);
        view.update(32);
        expect(surface.begin).toHaveBeenCalledTimes(2);
        water.setTerrain(withHeights(pit, new Map([[cellKey(4, 2), -16]])));
        view.update(48);
        expect(surface.begin).toHaveBeenCalledTimes(3);
        view.update(64);
        expect(surface.begin).toHaveBeenCalledTimes(3);
    });

    it("paints water only once there is some, and more faintly while the relief is edited", () => {
        const dry = fixture();
        dry.view.update(0);
        const layersDry = dry.surface.paintField.mock.calls.length;
        const wet = fixture();
        wet.water.receive(stateOf(1, 32), 0);
        wet.view.update(0);
        expect(wet.surface.paintField.mock.calls.length).toBeGreaterThan(layersDry);
        const alphaOf = (calls: unknown[][]): number => {
            const water = calls.find(([, , , , color]) => color === 0x7fb6d9);
            return (water?.[5] as (level: number) => number)(40);
        };
        const full = alphaOf(wet.surface.paintField.mock.calls);
        wet.view.setSeeThrough(true);
        wet.view.update(16);
        const layers = wet.surface.paintField.mock.calls.length / 2;
        expect(alphaOf(wet.surface.paintField.mock.calls.slice(-layers))).toBeLessThan(full);
    });

    // Reading the relief is the costly part of a drawing: a water that glides must not pay for it ten times a second.
    it("reads the relief once for a view, not again each time the water moves", () => {
        let reads = 0;
        const counted: TerrainData = {
            ...pit,
            get chunks() {
                reads++;
                return pit.chunks;
            },
        };
        const { view, water, surface } = fixture(counted);
        view.update(0);
        const afterFirst = reads;
        expect(afterFirst).toBeGreaterThan(0);
        water.receive(stateOf(1, 4), 16);
        view.update(16);
        water.receive(stateOf(2, 8), 1016);
        view.update(1500);
        expect(surface.begin).toHaveBeenCalledTimes(3);
        expect(reads).toBe(afterFirst);
    });

    it("draws again when the camera leaves what was drawn, not for a small scroll", () => {
        const { view, surface, worldView } = fixture();
        view.update(0);
        worldView.x += 20;
        view.update(16);
        expect(surface.begin).toHaveBeenCalledTimes(1);
        worldView.x += 2000;
        view.update(32);
        expect(surface.begin).toHaveBeenCalledTimes(2);
    });

    it("hides itself when the relief is filled in, and frees its surface when destroyed", () => {
        const { view, water, surface, scene } = fixture();
        view.update(0);
        water.setTerrain(undefined);
        view.update(16);
        expect(surface.hide).toHaveBeenCalledTimes(1);
        expect(scene.markDirty).toHaveBeenCalledTimes(2);
        view.update(32);
        expect(surface.hide).toHaveBeenCalledTimes(1);
        view.destroy();
        expect(surface.destroy).toHaveBeenCalledOnce();
    });
});
