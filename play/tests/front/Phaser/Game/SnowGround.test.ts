import { describe, expect, it, vi } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import { GroundMode } from "@wa/front/Stores/WeatherStore";
import { SnowGround } from "@wa/front/Phaser/Game/Weather/SnowGround";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";

function fixture(exterior?: string): {
    ground: SnowGround;
    canvas: {
        stamp: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
        render: ReturnType<typeof vi.fn>;
        visible: boolean;
        width: number;
        height: number;
        setPosition: ReturnType<typeof vi.fn>;
    };
    dirty: ReturnType<typeof vi.fn>;
    addFrame: ReturnType<typeof vi.fn>;
    view: { x: number; y: number; width: number; height: number; readonly right: number; readonly bottom: number };
} {
    const canvas = {
        width: 1,
        height: 1,
        visible: false,
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setVisible(value: boolean) {
            this.visible = value;
            return this;
        },
        resize(width: number, height: number) {
            this.width = width;
            this.height = height;
            return this;
        },
        setPosition: vi.fn().mockReturnThis(),
        setScale: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        stamp: vi.fn(),
        render: vi.fn(),
        destroy: vi.fn(),
    };
    const dirty = vi.fn();
    const addFrame = vi.fn();
    const tileset = (key: string) => ({ image: { key } });
    const view = {
        x: 0,
        y: 0,
        width: 96,
        height: 32,
        get right() {
            return this.x + this.width;
        },
        get bottom() {
            return this.y + this.height;
        },
    };
    const textures = new Map<string, Map<string, { width: number; height: number }>>();
    const scene = {
        add: { renderTexture: () => canvas },
        superLoad: { image: vi.fn().mockResolvedValue(undefined) },
        textures: {
            get(key: string) {
                const frames = textures.get(key) ?? new Map<string, { width: number; height: number }>();
                textures.set(key, frames);
                return {
                    has: (name: string) => name === "__BASE" || frames.has(name),
                    get: (name?: string) =>
                        name === "__BASE" ? { width: 1536, height: 1280 } : frames.get(name ?? "ground-0-0"),
                    add(name: string, _source: number, _x: number, _y: number, width: number, height: number) {
                        addFrame(name, _x, _y, width, height);
                        frames.set(name, { width, height });
                    },
                };
            },
        },
        cameras: { main: { worldView: view } },
        getGameMap: () => ({
            getMap: () => ({
                properties: exterior ? [{ name: "exteriorTexture", type: "file", value: exterior }] : [],
            }),
        }),
        Map: {
            tileWidth: 32,
            tileHeight: 32,
            width: 3,
            height: 1,
            layers: [
                {
                    tilemapLayer: { visible: true, depth: -2 },
                    data: [
                        [
                            { index: 1, properties: {}, tileset: tileset("http://local/grass.png") },
                            { index: 2, properties: {}, tileset: tileset("stone.png") },
                            { index: 1, properties: {}, tileset: tileset("http://local/grass.png") },
                        ],
                    ],
                },
            ],
        },
        getGameMapFrontWrapper: () => ({
            getEntitiesManager: () => ({
                getEntities: () =>
                    new Map([
                        [
                            "floor",
                            {
                                x: 64,
                                y: 0,
                                displayWidth: 32,
                                displayHeight: 32,
                                getPrefab: () => ({ collectionName: "custom", id: "wood", footstepSound: "wood" }),
                            },
                        ],
                    ]),
            }),
        }),
        markDirty: dirty,
    } as unknown as GameScene;
    return { ground: new SnowGround(scene), canvas, dirty, view, addFrame };
}

describe("ground snow rendering", () => {
    it("defaults to green ground in autumn snow and redraws when seasonal ground is enabled", async () => {
        const { ground, canvas } = fixture("grass.png");
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
        const date = new Date("2026-11-08T10:00:00Z");
        ground.update(0, date, WeatherType.Snow, true);
        expect(canvas.stamp.mock.calls.length).toBeGreaterThan(0);
        expect(canvas.stamp.mock.calls.every((call) => String(call[0]).endsWith("terrain-green.png"))).toBe(true);
        canvas.stamp.mockClear();
        ground.update(0, date, WeatherType.Snow, true, GroundMode.Seasonal);
        expect(canvas.stamp.mock.calls.some((call) => String(call[0]).endsWith("terrain-autumn.png"))).toBe(true);
        expect(canvas.stamp.mock.calls.some((call) => String(call[0]).endsWith("terrain-snow.png"))).toBe(true);
        canvas.stamp.mockClear();
        ground.update(0, date, WeatherType.Snow, true, GroundMode.Green);
        expect(canvas.stamp.mock.calls.length).toBeGreaterThan(0);
        expect(canvas.stamp.mock.calls.every((call) => String(call[0]).endsWith("terrain-green.png"))).toBe(true);
        ground.destroy();
    });
    it.each([WeatherType.Clear, WeatherType.Rain, WeatherType.Storm])(
        "uses the autumn ground when weather is %s",
        async (weather) => {
            const { ground, canvas } = fixture("grass.png");
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 0);
            });
            ground.update(0, new Date("2026-11-08T10:00:00Z"), weather, true, GroundMode.Seasonal);
            expect(canvas.stamp.mock.calls.length).toBeGreaterThan(0);
            expect(canvas.stamp.mock.calls.every((call) => String(call[0]).endsWith("terrain-autumn.png"))).toBe(true);
            ground.destroy();
        },
    );
    it("keeps green grass outside autumn and redraws on a season change", async () => {
        const { ground, canvas } = fixture("grass.png");
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
        for (const [index, month] of ["01", "04", "07"].entries()) {
            canvas.stamp.mockClear();
            ground.update(
                index * 2000,
                new Date(`2026-${month}-08T10:00:00Z`),
                WeatherType.Clear,
                true,
                GroundMode.Seasonal,
            );
            expect(canvas.stamp.mock.calls.length).toBeGreaterThan(0);
            expect(canvas.stamp.mock.calls.every((call) => String(call[0]).endsWith("terrain-green.png"))).toBe(true);
        }
        canvas.stamp.mockClear();
        ground.update(4000, new Date("2026-09-08T10:00:00Z"), WeatherType.Clear, true, GroundMode.Seasonal);
        expect(canvas.stamp.mock.calls.length).toBeGreaterThan(0);
        expect(canvas.stamp.mock.calls.every((call) => String(call[0]).endsWith("terrain-autumn.png"))).toBe(true);
        ground.destroy();
    });
    it("applies forced snow immediately without revealing square snow patches", async () => {
        const { ground, canvas } = fixture("grass.png");
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
        const date = new Date("2026-11-08T10:00:00Z");
        ground.update(0, date, WeatherType.Snow, true, GroundMode.Seasonal);
        const snowCalls = canvas.stamp.mock.calls.filter((call) => String(call[0]).endsWith("terrain-snow.png"));
        expect(snowCalls.length).toBeGreaterThan(0);
        expect(snowCalls.every((call) => call[4].alpha === 1)).toBe(true);
        ground.destroy();
    });
    it("covers only grass, leaving stone and heated entity floors untouched, and releases its texture", async () => {
        const { ground, canvas } = fixture();
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
        ground.update(0, new Date("2026-11-08T10:00:00Z"), WeatherType.Snow, true, GroundMode.Seasonal);
        expect(canvas.stamp).toHaveBeenCalledTimes(2);
        expect(canvas.stamp.mock.calls.map((call) => call[2])).toEqual([192, 192]);
        expect(canvas.stamp.mock.calls[1]?.[0]).toMatch(/terrain-snow/);
        expect(canvas.render).toHaveBeenCalledOnce();
        ground.update(100, new Date("2026-11-08T10:00:00Z"), WeatherType.Snow, true, GroundMode.Seasonal);
        ground.update(500, new Date("2026-11-08T10:00:00Z"), WeatherType.Snow, true, GroundMode.Seasonal);
        expect(canvas.render).toHaveBeenCalledOnce();
        ground.update(600, undefined, WeatherType.Snow, true, GroundMode.Seasonal);
        expect(canvas.visible).toBe(false);
        ground.destroy();
        expect(canvas.destroy).toHaveBeenCalledOnce();
    });
    it("replaces the built-in exterior, including negative coordinates, while preserving indoor floors", async () => {
        const { ground, canvas } = fixture("grass.png");
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
        ground.update(0, new Date("2026-07-08T10:00:00Z"), WeatherType.Snow, true, GroundMode.Seasonal);
        expect(canvas.setPosition).toHaveBeenLastCalledWith(-192, -160);
        const baseCalls = canvas.stamp.mock.calls.filter((call) => /terrain-green/.test(String(call[0])));
        expect(baseCalls).toHaveLength(36);
        expect(baseCalls.some((call) => call[2] === 224 && call[3] === 160)).toBe(false);
        expect(baseCalls.some((call) => call[2] === 256 && call[3] === 160)).toBe(false);
        expect(canvas.stamp.mock.calls[0]?.[1]).toBe("block-42-35");
        expect(baseCalls.every((call) => call[4].scaleX >= 1 && call[4].scaleX < 1.1)).toBe(true);
        expect(baseCalls.every((call) => call[4].scaleY >= 1 && call[4].scaleY < 1.25)).toBe(true);
        expect(canvas.stamp.mock.calls.some((call) => /terrain-snow/.test(String(call[0])))).toBe(true);
        expect(canvas.width).toBeLessThanOrEqual(2048);
        expect(canvas.height).toBeLessThanOrEqual(2048);
        ground.destroy();
    });
    it("reuses the camera margin and redraws before 250 ms when movement or zoom exposes new terrain", async () => {
        const { ground, canvas, view, addFrame } = fixture("grass.png");
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
        const date = new Date("2026-07-08T10:00:00Z");
        ground.update(0, date, WeatherType.Clear, true, GroundMode.Seasonal);
        view.x = 32;
        ground.update(16, date, WeatherType.Clear, true, GroundMode.Seasonal);
        expect(canvas.render).toHaveBeenCalledOnce();
        view.x = -256;
        ground.update(32, date, WeatherType.Clear, true, GroundMode.Seasonal);
        expect(canvas.render).toHaveBeenCalledTimes(2);
        view.width = 4096;
        view.height = 4096;
        ground.update(48, date, WeatherType.Clear, true, GroundMode.Seasonal);
        expect(canvas.render).toHaveBeenCalledTimes(3);
        expect(canvas.width).toBeLessThanOrEqual(2048);
        expect(canvas.height).toBeLessThanOrEqual(2048);
        expect(
            addFrame.mock.calls.every(
                ([, x, y, width, height]) => x >= 0 && y >= 0 && x + width <= 1536 && y + height <= 1280,
            ),
        ).toBe(true);
        ground.destroy();
    });
    it("does not show the terrain when the personal effects setting is disabled", async () => {
        const { ground, canvas } = fixture();
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
        ground.update(0, new Date(), WeatherType.Snow, false);
        expect(canvas.visible).toBe(false);
        expect(canvas.stamp).not.toHaveBeenCalled();
        ground.destroy();
    });
});
