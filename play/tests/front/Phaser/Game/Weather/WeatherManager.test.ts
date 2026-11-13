import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { mockDeep } from "vitest-mock-extended";
import { WeatherType, type WAMFileFormat } from "@workadventure/map-editor";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const sounds = vi.hoisted(() => ({ update: vi.fn() }));
const ground = vi.hoisted(() => ({ update: vi.fn(), destroy: vi.fn() }));
vi.mock("../../../../../src/front/Phaser/Game/Weather/SnowGround", () => ({
    SnowGround: class {
        public update = ground.update;
        public destroy = ground.destroy;
    },
}));
vi.mock("../../../../../src/front/Stores/MapEditorStore", () => ({ mapEditorModeStore: writable(false) }));
vi.mock("../../../../../src/front/Phaser/Game/Weather/WeatherSounds", () => ({
    WeatherSounds: class {
        public update = sounds.update;
        public destroy(): void {}
    },
}));
const { mapEditorModeStore } = await import("../../../../../src/front/Stores/MapEditorStore");
const { weatherEffectsEnabledStore } = await import("../../../../../src/front/Stores/WeatherStore");
const { fogPatches } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherFrame");
const { autoWeatherAt, slotStart } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherSchedule");
const { WeatherManager } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherManager");
const { SeasonalTheme, SeasonalThemeMode } =
    await import("../../../../../src/front/Phaser/Game/Seasonal/SeasonalTheme");
const { seasonalThemeModeStore } = await import("../../../../../src/front/Stores/SeasonalThemeStore");
const view800 = { x: 0, y: 0, width: 800, height: 600 };
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");

let manager: InstanceType<typeof WeatherManager> | undefined;
afterEach(() => {
    sounds.update.mockClear();
    manager?.destroy();
    manager = undefined;
    ground.update.mockClear();
    ground.destroy.mockClear();
    weatherEffectsEnabledStore.set(true);
    mapEditorModeStore.set(false);
    seasonalThemeModeStore.set(SeasonalThemeMode.Auto);
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
        expect(ground.destroy).toHaveBeenCalledOnce();
    });

    it("draws nothing and asks no redraw while no outside is in view", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Rain };
        const indoors = { outdoorRunsInView: () => [], isOutdoorAt: () => false } as unknown as ReturnType<
            typeof OutdoorGrid.fromWalls
        >;
        manager = new WeatherManager(scene, { outdoorGrid: () => indoors });
        manager.update(0, new Date(0));
        manager.update(40, new Date(40));
        expect(graphics.setVisible.mock.calls).not.toContainEqual([true]);
        expect(scene.markDirty.mock.calls).toHaveLength(0);
    });

    it("moves the leaves 15 times a second, the rain 30 times", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn });
        manager.update(0, new Date(0));
        manager.update(40, new Date(40));
        expect(graphics.clear.mock.calls).toHaveLength(1);
        manager.update(70, new Date(70));
        expect(graphics.clear.mock.calls).toHaveLength(2);
    });

    it("changes graphics and sounds together at the shared server boundary", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Automatic };
        // Find, on the real schedule, a rainy slot, a later snowy one, then the first dry slot after that.
        const slot = 30 * 60 * 1000;
        let t = Date.parse("2026-01-05T00:00:00Z");
        const next = (weather: (typeof WeatherType)[keyof typeof WeatherType] | "dry"): number => {
            while (
                weather === "dry"
                    ? autoWeatherAt(new Date(t)) === WeatherType.Snow
                    : autoWeatherAt(new Date(t)) !== weather
            ) {
                t += slot;
                if (t > Date.parse("2026-03-01T00:00:00Z")) throw new Error(`no ${weather} slot`);
            }
            return t;
        };
        const rainy = next(WeatherType.Rain);
        const snowy = next(WeatherType.Snow);
        const dry = next("dry");
        expect(slotStart(new Date(dry)).getTime()).toBe(dry);
        manager = new WeatherManager(scene);
        manager.update(0, undefined);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Clear);
        manager.update(40, new Date(rainy));
        expect(graphics.lineTo.mock.calls.length).toBeGreaterThan(0);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Rain);
        manager.update(80, new Date(snowy));
        expect(graphics.fillRect.mock.calls).toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Snow);
        manager.update(120, new Date(dry));
        expect(sounds.update.mock.lastCall?.[0]).toBe(autoWeatherAt(new Date(dry)));
        expect(sounds.update.mock.lastCall?.[0]).not.toBe(WeatherType.Snow);
        expect(ground.update.mock.lastCall?.[2]).toBe(true);
    });

    it("hands the map's automatic settings to the schedule and the sounds", () => {
        const { scene, wam } = fixture();
        const auto = { frequency: "stormy" as const, include: [WeatherType.Fog] };
        wam.settings = { weather: WeatherType.Automatic, weatherAuto: auto };
        manager = new WeatherManager(scene);
        const date = new Date("2026-01-12T07:00:00Z");
        manager.update(0, date);
        expect(sounds.update.mock.lastCall?.[0]).toBe(autoWeatherAt(date, auto));
    });

    it("hides effects immediately for the personal preference and the editor, then restores them", () => {
        const { scene, graphics } = fixture();
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        weatherEffectsEnabledStore.set(false);
        manager.update(1, new Date(1));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
        expect(ground.update.mock.lastCall?.[2]).toBe(true);
        weatherEffectsEnabledStore.set(true);
        manager.update(2, new Date(2));
        expect(graphics.setVisible.mock.lastCall).toEqual([true]);
        mapEditorModeStore.set(true);
        manager.update(3, new Date(3));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
        expect(ground.update.mock.lastCall?.[2]).toBe(false);
    });

    it("draws green grass without a theme and never snow: the map snow is the Christmas decor", () => {
        const { scene, wam } = fixture();
        wam.settings = { weather: WeatherType.Snow, weatherStartedAt: 123 };
        manager = new WeatherManager(scene);
        const date = new Date(456);
        manager.update(0, date);
        expect(ground.update).toHaveBeenLastCalledWith(0, date, true, false);
    });

    it("passes the autumn ground for the autumn theme", () => {
        const { scene, wam } = fixture();
        wam.settings = { weather: WeatherType.Rain };
        manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn });
        manager.update(0, new Date(0));
        expect(ground.update.mock.lastCall?.[2]).toBe(true);
        expect(ground.update.mock.lastCall?.[3]).toBe(true);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Rain);
    });

    it("draws snow when christmas is active on a clear map", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Christmas });
        manager.update(0, new Date(0));
        expect(graphics.fillRect.mock.calls).toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Snow);
    });

    it("hides the seasonal ground while the christmas theme draws its own snow ground", () => {
        const { scene, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Christmas });
        manager.update(0, new Date(0));
        expect(ground.update.mock.lastCall?.[2]).toBe(false);
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

    it("draws falling leaves on a clear map", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn });
        manager.update(0, new Date(0));
        const leaves = graphics.fillRect.mock.calls.filter(
            ([, , width, height]) => (width === 4 && height === 3) || (width === 3 && height === 4),
        );
        expect(leaves.length).toBeGreaterThan(0);
        expect(graphics.setVisible.mock.lastCall).toEqual([true]);
    });

    it("keeps falling leaves outdoors only", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        scene.cameras.main.worldView.width = 320;
        scene.cameras.main.worldView.height = 320;
        const grid = OutdoorGrid.fromWalls(320, 320, 32, [
            { x: 64, y: 64, width: 160, height: 32 },
            { x: 64, y: 192, width: 160, height: 32 },
            { x: 64, y: 96, width: 32, height: 96 },
            { x: 192, y: 96, width: 32, height: 96 },
        ]);
        manager = new WeatherManager(scene, { outdoorGrid: () => grid, seasonalTheme: () => SeasonalTheme.Autumn });
        for (let time = 0; time < 20_000; time += 1000) manager.update(time, new Date(time));
        expect(graphics.fillRect.mock.calls.length).toBeGreaterThan(0);
        for (const [x, y] of graphics.fillRect.mock.calls) expect(grid.isOutdoorAt(x, y)).toBe(true);
    });

    it("stops falling leaves with the weather switch", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn });
        manager.update(0, new Date(0));
        weatherEffectsEnabledStore.set(false);
        manager.update(100, new Date(100));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
    });

    it("draws no leaves without the autumn theme", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        expect(graphics.fillRect.mock.calls).toHaveLength(0);
    });

    describe("fog", () => {
        const fogFill = (graphics: ReturnType<typeof fixture>["graphics"]) =>
            graphics.fillStyle.mock.calls.filter(([color]) => color === 0xdfe6ee);

        it("draws a fog veil outdoors, lighter at night", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene);
            manager.update(0, new Date(0));
            expect(fogFill(graphics)[0]).toEqual([0xdfe6ee, 0.2]);
            expect(graphics.fillRect.mock.calls).toContainEqual([0, 0, 800, 600]);
            expect(graphics.fillCircle.mock.calls.length).toBeGreaterThanOrEqual(9);
            expect(graphics.setVisible.mock.lastCall).toEqual([true]);
            graphics.fillStyle.mockClear();
            manager.update(100, new Date(100), true);
            expect(fogFill(graphics)[0]).toEqual([0xdfe6ee, 0.1]);
        });

        it("draws the fog patches only over outdoor cells", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            const none = { outdoorRunsInView: () => [view800], isOutdoorAt: () => false } as unknown as ReturnType<
                typeof OutdoorGrid.fromWalls
            >;
            manager = new WeatherManager(scene, { outdoorGrid: () => none });
            manager.update(0, new Date(0));
            expect(graphics.fillCircle.mock.calls).toHaveLength(0);
        });

        it("never lets a fog patch cover a room: centre and four edge points must be outdoors", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            const [first] = fogPatches(0, view800, false);
            const gridWith = (blocked: ((x: number, y: number) => boolean) | undefined) =>
                ({
                    outdoorRunsInView: () => [view800],
                    isOutdoorAt: (x: number, y: number) => !blocked?.(x, y),
                }) as unknown as ReturnType<typeof OutdoorGrid.fromWalls>;
            // Centre outdoors, but the right-hand edge point of the first patch is indoors.
            const edgeIndoors = gridWith((x, y) => x === first.x + first.radius && y === first.y);
            manager = new WeatherManager(scene, { outdoorGrid: () => edgeIndoors });
            manager.update(0, new Date(0));
            expect(graphics.fillCircle.mock.calls).toHaveLength(9);
            expect(graphics.fillCircle.mock.calls.some(([x, y]) => x === first.x && y === first.y)).toBe(false);
            manager.destroy();
            graphics.fillCircle.mockClear();
            const allOutdoors = gridWith(undefined);
            manager = new WeatherManager(scene, { outdoorGrid: () => allOutdoors });
            manager.update(0, new Date(0));
            expect(graphics.fillCircle.mock.calls).toHaveLength(12);
        });

        it("fog moves 15 times a second", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene);
            manager.update(0, new Date(0));
            manager.update(40, new Date(40));
            expect(graphics.clear.mock.calls).toHaveLength(1);
            manager.update(70, new Date(70));
            expect(graphics.clear.mock.calls).toHaveLength(2);
        });

        it("keeps the sound of fine weather", () => {
            const { scene, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene);
            manager.update(0, new Date(0));
            expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Fog);
        });

        it("shows the Christmas snow rather than the map fog", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Christmas });
            manager.update(0, new Date(0));
            expect(graphics.fillRect.mock.calls).toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
            expect(fogFill(graphics)).toHaveLength(0);
        });

        it("lets the autumn leaves fall through the fog", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn });
            manager.update(0, new Date(0));
            const leaves = graphics.fillRect.mock.calls.filter(
                ([, , width, height]) => (width === 4 && height === 3) || (width === 3 && height === 4),
            );
            expect(leaves.length).toBeGreaterThan(0);
            expect(fogFill(graphics).length).toBeGreaterThan(0);
        });

        it("stops the falling leaves while it snows", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Snow };
            manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn });
            manager.update(0, new Date("2026-01-12T12:00:00Z"));
            const leaves = graphics.fillRect.mock.calls.filter(
                ([, , width, height]) => (width === 4 && height === 3) || (width === 3 && height === 4),
            );
            expect(graphics.fillRect.mock.calls).toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
            expect(leaves).toHaveLength(0);
        });
    });
});
