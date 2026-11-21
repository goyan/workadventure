import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { mockDeep } from "vitest-mock-extended";
import { cellKey, WeatherType, type WAMFileFormat, withHeights } from "@workadventure/map-editor";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const sounds = vi.hoisted(() => ({ update: vi.fn() }));
// The blocks (fog, clouds, shadows) painted on a canvas in the game: here, drawn on the graphics of the fixture.
const surface = vi.hoisted(() => ({
    /** How many times the canvas of the clouds was painted again. */
    begins: 0,
    /** The depth each block surface was made at, in order. */
    depths: [] as number[],
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
        createBlockSurface: (_scene: unknown, depth: number) => {
            surface.depths.push(depth);
            return {
                begin(view: { x: number; y: number; width: number; height: number }, resolution: number): Cells {
                    surface.begins++;
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
                                surface.graphics?.fillRect(
                                    canvas.x + column * size,
                                    canvas.y + line * size,
                                    size,
                                    size,
                                );
                            }
                        }
                    }
                },
                end(): void {},
                hide(): void {},
                destroy(): void {},
            };
        },
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
const { cloudsShownStore, cloudsHeightStore, rainPuddlesStore, weatherEffectsEnabledStore } =
    await import("../../../../../src/front/Stores/WeatherStore");
const { lastStrike } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherFrame");
const { autoWeatherAt, cloudinessAt, slotStart } =
    await import("../../../../../src/front/Phaser/Game/Weather/WeatherSchedule");
const { WeatherManager, blocksPerSecond } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherManager");
const { SeasonalTheme, SeasonalThemeMode } =
    await import("../../../../../src/front/Phaser/Game/Seasonal/SeasonalTheme");
const { seasonalThemeModeStore } = await import("../../../../../src/front/Stores/SeasonalThemeStore");
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");
const { DEPTH_DOOR_LOCK_INDEX, DEPTH_LAMP_LIGHT_INDEX } =
    await import("../../../../../src/front/Phaser/Game/DepthIndexes");
const { NIGHT_CLOUD_COLOR } = await import("../../../../../src/front/Phaser/Game/Weather/Clouds");

let manager: InstanceType<typeof WeatherManager> | undefined;
// The puddles are drawn on a graphics of their own, which the scene of these tests does not tell from the weather's:
// off here, tried in their own tests below.
beforeEach(() => rainPuddlesStore.set(0));
afterEach(() => {
    sounds.update.mockClear();
    manager?.destroy();
    manager = undefined;
    ground.update.mockClear();
    ground.destroy.mockClear();
    weatherEffectsEnabledStore.set(true);
    cloudsShownStore.set(true);
    cloudsHeightStore.set(0);
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
        // A map saved with a snow rains like any rain: no flake without the cold.
        const drops = graphics.lineTo.mock.calls.length;
        wam.settings = { weather: WeatherType.Snow };
        manager.update(80, new Date(80));
        expect(graphics.lineTo.mock.calls.length).toBeGreaterThan(drops);
        expect(graphics.fillRect.mock.calls).not.toContainEqual([expect.any(Number), expect.any(Number), 2, 2]);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Rain);
        wam.settings = { weather: WeatherType.Clear };
        manager.update(90, new Date(90));
        expect(graphics.setVisible.mock.lastCall).toEqual([false]);
        manager.destroy();
        manager = undefined;
        // The weather and the puddles each have their graphics.
        expect(graphics.destroy.mock.calls).toHaveLength(2);
        expect(ground.destroy).toHaveBeenCalledOnce();
    });

    it("lets the rain fall as flakes in the cold of the room, as both in a sleet, and tells the sounds", () => {
        const flake = [expect.any(Number), expect.any(Number), 2, 2];
        const drawn = (snow: number | undefined, weather = WeatherType.Rain) => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather };
            manager?.destroy();
            manager = new WeatherManager(scene, snow === undefined ? {} : { snowShare: () => snow });
            manager.update(0, new Date(0));
            return {
                drops: graphics.lineTo.mock.calls.length,
                flakes: graphics.fillRect.mock.calls.filter(([, , width, height]) => width === 2 && height === 2)
                    .length,
                graphics,
            };
        };
        const rain = drawn(undefined);
        expect(rain.drops).toBeGreaterThan(0);
        expect(rain.flakes).toBe(0);
        expect(sounds.update.mock.lastCall?.[5]).toBe(0);
        const snow = drawn(1);
        expect(snow.drops).toBe(0);
        expect(snow.flakes).toBeGreaterThan(0);
        expect(snow.graphics.fillRect.mock.calls).toContainEqual(flake);
        // The weather stays a rain: only its form changed.
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Rain);
        expect(sounds.update.mock.lastCall?.[5]).toBe(1);
        const sleet = drawn(0.5);
        expect(sleet.drops).toBeGreaterThan(0);
        expect(sleet.drops).toBeLessThan(rain.drops);
        expect(sleet.flakes).toBeGreaterThan(0);
        expect(sleet.flakes).toBeLessThan(snow.flakes);
        // Nothing falls from a clear sky or a fog, however cold.
        expect(drawn(1, WeatherType.Clear).flakes).toBe(0);
        expect(sounds.update.mock.lastCall?.[5]).toBe(0);
        expect(drawn(1, WeatherType.Fog).flakes).toBe(0);
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

    // The clouds drift by whole blocks: painting them as often as the rain falls took a fifth of the time of an image.
    it("draws the rain 30 times a second and paints its clouds a few times only", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Rain };
        manager = new WeatherManager(scene);
        surface.begins = 0;
        for (const now of [0, 40, 80, 120, 160]) manager.update(now, new Date(now));
        expect(graphics.clear.mock.calls).toHaveLength(5);
        expect(surface.begins).toBeGreaterThanOrEqual(1);
        expect(surface.begins).toBeLessThanOrEqual(3);
        // Painted again once their time has come.
        const painted = surface.begins;
        manager.update(400, new Date(400));
        expect(surface.begins).toBe(painted + 1);
    });

    it("paints the clouds less often the larger their blocks", () => {
        expect(blocksPerSecond(4)).toBe(10);
        expect(blocksPerSecond(16)).toBe(8);
        expect(blocksPerSecond(64)).toBe(6);
    });

    it("changes graphics and sounds together at the shared server boundary", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Automatic };
        // Find, on the real schedule, a rainy slot, then the first slot without rain after it.
        const slot = 30 * 60 * 1000;
        let t = Date.parse("2026-01-05T00:00:00Z");
        const next = (weather: (typeof WeatherType)[keyof typeof WeatherType] | "dry"): number => {
            while (
                weather === "dry"
                    ? autoWeatherAt(new Date(t)) === WeatherType.Rain
                    : autoWeatherAt(new Date(t)) !== weather
            ) {
                t += slot;
                if (t > Date.parse("2026-03-01T00:00:00Z")) throw new Error(`no ${weather} slot`);
            }
            return t;
        };
        const rainy = next(WeatherType.Rain);
        const dry = next("dry");
        expect(slotStart(new Date(dry)).getTime()).toBe(dry);
        manager = new WeatherManager(scene);
        manager.update(0, undefined);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Clear);
        manager.update(40, new Date(rainy));
        expect(graphics.lineTo.mock.calls.length).toBeGreaterThan(0);
        expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Rain);
        manager.update(120, new Date(dry));
        expect(sounds.update.mock.lastCall?.[0]).toBe(autoWeatherAt(new Date(dry)));
        expect(sounds.update.mock.lastCall?.[0]).not.toBe(WeatherType.Rain);
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

    it("leaves the grass of the map to the relief in 3/4 while it is shown: its blocks draw it", async () => {
        const { tellPixelReliefShown } = await import("../../../../../src/front/Phaser/Game/Terrain/PixelReliefShown");
        const { scene } = fixture();
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        expect(ground.update.mock.lastCall?.[2]).toBe(true);
        tellPixelReliefShown(() => true);
        manager.update(1, new Date(1));
        expect(ground.update.mock.lastCall?.[2]).toBe(false);
        tellPixelReliefShown(undefined);
        manager.update(2, new Date(2));
        expect(ground.update.mock.lastCall?.[2]).toBe(true);
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

    it("draws green grass without a theme, also on a map saved with a snow", () => {
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

    // In autumn the leaves come from the trees (Nature/TreeLeafFall, Autumn/LeafScatterLayer): none fall from the sky.
    it("draws nothing on a clear map in autumn", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Clear };
        manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn });
        for (let time = 0; time < 2000; time += 100) manager.update(time, new Date(time));
        expect(graphics.fillRect.mock.calls).toHaveLength(0);
        expect(graphics.setVisible.mock.calls).not.toContainEqual([true]);
        expect(scene.markDirty.mock.calls).toHaveLength(0);
    });

    it("draws the same rain in autumn as without a theme", () => {
        const draw = (theme?: (typeof SeasonalTheme)[keyof typeof SeasonalTheme]) => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Rain };
            manager = new WeatherManager(scene, { seasonalTheme: () => theme });
            manager.update(0, new Date(0));
            const rects = graphics.fillRect.mock.calls.map((call) => [...call]);
            manager.destroy();
            manager = undefined;
            return rects;
        };
        expect(draw(SeasonalTheme.Autumn)).toEqual(draw(undefined));
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

        // Seen from far the outdoors is hundreds of runs: as rectangles, the engine drew them again at every image.
        it("paints the veil in the canvas of the clouds when its rectangles are too many", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            const runs = Array.from({ length: 200 }, (_, row) => ({ x: 0, y: row * 4, width: 1000, height: 4 }));
            const grid = { outdoorRunsInView: () => runs, isOutdoorAt: () => true } as unknown as ReturnType<
                typeof OutdoorGrid.fromWalls
            >;
            manager = new WeatherManager(scene, { outdoorGrid: () => grid });
            manager.update(0, new Date(0));
            // Still a veil of the colour of the fog, but none of the 200 runs drawn as a rectangle.
            expect(fogFill(graphics).length).toBeGreaterThan(0);
            expect(graphics.fillRect.mock.calls.some(([, , width]) => width === 1000)).toBe(false);
        });

        // Reading the outdoors of the view is the costly part of a drawing: not again while nothing changed.
        it("reads the outdoors of the view once while the walls and the view stay the same", () => {
            const { scene, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            const run = { x: 64, y: 32, width: 96, height: 32 };
            const outdoorRunsInView = vi.fn(() => [run]);
            const grid = { outdoorRunsInView, isOutdoorAt: () => true } as unknown as ReturnType<
                typeof OutdoorGrid.fromWalls
            >;
            let walls = grid;
            manager = new WeatherManager(scene, { outdoorGrid: () => walls });
            manager.update(0, new Date(0));
            manager.update(200, new Date(200));
            manager.update(400, new Date(400));
            expect(outdoorRunsInView).toHaveBeenCalledTimes(1);
            // Read for a view widened to whole steps: a small scroll stays inside it.
            const asked = outdoorRunsInView.mock.calls[0] as unknown as [{ x: number; width: number }];
            expect(Math.abs(asked[0].x % 256)).toBe(0);
            expect(asked[0].width % 256).toBe(0);
            // A wall built or removed makes another grid: read again.
            walls = { ...grid } as typeof grid;
            manager.update(600, new Date(600));
            expect(outdoorRunsInView).toHaveBeenCalledTimes(2);
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

        // Seen from far, bright rooms and their lamps stood out of a map washed by the fog (the team map in the beta).
        describe("seen from far", () => {
            const covers = (graphics: ReturnType<typeof fixture>["graphics"], x: number, y: number) =>
                graphics.fillRect.mock.calls.some(
                    ([left, top, width, height]) => left <= x && x < left + width && top <= y && y < top + height,
                );
            // Two closed rooms, the avatar in the first one.
            const twoRooms = () => {
                const { scene, graphics, wam } = fixture();
                wam.settings = { weather: WeatherType.Fog };
                scene.cameras.main.worldView.width = 640;
                scene.cameras.main.worldView.height = 320;
                const grid = OutdoorGrid.fromWalls(640, 320, 32, [
                    { x: 64, y: 64, width: 160, height: 32 },
                    { x: 64, y: 192, width: 160, height: 32 },
                    { x: 64, y: 96, width: 32, height: 96 },
                    { x: 192, y: 96, width: 32, height: 96 },
                    { x: 352, y: 64, width: 160, height: 32 },
                    { x: 352, y: 192, width: 160, height: 32 },
                    { x: 352, y: 96, width: 32, height: 96 },
                    { x: 480, y: 96, width: 32, height: 96 },
                ]);
                return { scene, graphics, grid };
            };

            it("passes over the other buildings, never over the room the avatar stands in", () => {
                const { scene, graphics, grid } = twoRooms();
                scene.cameras.main.zoom = 0.3;
                manager = new WeatherManager(scene, {
                    outdoorGrid: () => grid,
                    avatarRoom: () => grid.roomAt(144, 144),
                });
                manager.update(0, new Date(0));
                expect(covers(graphics, 432, 144)).toBe(true);
                expect(covers(graphics, 144, 144)).toBe(false);
                // The veil over the buildings as thick as outdoors.
                expect(fogFill(graphics).some(([, alpha]) => Math.abs((alpha ?? 0) - 0.6) < 1e-9)).toBe(true);
            });

            it("leaves the rooms clear seen from close", () => {
                const { scene, graphics, grid } = twoRooms();
                scene.cameras.main.zoom = 1;
                manager = new WeatherManager(scene, { outdoorGrid: () => grid, avatarRoom: () => undefined });
                manager.update(0, new Date(0));
                expect(covers(graphics, 432, 144)).toBe(false);
                expect(covers(graphics, 144, 144)).toBe(false);
            });

            it("thickens over the buildings as the camera rises, with no jump", () => {
                const veilOverRoom = (zoom: number) => {
                    const { scene, graphics, grid } = twoRooms();
                    scene.cameras.main.zoom = zoom;
                    manager?.destroy();
                    manager = new WeatherManager(scene, { outdoorGrid: () => grid });
                    manager.update(0, new Date(0));
                    const order = graphics.fillStyle.mock.invocationCallOrder;
                    // The style last set before the rectangle drawn over the centre of the second room.
                    const index = graphics.fillRect.mock.calls.findIndex(
                        ([left, top, width, height]) =>
                            left <= 432 && 432 < left + width && top <= 144 && 144 < top + height,
                    );
                    if (index < 0) return 0;
                    const at = graphics.fillRect.mock.invocationCallOrder[index];
                    const style = order.filter((call) => call < at).length - 1;
                    return graphics.fillStyle.mock.calls[style][1] ?? 0;
                };
                const middle = veilOverRoom(0.575);
                expect(veilOverRoom(0.7)).toBe(0);
                expect(middle).toBeGreaterThan(0.2);
                expect(middle).toBeLessThan(0.4);
                expect(veilOverRoom(0.45)).toBeCloseTo(0.6, 5);
            });

            it("lies over the lights of the lamps", () => {
                surface.depths.length = 0;
                const { scene } = fixture();
                manager = new WeatherManager(scene);
                expect(surface.depths).toContain(DEPTH_LAMP_LIGHT_INDEX + 10);
                expect(Math.max(...surface.depths)).toBeLessThan(DEPTH_DOOR_LOCK_INDEX);
            });
        });

        it("keeps the sound of fine weather", () => {
            const { scene, wam } = fixture();
            wam.settings = { weather: WeatherType.Fog };
            manager = new WeatherManager(scene);
            manager.update(0, new Date(0));
            expect(sounds.update.mock.lastCall?.[0]).toBe(WeatherType.Fog);
        });

        it("draws the flakes of a cold rain in autumn, with no leaf falling from the sky", () => {
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Rain };
            manager = new WeatherManager(scene, { seasonalTheme: () => SeasonalTheme.Autumn, snowShare: () => 1 });
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

        it("keeps the clouds at every zoom for whoever raised them to the top (a personal setting)", () => {
            cloudsHeightStore.set(1);
            const { scene, graphics, wam } = fixture();
            wam.settings = { weather: WeatherType.Cloudy };
            scene.cameras.main.zoom = 2;
            scene.cameras.main.worldView.width = 2100;
            scene.cameras.main.worldView.height = 2100;
            manager = new WeatherManager(scene);
            manager.update(0, at, false, sun);
            const colors = new Set(
                graphics.fillStyle.mock.calls.filter(([color]) => color !== 0x000000).map(([color]) => color),
            );
            expect(colors.has(0xffffff)).toBe(true);
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

        it("fades the clouds by their scale on the screen, the canvas stretched or not (Retina screens)", () => {
            const shown = (cameraZoom: number, displayScale: number) => {
                const { scene, graphics, wam } = fixture();
                wam.settings = { weather: WeatherType.Cloudy };
                scene.cameras.main.zoom = cameraZoom;
                // Phaser's display scale: game pixels per screen pixel of the canvas.
                scene.scale.displayScale.x = displayScale;
                scene.cameras.main.worldView.width = 2100;
                scene.cameras.main.worldView.height = 2100;
                manager = new WeatherManager(scene);
                manager.update(0, at, false, sun);
                const count = whites(graphics);
                manager.destroy();
                manager = undefined;
                return count;
            };
            // The camera at 1 over a canvas stretched 1.5 times (a map just opened): under the clouds.
            expect(shown(1, 1 / 1.5)).toBe(0);
            // The camera at 1 over a canvas shrunk to 0.75: the clouds show.
            expect(shown(1, 1 / 0.75)).toBeGreaterThan(0);
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
                    // The cloud tones only: neither the veil of the sky, the flash of a strike nor the splashes.
                    const calls = graphics.fillStyle.mock.calls.filter(
                        ([color]) => color !== 0x27344b && color !== 0xe3eaff && color !== 0xcfe3f5,
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

describe("puddles", () => {
    it("draws puddles on the ground under a rain, outdoors only, and none at 0 %", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Rain };
        scene.cameras.main.worldView.width = 640;
        scene.cameras.main.worldView.height = 640;
        const indoors = { outdoorRunsInView: () => [], isOutdoorAt: () => false } as unknown as ReturnType<
            typeof OutdoorGrid.fromWalls
        >;
        manager = new WeatherManager(scene, { outdoorGrid: () => indoors });
        rainPuddlesStore.set(1);
        manager.update(0, new Date(0));
        expect(graphics.fillStyle.mock.calls.some(([color]) => color === 0x4f7ba6)).toBe(false);
        manager.destroy();
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        expect(graphics.fillStyle.mock.calls.some(([color]) => color === 0x4f7ba6)).toBe(true);
        const drawn = graphics.fillStyle.mock.calls.length;
        rainPuddlesStore.set(0);
        manager.update(40, new Date(40));
        expect(graphics.fillStyle.mock.calls.slice(drawn).some(([color]) => color === 0x4f7ba6)).toBe(false);
    });

    // The whole map seen from far holds so many puddles that drawing them took most of the time of an image.
    it("draws no puddle when the map is seen from far, and draws them again closer", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Rain };
        scene.cameras.main.worldView.width = 640;
        scene.cameras.main.worldView.height = 640;
        scene.cameras.main.zoom = 0.3;
        manager = new WeatherManager(scene);
        rainPuddlesStore.set(1);
        manager.update(0, new Date(0));
        expect(graphics.fillStyle.mock.calls.some(([color]) => color === 0x4f7ba6)).toBe(false);
        scene.cameras.main.zoom = 1;
        manager.update(40, new Date(40));
        expect(graphics.fillStyle.mock.calls.some(([color]) => color === 0x4f7ba6)).toBe(true);
    });

    it("leaves the puddles out where the ground has a relief: its own water is drawn there", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Rain };
        scene.cameras.main.worldView.width = 640;
        scene.cameras.main.worldView.height = 640;
        // Dug everywhere around the screen.
        const cells = new Map<string, number>();
        for (let y = -120; y < 220; y++) for (let x = -120; x < 220; x++) cells.set(cellKey(x, y), -8);
        wam.terrain = withHeights(undefined, cells);
        rainPuddlesStore.set(1);
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        expect(graphics.fillStyle.mock.calls.some(([color]) => color === 0x4f7ba6)).toBe(false);
    });

    it("turns the splashes of the rain into rings on the water of the relief", () => {
        const { scene, graphics, wam } = fixture();
        wam.settings = { weather: WeatherType.Storm };
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        expect(graphics.strokeCircle.mock.calls).toHaveLength(0);
        manager.destroy();
        scene.getTerrainWater.mockReturnValue({ depthAt: () => 12 } as unknown as ReturnType<
            GameScene["getTerrainWater"]
        >);
        manager = new WeatherManager(scene);
        manager.update(0, new Date(0));
        expect(graphics.strokeCircle.mock.calls.length).toBeGreaterThan(0);
    });
});
