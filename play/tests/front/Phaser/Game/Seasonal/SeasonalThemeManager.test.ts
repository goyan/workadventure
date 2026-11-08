import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { mockDeep } from "vitest-mock-extended";

vi.mock("../../../../../src/front/Stores/MapEditorStore", () => ({ mapEditorModeStore: writable(false) }));

const { mapEditorModeStore } = await import("../../../../../src/front/Stores/MapEditorStore");
const { seasonalThemeModeStore } = await import("../../../../../src/front/Stores/SeasonalThemeStore");
const { SeasonalTheme, SeasonalThemeMode } =
    await import("../../../../../src/front/Phaser/Game/Seasonal/SeasonalTheme");
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");
const { SeasonalThemeManager } = await import("../../../../../src/front/Phaser/Game/Seasonal/SeasonalThemeManager");

type Theme = (typeof SeasonalTheme)[keyof typeof SeasonalTheme];
const grid = OutdoorGrid.fromWalls(320, 320, 32, []);
const events: string[] = [];

function fakeDecor(theme: Theme) {
    return {
        redrawGround: vi.fn(() => events.push(`${theme}:ground`)),
        rebuildObjects: vi.fn(() => events.push(`${theme}:objects`)),
        update: vi.fn((_time: number, _walkers: unknown[]) => false),
        setVisible: vi.fn((visible: boolean) => events.push(`${theme}:visible:${visible}`)),
        destroy: vi.fn(() => events.push(`${theme}:destroy`)),
    };
}

let manager: InstanceType<typeof SeasonalThemeManager> | undefined;
let decors: ReturnType<typeof fakeDecor>[] = [];

function setup(
    options: {
        serverDate?: () => Date | undefined;
        version?: () => number;
        entities?: () => { visible: boolean; texture?: { key: string } }[];
    } = {},
) {
    manager = new SeasonalThemeManager(mockDeep<Phaser.Scene>(), {
        outdoorGrid: () => grid,
        outdoorVersion: options.version ?? (() => 1),
        entities: (options.entities ?? (() => [])) as never,
        markDirty: vi.fn(),
        serverDate: options.serverDate ?? (() => new Date("2026-07-14T12:00:00Z")),
        createDecor: (theme) => {
            events.push(`${theme}:create`);
            const decor = fakeDecor(theme);
            decors.push(decor);
            return decor;
        },
    });
    return manager;
}

const walking = () => [{ id: "a", x: 0, y: 0, running: false }];

beforeEach(() => {
    events.length = 0;
    decors = [];
    mapEditorModeStore.set(false);
    seasonalThemeModeStore.set(SeasonalThemeMode.Auto);
});
afterEach(() => {
    manager?.destroy();
    manager = undefined;
});

describe("SeasonalThemeManager", () => {
    it("creates the decor of the active theme and draws it", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Christmas);
        setup().update(0, walking);
        expect(events).toEqual(["christmas:create", "christmas:ground", "christmas:objects"]);
        expect(manager?.activeTheme()).toBe(SeasonalTheme.Christmas);
    });

    it("switches decor without leftovers", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Christmas);
        setup().update(0, walking);
        events.length = 0;
        seasonalThemeModeStore.set(SeasonalThemeMode.Autumn);
        manager?.update(16, walking);
        expect(events.slice(0, 2)).toEqual(["christmas:destroy", "autumn:create"]);
        expect(manager?.activeTheme()).toBe(SeasonalTheme.Autumn);
    });

    it("waits for server time in auto, then follows it at once", () => {
        const clock: { date?: Date } = {};
        setup({ serverDate: () => clock.date });
        manager?.update(0, walking);
        manager?.update(16, walking);
        expect(events).toEqual([]);
        clock.date = new Date("2026-10-01T10:00:00Z");
        manager?.update(32, walking);
        expect(events[0]).toBe("autumn:create");
    });

    it("checks the calendar again every minute", () => {
        let date = new Date("2026-11-30T22:59:00Z");
        setup({ serverDate: () => date });
        manager?.update(0, walking);
        date = new Date("2026-11-30T23:00:30Z");
        manager?.update(30_000, walking);
        expect(manager?.activeTheme()).toBe(SeasonalTheme.Autumn);
        manager?.update(60_000, walking);
        expect(manager?.activeTheme()).toBe(SeasonalTheme.Christmas);
        expect(events).toContain("autumn:destroy");
    });

    it("hides the decor while editing, forgets walkers, and rebuilds objects after", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Autumn);
        setup().update(0, walking);
        mapEditorModeStore.set(true);
        manager?.update(16, walking);
        expect(decors[0].setVisible).toHaveBeenLastCalledWith(false);
        expect(decors[0].update.mock.lastCall?.[1]).toEqual([]);
        events.length = 0;
        mapEditorModeStore.set(false);
        manager?.update(32, walking);
        expect(events).toEqual(["autumn:objects", "autumn:visible:true"]);
        expect(decors[0].update.mock.lastCall?.[1]).toEqual(walking());
    });

    it("redraws the ground on a new outdoor version", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Autumn);
        let version = 1;
        setup({ version: () => version }).update(0, walking);
        events.length = 0;
        version = 2;
        manager?.update(16, walking);
        expect(events).toEqual(["autumn:ground", "autumn:objects"]);
    });

    it("rebuilds objects when the visible count changes", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Autumn);
        const entities = [{ visible: true }, { visible: false }];
        setup({ entities: () => entities }).update(0, walking);
        events.length = 0;
        entities[1].visible = true;
        manager?.update(500, walking);
        expect(events).toEqual([]);
        manager?.update(1000, walking);
        expect(events).toEqual(["autumn:objects"]);
    });

    it("rebuilds objects when an image changes, as when a tree turns to its season", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Autumn);
        const tree = { visible: true, texture: { key: "tree-summer" } };
        setup({ entities: () => [tree] }).update(0, walking);
        events.length = 0;
        tree.texture.key = "tree-autumn";
        manager?.update(1000, walking);
        expect(events).toEqual(["autumn:objects"]);
    });

    it("creates nothing for None", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.None);
        setup().update(0, walking);
        expect(events).toEqual([]);
        expect(manager?.activeTheme()).toBeUndefined();
    });

    it("destroys the decor with the scene", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Autumn);
        setup().update(0, walking);
        manager?.destroy();
        manager = undefined;
        expect(decors[0].destroy).toHaveBeenCalledTimes(1);
    });
});
