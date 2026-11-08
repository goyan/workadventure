import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { mockDeep } from "vitest-mock-extended";
import { WeatherType, type WAMFileFormat } from "@workadventure/map-editor";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const sounds = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("../../../../../src/front/Stores/MapEditorStore", () => ({ mapEditorModeStore: writable(false) }));
vi.mock("../../../../../src/front/Phaser/Game/Weather/WeatherSounds", () => ({
    WeatherSounds: class {
        public update = sounds.update;
        public destroy(): void {}
    },
}));
const { mapEditorModeStore } = await import("../../../../../src/front/Stores/MapEditorStore");
const { weatherEffectsEnabledStore } = await import("../../../../../src/front/Stores/WeatherStore");
const { WeatherManager } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherManager");
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");

let manager: InstanceType<typeof WeatherManager> | undefined;
afterEach(() => {
    sounds.update.mockClear();
    manager?.destroy();
    manager = undefined;
    weatherEffectsEnabledStore.set(true);
    mapEditorModeStore.set(false);
});

function fixture(): {
    scene: ReturnType<typeof mockDeep<GameScene>>;
    graphics: ReturnType<typeof mockDeep<Phaser.GameObjects.Graphics>>;
    wam: WAMFileFormat;
} {
    const scene = mockDeep<GameScene>();
    const graphics = mockDeep<Phaser.GameObjects.Graphics>();
    graphics.setDepth.mockReturnValue(graphics);
    graphics.setVisible.mockReturnValue(graphics);
    graphics.clear.mockReturnValue(graphics);
    scene.add.graphics.mockReturnValue(graphics);
    const map = mockDeep<ReturnType<GameScene["getGameMap"]>>();
    const file = mockDeep<NonNullable<ReturnType<typeof map.getWamFile>>>();
    const wam: WAMFileFormat = {
        version: "1.0.0",
        mapUrl: "test",
        entities: {},
        areas: [],
        entityCollections: [],
        settings: { weather: WeatherType.Rain },
    };
    file.getWam.mockReturnValue(wam);
    map.getWamFile.mockReturnValue(file);
    scene.getGameMap.mockReturnValue(map);
    scene.cameras.main.worldView.x = 0;
    scene.cameras.main.worldView.y = 0;
    scene.cameras.main.worldView.width = 800;
    scene.cameras.main.worldView.height = 600;
    return { scene, graphics, wam };
}

describe("weather rendering lifecycle", () => {
    it("animates while idle, throttles drawing and follows live map changes", () => {
        const { scene, graphics, wam } = fixture();
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        expect(graphics.lineTo.mock.calls.length).toBeGreaterThan(0);
        expect(scene.markDirty.mock.calls).toHaveLength(1);
        manager.update(10, new Date(10));
        expect(scene.markDirty.mock.calls).toHaveLength(1);
        manager.update(40, new Date(40));
        expect(scene.markDirty.mock.calls).toHaveLength(2);
        wam.settings = { weather: WeatherType.Snow };
        manager.update(80, new Date(80));
        expect(graphics.fillRect.mock.calls).toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
        wam.settings = { weather: WeatherType.Clear };
        manager.update(90, new Date(90));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
        manager.destroy();
        manager = undefined;
        expect(graphics.destroy.mock.calls).toHaveLength(1);
    });

    it("changes graphics and sounds together at the shared server boundary", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Automatic };
        manager = new WeatherManager(scene);
        manager.update(0, undefined);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Clear);
        manager.update(40, new Date(1800000));
        expect(graphics.lineTo.mock.calls.length).toBeGreaterThan(0);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Rain);
        manager.update(80, new Date(5400000));
        expect(graphics.fillRect.mock.calls).toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Snow);
        manager.update(120, new Date(7200000));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Clear);
    });

    it("hides effects immediately for the personal preference and the editor, then restores them", () => {
        const { scene, graphics } = fixture();
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        weatherEffectsEnabledStore.set(false);
        manager.update(1, new Date(1));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
        weatherEffectsEnabledStore.set(true);
        manager.update(2, new Date(2));
        expect(graphics.setVisible.mock.lastCall).toEqual([true]);
        mapEditorModeStore.set(true);
        manager.update(3, new Date(3));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
    });

    it("draws snow when christmas is active on a clear map", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene, { christmasActive: () => true });
        manager.update(0, new Date(0));
        expect(graphics.fillRect.mock.calls).toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Snow);
    });

    it("tints only outdoor runs in a storm", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Storm };
        scene.cameras.main.worldView.width = 320;
        scene.cameras.main.worldView.height = 320;
        const grid = OutdoorGrid.fromWalls(320, 320, 32, [
            { x: 64, y: 64, width: 160, height: 32 },
            { x: 64, y: 192, width: 160, height: 32 },
            { x: 64, y: 96, width: 32, height: 96 },
            { x: 192, y: 96, width: 32, height: 96 },
        ]);
        manager = new WeatherManager(scene, { outdoorGrid: () => grid });
        // 500 ms into the 23 s cycle: the storm glow is drawn too.
        manager.update(0, new Date(500));
        const rects = graphics.fillRect.mock.calls;
        expect(rects.length).toBeGreaterThan(0);
        for (const [x, y, width, height] of rects) {
            const coversRoomCenter = x <= 144 && 144 < x + width && y <= 144 && 144 < y + height;
            expect(coversRoomCenter).toBe(false);
        }
        for (const [x, y] of graphics.moveTo.mock.calls) {
            expect(grid.isOutdoorAt(x, y)).toBe(true);
        }
    });
});
