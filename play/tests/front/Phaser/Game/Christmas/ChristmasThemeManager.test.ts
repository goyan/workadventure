import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { mockDeep } from "vitest-mock-extended";

const layers = vi.hoisted(() => {
    const make = () => ({ created: 0, instances: [] as Record<string, ReturnType<typeof vi.fn>>[] });
    return { ground: make(), caps: make(), prints: make() };
});

vi.mock("../../../../../src/front/Stores/MapEditorStore", () => ({ mapEditorModeStore: writable(false) }));
vi.mock("../../../../../src/front/Phaser/Game/Christmas/SnowGround", () => ({
    SnowGround: class {
        public draw = vi.fn();
        public setVisible = vi.fn();
        public destroy = vi.fn();
        constructor() {
            layers.ground.created++;
            layers.ground.instances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
        }
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Christmas/SnowCaps", () => ({
    SnowCaps: class {
        public rebuild = vi.fn();
        public setVisible = vi.fn();
        public destroy = vi.fn();
        constructor() {
            layers.caps.created++;
            layers.caps.instances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
        }
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Christmas/FootprintLayer", () => ({
    FootprintLayer: class {
        public add = vi.fn();
        public update = vi.fn();
        public setVisible = vi.fn();
        public destroy = vi.fn();
        public count = 0;
        constructor() {
            layers.prints.created++;
            layers.prints.instances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
        }
    },
}));

const { mapEditorModeStore } = await import("../../../../../src/front/Stores/MapEditorStore");
const { christmasThemeModeStore } = await import("../../../../../src/front/Stores/ChristmasThemeStore");
const { ChristmasThemeMode } = await import("../../../../../src/front/Phaser/Game/Christmas/ChristmasSeason");
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");
const { ChristmasThemeManager } = await import("../../../../../src/front/Phaser/Game/Christmas/ChristmasThemeManager");

const grid = OutdoorGrid.fromWalls(320, 320, 32, []);
let manager: InstanceType<typeof ChristmasThemeManager> | undefined;

function setup(
    options: {
        now?: () => Date;
        grid?: typeof grid | undefined;
        version?: () => number;
        entities?: () => { visible: boolean }[];
    } = {},
) {
    manager = new ChristmasThemeManager(mockDeep<Phaser.Scene>(), {
        outdoorGrid: () => ("grid" in options ? options.grid : grid),
        outdoorVersion: options.version ?? (() => 1),
        entities: (options.entities ?? (() => [])) as never,
        markDirty: vi.fn(),
        readPixels: () => undefined,
        now: options.now ?? (() => new Date(2026, 6, 14)),
    });
    return manager;
}

const walking = () => [{ id: "a", x: 0, y: 0, running: false }];

beforeEach(() => {
    for (const layer of Object.values(layers)) {
        layer.created = 0;
        layer.instances = [];
    }
});

afterEach(() => {
    manager?.destroy();
    manager = undefined;
    christmasThemeModeStore.set(ChristmasThemeMode.Auto);
    mapEditorModeStore.set(false);
});

describe("ChristmasThemeManager", () => {
    it("follows the setting live", () => {
        christmasThemeModeStore.set(ChristmasThemeMode.Never);
        const theme = setup();
        theme.update(0, walking);
        expect(layers.ground.created).toBe(0);
        expect(theme.isActive()).toBe(false);
        christmasThemeModeStore.set(ChristmasThemeMode.Always);
        theme.update(16, walking);
        expect([layers.ground.created, layers.caps.created, layers.prints.created]).toEqual([1, 1, 1]);
        expect(theme.isActive()).toBe(true);
        christmasThemeModeStore.set(ChristmasThemeMode.Never);
        theme.update(32, walking);
        for (const layer of Object.values(layers)) expect(layer.instances[0].destroy.mock.calls).toHaveLength(1);
        expect(theme.isActive()).toBe(false);
    });

    it("starts on December 1st", () => {
        christmasThemeModeStore.set(ChristmasThemeMode.Auto);
        let now = new Date(2026, 10, 30, 23, 59, 30);
        const theme = setup({ now: () => now });
        theme.update(0, walking);
        expect(theme.isActive()).toBe(false);
        now = new Date(2026, 11, 1, 0, 0, 30);
        theme.update(30_000, walking);
        expect(theme.isActive()).toBe(false);
        theme.update(60_000, walking);
        expect(theme.isActive()).toBe(true);
    });

    it("hidden while editing", () => {
        christmasThemeModeStore.set(ChristmasThemeMode.Always);
        const theme = setup();
        theme.update(0, walking);
        mapEditorModeStore.set(true);
        theme.update(16, walking);
        for (const layer of Object.values(layers)) expect(layer.instances[0].setVisible.mock.lastCall).toEqual([false]);
        const added = layers.prints.instances[0].add.mock.calls.length;
        theme.update(32, () => [{ id: "a", x: 40, y: 0, running: false }]);
        expect(layers.prints.instances[0].add.mock.calls).toHaveLength(added);
        mapEditorModeStore.set(false);
        theme.update(48, walking);
        for (const layer of Object.values(layers)) expect(layer.instances[0].setVisible.mock.lastCall).toEqual([true]);
    });

    it("rebuilds on a new outdoor version", () => {
        christmasThemeModeStore.set(ChristmasThemeMode.Always);
        let version = 1;
        const theme = setup({ version: () => version });
        theme.update(0, walking);
        theme.update(16, walking);
        expect(layers.ground.instances[0].draw.mock.calls).toHaveLength(1);
        expect(layers.caps.instances[0].rebuild.mock.calls).toHaveLength(1);
        version = 2;
        theme.update(32, walking);
        expect(layers.ground.instances[0].draw.mock.calls).toHaveLength(2);
        expect(layers.caps.instances[0].rebuild.mock.calls).toHaveLength(2);
    });

    it("ignores walkers without a grid", () => {
        christmasThemeModeStore.set(ChristmasThemeMode.Always);
        const theme = setup({ grid: undefined });
        expect(() => theme.update(0, walking)).not.toThrow();
        expect(layers.prints.created).toBe(0);
    });

    it("rebuilds the caps when objects finish loading", () => {
        christmasThemeModeStore.set(ChristmasThemeMode.Always);
        const objects = [{ visible: true }, { visible: false }];
        const theme = setup({ entities: () => objects });
        theme.update(0, walking);
        expect(layers.caps.instances[0].rebuild.mock.calls).toHaveLength(1);
        objects[1].visible = true;
        theme.update(500, walking);
        expect(layers.caps.instances[0].rebuild.mock.calls).toHaveLength(1);
        theme.update(1000, walking);
        expect(layers.caps.instances[0].rebuild.mock.calls).toHaveLength(2);
        theme.update(2000, walking);
        expect(layers.caps.instances[0].rebuild.mock.calls).toHaveLength(2);
    });
});
