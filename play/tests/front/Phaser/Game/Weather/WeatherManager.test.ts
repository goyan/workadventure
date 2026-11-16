import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { mockDeep } from "vitest-mock-extended";
import { WeatherType, type WAMFileFormat } from "@workadventure/map-editor";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const sounds = vi.hoisted(() => ({ update: vi.fn() }));
// The blocks (fog, clouds, shadows) painted on a canvas in the game: here, drawn on the graphics of the fixture.
const surface = vi.hoisted(() => ({
    graphics: undefined as
        | undefined
        | {
              fillStyle: (color: number, alpha?: number) => unknown;
              fillRect: (x: number, y: number, width: number, height: number) => unknown;
          },
}));
vi.mock("../../../../../src/front/Phaser/Game/Weather/BlockSurface", () => {
    type Cells = { x: number; y: number; columns: number; rows: number };
    let canvas: Cells = { x: 0, y: 0, columns: 0, rows: 0 };
    let size = 1;
    return {
        createBlockSurface: () => ({
            begin(view: { x: number; y: number; width: number; height: number }, resolution: number): Cells {
                size = resolution;
                canvas = {
                    x: Math.floor(view.x / resolution) * resolution,
                    y: Math.floor(view.y / resolution) * resolution,
                    columns: Math.ceil(view.width / resolution) + 1,
                    rows: Math.ceil(view.height / resolution) + 1,
                };
                return canvas;
            },
            // Each painted cell as a rectangle of the map, by level, like the blocks drawn before the canvas.
            paintField(
                field: Cells,
                levels: Uint8Array,
                outdoor: Uint8Array,
                shift: { columns: number; rows: number },
                color: number,
                alphaOf: (level: number) => number,
            ): void {
                const columnOffset = Math.round((canvas.x - field.x) / size) - shift.columns;
                const lineOffset = Math.round((canvas.y - field.y) / size) - shift.rows;
                for (let level = 1; level <= 8; level++) {
                    let styled = false;
                    for (let line = 0; line < canvas.rows; line++) {
                        for (let column = 0; column < canvas.columns; column++) {
                            if (!outdoor[line * canvas.columns + column]) continue;
                            const fieldLine = line + lineOffset;
                            const fieldColumn = column + columnOffset;
                            if (fieldLine < 0 || fieldLine >= field.rows || fieldColumn < 0) continue;
                            if (fieldColumn >= field.columns) continue;
                            if (levels[fieldLine * field.columns + fieldColumn] !== level) continue;
                            if (!styled) surface.graphics?.fillStyle(color, alphaOf(level));
                            styled = true;
                            surface.graphics?.fillRect(canvas.x + column * size, canvas.y + line * size, size, size);
                        }
                    }
                }
            },
            end(): void {},
            hide(): void {},
            destroy(): void {},
        }),
    };
});
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
const { cloudsShownStore, weatherEffectsEnabledStore } = await import("../../../../../src/front/Stores/WeatherStore");
const { lastStrike } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherFrame");
const { autoWeatherAt, cloudinessAt, slotStart } =
    await import("../../../../../src/front/Phaser/Game/Weather/WeatherSchedule");
const { WeatherManager } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherManager");
const { SeasonalTheme, SeasonalThemeMode } =
    await import("../../../../../src/front/Phaser/Game/Seasonal/SeasonalTheme");
const { seasonalThemeModeStore } = await import("../../../../../src/front/Stores/SeasonalThemeStore");
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");
const { NIGHT_CLOUD_COLOR } = await import("../../../../../src/front/Phaser/Game/Weather/Clouds");

let manager: InstanceType<typeof WeatherManager> | undefined;
afterEach(() => {
    sounds.update.mockClear();
    manager?.destroy();
    manager = undefined;
    ground.update.mockClear();
    ground.destroy.mockClear();
    weatherEffectsEnabledStore.set(true);
    cloudsShownStore.set(true);
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
    surface.graphics = graphics;
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

    describe("storm", () => {
        it("darkens more than rain, and flashes with a bolt right after a strike", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Storm };
            manager = new WeatherManager(scene, { reducedMotion: false });
            const strike = lastStrike(100_000).at;
            manager.update(0, new Date(strike + 60));
            expect(graphics.fillStyle.mock.calls).toContainEqual([0x27344b, 0.2]);
            const flash = graphics.fillStyle.mock.calls.find(([color]) => color === 0xe3eaff);
            expect(flash?.[1]).toBeGreaterThan(0.2);
            expect(graphics.lineStyle.mock.calls.some(([, color]) => color === 0xffffff)).toBe(true);
            graphics.fillStyle.mockClear();
            graphics.lineStyle.mockClear();
            manager.update(1000, new Date(strike + 5000));
            expect(graphics.fillStyle.mock.calls.some(([color]) => color === 0xe3eaff)).toBe(false);
            expect(graphics.lineStyle.mock.calls.some(([, color]) => color === 0xffffff)).toBe(false);
        });

        it("keeps a gentle glow and no bolt when motion is reduced", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Storm };
            manager = new WeatherManager(scene, { reducedMotion: true });
            manager.update(0, new Date(lastStrike(100_000).at + 600));
            const flash = graphics.fillStyle.mock.calls.find(([color]) => color === 0xe3eaff);
            expect(flash?.[1]).toBeGreaterThan(0);
            expect(flash?.[1]).toBeLessThanOrEqual(0.12);
            expect(graphics.lineStyle.mock.calls.some(([, color]) => color === 0xffffff)).toBe(false);
        });
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
        // Just after a strike: the flash is drawn too.
        manager.update(0, new Date(lastStrike(100_000).at + 60));
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

        it("draws a fog veil outdoors, lighter at night, and thicker patches over it", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene);
            manager.update(0, new Date(0));
            expect(fogFill(graphics)[0]).toEqual([0xdfe6ee, 0.6]);
            // A tenth of the screen beyond each edge: a scroll uncovers fog already drawn.
            expect(graphics.fillRect.mock.calls[0]).toEqual([-80, -60, 960, 720]);
            // The patches are drawn as blocks on top of the veil, at most 0.3 thicker.
            const patchAlphas = fogFill(graphics)
                .slice(1)
                .map(([, alpha]) => alpha ?? 0);
            expect(patchAlphas.length).toBeGreaterThan(0);
            expect(Math.min(...patchAlphas)).toBeGreaterThan(0);
            expect(Math.max(...patchAlphas)).toBeLessThanOrEqual(0.3 + 1e-9);
            expect(graphics.fillRect.mock.calls.length).toBeGreaterThan(1);
            expect(graphics.setVisible.mock.lastCall).toEqual([true]);
            graphics.fillStyle.mockClear();
            manager.update(200, new Date(200), true);
            expect(fogFill(graphics)[0][1]).toBeCloseTo(0.36, 5);
        });

        it("draws the fog only inside the outdoor runs", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            const run = { x: 64, y: 32, width: 96, height: 32 };
            const grid = { outdoorRunsInView: () => [run], isOutdoorAt: () => true } as unknown as ReturnType<
                typeof OutdoorGrid.fromWalls
            >;
            manager = new WeatherManager(scene, { outdoorGrid: () => grid });
            manager.update(0, new Date(0));
            expect(graphics.fillRect.mock.calls.length).toBeGreaterThan(0);
            for (const [x, y, width, height] of graphics.fillRect.mock.calls) {
                expect(x).toBeGreaterThanOrEqual(run.x);
                expect(y).toBeGreaterThanOrEqual(run.y);
                expect(x + width).toBeLessThanOrEqual(run.x + run.width);
                expect(y + height).toBeLessThanOrEqual(run.y + run.height);
            }
        });

        it("fog alone moves 5 times a second", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene);
            manager.update(0, new Date(0));
            manager.update(100, new Date(100));
            manager.update(199, new Date(199));
            expect(graphics.clear.mock.calls).toHaveLength(1);
            expect(scene.markDirty.mock.calls).toHaveLength(1);
            manager.update(200, new Date(200));
            expect(graphics.clear.mock.calls).toHaveLength(2);
            expect(scene.markDirty.mock.calls).toHaveLength(2);
        });

        it("draws again at once when a scroll nears the edge of what is drawn, not waiting for its 5 times a second", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene);
            manager.update(0, new Date(0));
            // A short move stays well inside the drawn margin: no drawing before the next fifth of a second.
            scene.cameras.main.worldView.x = 20;
            manager.update(30, new Date(30));
            expect(graphics.clear.mock.calls).toHaveLength(1);
            // A fast scroll comes past half the margin: drawn again right away, around the new view.
            scene.cameras.main.worldView.x = 60;
            manager.update(60, new Date(60));
            expect(graphics.clear.mock.calls).toHaveLength(2);
            expect(graphics.fillRect.mock.lastCall).toBeDefined();
            const veil = graphics.fillRect.mock.calls.find(([x, , width]) => x === -20 && width === 960);
            expect(veil).toBeDefined();
        });

        it("a still fog draws the map again only when something visible changes", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene, { reducedMotion: true });
            for (let time = 0; time <= 2000; time += 50) manager.update(time, new Date(time));
            expect(graphics.clear.mock.calls).toHaveLength(1);
            expect(scene.markDirty.mock.calls).toHaveLength(1);
            scene.cameras.main.worldView.x = 32;
            manager.update(2200, new Date(2200));
            expect(graphics.clear.mock.calls).toHaveLength(2);
            manager.update(2400, new Date(2400));
            expect(graphics.clear.mock.calls).toHaveLength(2);
            scene.cameras.main.zoom = 2;
            manager.update(2600, new Date(2600));
            expect(graphics.clear.mock.calls).toHaveLength(3);
            manager.update(2800, new Date(2800), true);
            expect(graphics.clear.mock.calls).toHaveLength(4);
            expect(scene.markDirty.mock.calls).toHaveLength(4);
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

    describe("clouds", () => {
        const sun = { elevation: 30, azimuth: 180 };
        const at = new Date("2026-11-14T11:00:00Z");
        const whites = (graphics: ReturnType<typeof fixture>["graphics"]) =>
            graphics.fillStyle.mock.calls.filter(([color]) => color === 0xffffff).length;
        const shadows = (graphics: ReturnType<typeof fixture>["graphics"]) =>
            graphics.fillStyle.mock.calls.filter(([color]) => color === 0x000000).length;

        it("draws white clouds and their shadows for a cloudy sky, with no rain and the sound of fine weather", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Cloudy };
            manager = new WeatherManager(scene);
            manager.update(0, at, false, sun);
            expect(whites(graphics)).toBeGreaterThan(0);
            expect(shadows(graphics)).toBeGreaterThan(0);
            expect(graphics.lineTo.mock.calls).toHaveLength(0);
            expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Clear);
            expect(scene.markDirty.mock.calls).toHaveLength(1);
        });

        it("paints cumulus with a lit side, a middle and a shaded side, gone zoomed in under them, their shadows kept", () => {
            const painted = (zoom: number) => {
                const { scene, graphics, wam } = fixture();
                wam.settings = { weather: WeatherType.Cloudy };
                scene.cameras.main.zoom = zoom;
                // A view as big as the repeated square of the sky: every cloud is in it.
                scene.cameras.main.worldView.width = 2100;
                scene.cameras.main.worldView.height = 2100;
                manager = new WeatherManager(scene);
                manager.update(0, at, false, sun);
                const calls = graphics.fillStyle.mock.calls.filter(([color]) => color !== 0x000000);
                const shadowCalls = graphics.fillStyle.mock.calls.length - calls.length;
                manager.destroy();
                manager = undefined;
                return { colors: new Set(calls.map(([color]) => color)), shadowCalls };
            };
            const far = painted(0.4);
            expect(far.colors.size).toBeGreaterThanOrEqual(3);
            expect(far.colors.has(0xffffff)).toBe(true);
            const near = painted(2);
            expect(near.colors.size).toBe(0);
            expect(near.shadowCalls).toBeGreaterThan(0);
        });

        it("moves 15 times a second, so they glide", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Cloudy };
            manager = new WeatherManager(scene);
            manager.update(0, at, false, sun);
            manager.update(50, new Date(at.getTime() + 50), false, sun);
            expect(graphics.clear.mock.calls).toHaveLength(1);
            manager.update(70, new Date(at.getTime() + 70), false, sun);
            expect(graphics.clear.mock.calls).toHaveLength(2);
        });

        it("lets the clouds of a clear sky fade out over the first minutes of a rain", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Automatic };
            // On the real schedule: a clouded clear slot followed by a rainy one.
            const slot = 30 * 60 * 1000;
            let rainStart: number | undefined;
            for (let t = Date.parse("2026-01-05T00:00:00Z"); t < Date.parse("2026-03-01T00:00:00Z"); t += slot) {
                if (
                    autoWeatherAt(new Date(t)) === WeatherType.Rain &&
                    autoWeatherAt(new Date(t - 1)) === WeatherType.Clear &&
                    cloudinessAt(new Date(t - 1)) > 0
                ) {
                    rainStart = t;
                    break;
                }
            }
            if (rainStart === undefined) throw new Error("no clouded clear slot before a rain");
            // A view as big as the repeated square of the sky: every cloud is in it.
            scene.cameras.main.worldView.width = 1400;
            scene.cameras.main.worldView.height = 1400;
            manager = new WeatherManager(scene);
            manager.update(0, new Date(rainStart + 60_000), false, sun);
            expect(whites(graphics)).toBeGreaterThan(0);
            expect(graphics.lineTo.mock.calls.length).toBeGreaterThan(0);
        });

        it("covers rain with grey clouds and a storm with dark ones, the rain falling under them, without shadows", () => {
            const { scene, graphics, wam } = fixture();
            const of = (color: number) => graphics.fillStyle.mock.calls.filter(([fill]) => fill === color).length;
            wam.settings = { weather: WeatherType.Rain };
            manager = new WeatherManager(scene);
            manager.update(0, at, false, sun);
            expect(of(0x7d8794)).toBeGreaterThan(0);
            expect(of(0x2b3240)).toBe(0);
            expect(shadows(graphics)).toBe(0);
            expect(graphics.lineTo.mock.calls.length).toBeGreaterThan(0);
            graphics.fillStyle.mockClear();
            wam.settings = { weather: WeatherType.Storm };
            manager.update(1000, new Date(at.getTime() + 1000), false, sun);
            expect(of(0x2b3240)).toBeGreaterThan(0);
            expect(shadows(graphics)).toBe(0);
        });

        it("paints rain and storm clouds as cumulus too, in three tones, gone zoomed in under them", () => {
            for (const [weather, mid] of [
                [WeatherType.Rain, 0x7d8794],
                [WeatherType.Storm, 0x2b3240],
            ] as const) {
                const painted = (zoom: number) => {
                    const { scene, graphics, wam } = fixture();
                    wam.settings = { weather };
                    scene.cameras.main.zoom = zoom;
                    scene.cameras.main.worldView.width = 2100;
                    scene.cameras.main.worldView.height = 2100;
                    manager = new WeatherManager(scene);
                    manager.update(0, at, false, sun);
                    // The cloud tones only: neither the veil of the sky nor the flash of a strike.
                    const calls = graphics.fillStyle.mock.calls.filter(
                        ([color]) => color !== 0x27344b && color !== 0xe3eaff,
                    );
                    manager.destroy();
                    manager = undefined;
                    return new Set(calls.map(([color]) => color));
                };
                const far = painted(0.4);
                expect(far.size).toBeGreaterThanOrEqual(3);
                expect(far.has(mid)).toBe(true);
                expect(painted(2).size).toBe(0);
            }
        });

        it("has no shadow with a low sun, and dark clouds without shadows at night", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Cloudy };
            manager = new WeatherManager(scene);
            manager.update(0, at, false, { elevation: 1, azimuth: 240 });
            // Already a little tinted by the dusk: clouds, not shadows.
            expect(graphics.fillStyle.mock.calls.length).toBeGreaterThan(0);
            expect(shadows(graphics)).toBe(0);
            graphics.fillStyle.mockClear();
            manager.update(1000, new Date(at.getTime() + 1000), true, { elevation: -10, azimuth: 260 });
            expect(graphics.setVisible.mock.lastCall).toEqual([true]);
            expect(
                graphics.fillStyle.mock.calls.filter(([color]) => color === NIGHT_CLOUD_COLOR).length,
            ).toBeGreaterThan(0);
            expect(whites(graphics)).toBe(0);
            expect(shadows(graphics)).toBe(0);
        });

        it("draws nothing with the personal switch off, the weather hidden or the editor open", () => {
            for (const hide of [
                () => cloudsShownStore.set(false),
                () => weatherEffectsEnabledStore.set(false),
                () => mapEditorModeStore.set(true),
            ]) {
                const { scene, graphics, wam } = fixture();
                wam.settings = { weather: WeatherType.Cloudy };
                hide();
                manager = new WeatherManager(scene);
                manager.update(0, at, false, sun);
                expect(whites(graphics)).toBe(0);
                expect(graphics.setVisible.mock.calls).not.toContainEqual([true]);
                manager.destroy();
                manager = undefined;
                cloudsShownStore.set(true);
                weatherEffectsEnabledStore.set(true);
                mapEditorModeStore.set(false);
            }
        });

        it("stands still when motion is reduced, drawing again only when something visible changes", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Cloudy };
            manager = new WeatherManager(scene, { reducedMotion: true });
            manager.update(0, at, false, sun);
            manager.update(1000, new Date(at.getTime() + 1000), false, sun);
            expect(graphics.clear.mock.calls).toHaveLength(1);
            manager.update(2000, new Date(at.getTime() + 2000), false, { elevation: 20, azimuth: 200 });
            expect(graphics.clear.mock.calls).toHaveLength(2);
        });
    });
});
