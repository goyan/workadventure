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
        theme,
        redrawGround: vi.fn(() => events.push(`${theme}:ground`)),
        rebuildObjects: vi.fn(() => events.push(`${theme}:objects`)),
        update: vi.fn((_time: number, _walkers: unknown[]) => false),
        setAlpha: vi.fn((_alpha: number) => undefined),
        setVisible: vi.fn((visible: boolean) => events.push(`${theme}:visible:${visible}`)),
        destroy: vi.fn(() => events.push(`${theme}:destroy`)),
    };
}

let manager: InstanceType<typeof SeasonalThemeManager> | undefined;
let decors: ReturnType<typeof fakeDecor>[] = [];
let markDirty = vi.fn();

function setup(
    options: {
        serverDate?: () => Date | undefined;
        version?: () => number;
        entities?: () => { visible: boolean; texture?: { key: string }; getPrefab?: () => { seasonal?: unknown } }[];
        mapSnowCoverage?: () => number;
    } = {},
) {
    markDirty = vi.fn();
    manager = new SeasonalThemeManager(mockDeep<Phaser.Scene>(), {
        outdoorGrid: () => grid,
        outdoorVersion: options.version ?? (() => 1),
        entities: (options.entities ?? (() => [])) as never,
        markDirty,
        serverDate: options.serverDate ?? (() => new Date("2026-07-14T12:00:00Z")),
        mapSnowCoverage: options.mapSnowCoverage,
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
const october = () => new Date("2026-10-01T10:00:00Z");
function decorOf(theme: Theme): ReturnType<typeof fakeDecor> {
    const decor = decors.find((candidate) => candidate.theme === theme);
    if (!decor) throw new Error(`no ${theme} decor`);
    return decor;
}

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
        const entities = [
            { visible: true, getPrefab: () => ({}) },
            { visible: false, getPrefab: () => ({}) },
        ];
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
        const tree = { visible: true, texture: { key: "tree-summer" }, getPrefab: () => ({ seasonal: {} }) };
        setup({ entities: () => [tree] }).update(0, walking);
        events.length = 0;
        tree.texture.key = "tree-autumn";
        manager?.update(1000, walking);
        expect(events).toEqual(["autumn:objects"]);
    });

    it("does not decorate again for another frame of a door, but does once an image has loaded", () => {
        seasonalThemeModeStore.set(SeasonalThemeMode.Autumn);
        const door = { visible: true, texture: { key: "__MISSING" }, getPrefab: () => ({}) };
        setup({ entities: () => [door] }).update(0, walking);
        events.length = 0;
        door.texture.key = "door.png";
        manager?.update(1000, walking);
        expect(events).toEqual(["autumn:objects"]);
        events.length = 0;
        door.texture.key = "door-3.png";
        manager?.update(2000, walking);
        door.texture.key = "door-0.png";
        manager?.update(3000, walking);
        expect(events).toEqual([]);
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

    describe("map snow", () => {
        it("fades the Christmas decor in with the map snow", () => {
            setup({ serverDate: october, mapSnowCoverage: () => 0.4 }).update(0, walking);
            expect(events.slice(0, 6)).toEqual([
                "autumn:create",
                "autumn:ground",
                "autumn:objects",
                "christmas:create",
                "christmas:ground",
                "christmas:objects",
            ]);
            expect(decorOf(SeasonalTheme.Christmas).setAlpha).toHaveBeenLastCalledWith(0.4);
            expect(decorOf(SeasonalTheme.Autumn).setAlpha.mock.lastCall?.[0]).toBeCloseTo(0.6);
            expect(manager?.activeTheme()).toBe(SeasonalTheme.Autumn);
        });

        it("hides autumn under full snow", () => {
            setup({ serverDate: october, mapSnowCoverage: () => 1 }).update(0, walking);
            const autumn = decorOf(SeasonalTheme.Autumn);
            const hidden = autumn.setVisible.mock.lastCall?.[0] === false || autumn.setAlpha.mock.lastCall?.[0] === 0;
            expect(hidden).toBe(true);
            expect(decorOf(SeasonalTheme.Christmas).setAlpha).toHaveBeenLastCalledWith(1);
        });

        it("removes the snow decor once melted", () => {
            let coverage = 0.5;
            setup({ serverDate: october, mapSnowCoverage: () => coverage }).update(0, walking);
            coverage = 0;
            manager?.update(16, walking);
            expect(decorOf(SeasonalTheme.Christmas).destroy).toHaveBeenCalledTimes(1);
            expect(decorOf(SeasonalTheme.Autumn).destroy).not.toHaveBeenCalled();
            expect(decorOf(SeasonalTheme.Autumn).setAlpha).toHaveBeenLastCalledWith(1);
        });

        it("keeps a single Christmas decor with the Christmas theme", () => {
            seasonalThemeModeStore.set(SeasonalThemeMode.Christmas);
            setup({ mapSnowCoverage: () => 0.5 }).update(0, walking);
            manager?.update(16, walking);
            expect(events.filter((event) => event.endsWith(":create"))).toEqual(["christmas:create"]);
            for (const call of decors[0].setAlpha.mock.calls) expect(call[0]).toBe(1);
        });

        it("shows the snow decor alone without a theme decor, and does not crash", () => {
            seasonalThemeModeStore.set(SeasonalThemeMode.None);
            setup({ mapSnowCoverage: () => 0.25 }).update(0, walking);
            expect(events).toEqual(["christmas:create", "christmas:ground", "christmas:objects"]);
            expect(decors[0].setAlpha).toHaveBeenLastCalledWith(0.25);
        });

        it("redraws only when the snow changes by a fortieth", () => {
            let coverage = 0.4;
            setup({ serverDate: october, mapSnowCoverage: () => coverage }).update(0, walking);
            const snow = decorOf(SeasonalTheme.Christmas);
            const alphaCalls = snow.setAlpha.mock.calls.length;
            markDirty.mockClear();
            coverage = 0.405;
            manager?.update(16, walking);
            expect(snow.setAlpha.mock.calls).toHaveLength(alphaCalls);
            expect(markDirty).not.toHaveBeenCalled();
            coverage = 0.43;
            manager?.update(32, walking);
            expect(snow.setAlpha).toHaveBeenLastCalledWith(0.425);
            expect(markDirty).toHaveBeenCalled();
        });

        it("shows a little snow as soon as there is any", () => {
            setup({ serverDate: october, mapSnowCoverage: () => 0.001 }).update(0, walking);
            expect(decorOf(SeasonalTheme.Christmas).setAlpha).toHaveBeenLastCalledWith(1 / 40);
        });

        it("gives the snow decor the same redraws, editing and walkers as the theme decor", () => {
            let version = 1;
            setup({ serverDate: october, version: () => version, mapSnowCoverage: () => 0.5 }).update(0, walking);
            const snow = decorOf(SeasonalTheme.Christmas);
            expect(snow.update.mock.lastCall?.[1]).toEqual(walking());
            events.length = 0;
            version = 2;
            manager?.update(16, walking);
            expect(events).toEqual(["autumn:ground", "autumn:objects", "christmas:ground", "christmas:objects"]);
            mapEditorModeStore.set(true);
            manager?.update(32, walking);
            expect(snow.setVisible).toHaveBeenLastCalledWith(false);
            expect(snow.update.mock.lastCall?.[1]).toEqual([]);
            events.length = 0;
            mapEditorModeStore.set(false);
            manager?.update(48, walking);
            expect(events).toEqual([
                "autumn:objects",
                "autumn:visible:true",
                "christmas:objects",
                "christmas:visible:true",
            ]);
        });

        it("destroys the snow decor with the scene", () => {
            setup({ serverDate: october, mapSnowCoverage: () => 0.5 }).update(0, walking);
            manager?.destroy();
            manager = undefined;
            expect(decorOf(SeasonalTheme.Christmas).destroy).toHaveBeenCalledTimes(1);
            expect(decorOf(SeasonalTheme.Autumn).destroy).toHaveBeenCalledTimes(1);
        });
    });
});
