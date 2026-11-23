import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIFE_SETTINGS, DEFAULT_MEADOW_SETTINGS } from "@workadventure/map-editor";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import MapClockWidget from "../../../../src/front/Components/ActionBar/MapClockWidget.svelte";
import { mapEditorActivated } from "../../../../src/front/Stores/MenuStore";
import { mapClockSpeedsStore } from "../../../../src/front/Stores/MapClockStore";
import {
    freezeThawSettingMessage,
    hourLastsAt,
    mapClockSpeedsOf,
} from "../../../../src/front/Phaser/Game/Weather/MapClocks";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

const { executeUpdateWAMSettings, settings } = vi.hoisted(() => ({
    executeUpdateWAMSettings: vi.fn(() => Promise.resolve()),
    settings: {
        maxDepthTiles: 2,
        runoff: 10,
        evaporation: 0.2,
        speed: 1,
        absorption: 5,
        current: 1,
        maxSurface: 256,
        indoorDrain: 300,
        inertia: true,
        waves: { roughness: 1, damping: 0.02, breaking: 1, momentum: 1 },
        precision: 3,
        updates: 5,
        flowPace: 1,
        impactReach: 2.5,
        freezeThawSpeed: 1,
    },
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings }));
vi.mock("../../../../src/front/Phaser/Game/Terrain/TerrainMapSettings", () => ({
    readTerrainMapSettings: () => settings,
}));
vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: { getCurrentGameScene: () => undefined },
}));

describe("the clocks of the map in the action bar", () => {
    const previousLocale = get(locale);
    let component: ReturnType<typeof mount> | undefined;

    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });
    afterAll(() => setLocale(previousLocale));
    beforeEach(() => {
        executeUpdateWAMSettings.mockClear();
        mapClockSpeedsStore.set({});
        mapEditorActivated.set(false);
    });
    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        document.body.innerHTML = "";
    });

    const render = (): void => {
        component = mount(MapClockWidget, { target: document.body });
        flushSync();
    };
    const byTestId = (id: string): HTMLElement | null => document.body.querySelector(`[data-testid="${id}"]`);

    it("offers who may edit the map « > », « >> » and « >>> », the speed of the map pressed", () => {
        mapEditorActivated.set(true);
        mapClockSpeedsStore.set({ freezeThaw: 60 });
        render();
        expect(byTestId("map-clock-freezeThaw-1")?.textContent?.trim()).toBe(">");
        expect(byTestId("map-clock-freezeThaw-60")?.getAttribute("aria-pressed")).toBe("true");
        expect(byTestId("map-clock-freezeThaw-600")?.textContent?.trim()).toBe(">>>");
        expect(byTestId("map-clock-freezeThaw-60")?.title).toBe("×60 : une heure de gel ou de fonte dure 1 min.");
        expect(byTestId("map-clock-freezeThaw-600")?.title).toBe("×600 : une heure de gel ou de fonte dure 6 s.");
        expect(byTestId("map-clock-freezeThaw")?.title).toContain("L'eau garde sa vitesse");
    });

    it("sets the speed of the freeze and the thaw of the map, the water and its other settings as they are", () => {
        mapEditorActivated.set(true);
        render();
        byTestId("map-clock-freezeThaw-600")?.click();
        flushSync();
        expect(executeUpdateWAMSettings).toHaveBeenCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ freezeThawSpeed: 600, speed: 1, runoff: 10 }),
        });
        expect(byTestId("map-clock-freezeThaw-600")?.getAttribute("aria-pressed")).toBe("true");
        // Back to reality in one click.
        byTestId("map-clock-freezeThaw-1")?.click();
        flushSync();
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ freezeThawSpeed: 1 }),
        });
    });

    it("on a narrow bar, goes to the next step at a click and back to ×1 at another", () => {
        mapEditorActivated.set(true);
        render();
        expect(byTestId("map-clock-freezeThaw-reset")).toBeNull();
        byTestId("map-clock-freezeThaw-next")?.click();
        flushSync();
        expect(get(mapClockSpeedsStore).freezeThaw).toBe(60);
        byTestId("map-clock-freezeThaw-reset")?.click();
        flushSync();
        expect(get(mapClockSpeedsStore).freezeThaw).toBe(1);
    });

    it("tells a speed set in the editor between its steps as it is", () => {
        mapEditorActivated.set(true);
        mapClockSpeedsStore.set({ freezeThaw: 10 });
        render();
        expect(byTestId("map-clock-freezeThaw-other")?.textContent).toBe("×10");
    });

    it("shows the others only a discreet badge, and nothing at ×1", () => {
        render();
        expect(byTestId("map-clock-freezeThaw")).toBeNull();
        expect(byTestId("map-clock-freezeThaw-badge")).toBeNull();
        mapClockSpeedsStore.set({ freezeThaw: 60 });
        flushSync();
        expect(byTestId("map-clock-freezeThaw-badge")?.textContent?.trim()).toBe("Gel ×60");
        expect(byTestId("map-clock-freezeThaw-1")).toBeNull();
    });
});

describe("the clocks of the map", () => {
    it("read the speed of the freeze and the thaw of a map, ×1 when it says nothing", () => {
        expect(mapClockSpeedsOf(undefined)).toEqual({ freezeThaw: 1 });
        expect(
            mapClockSpeedsOf({
                version: "1.0.0",
                mapUrl: "map.tmj",
                entities: {},
                areas: [],
                entityCollections: [],
                settings: {
                    water: {
                        runoff: 1,
                        evaporation: 1,
                        speed: 1,
                        absorption: 1,
                        current: 1,
                        maxSurface: 18,
                        indoorDrain: 0,
                        freezeThawSpeed: 60,
                    },
                },
            }),
        ).toEqual({ freezeThaw: 60 });
    });

    it("say what an hour lasts at a speed", () => {
        expect(hourLastsAt(60)).toEqual({ minutes: 1 });
        expect(hourLastsAt(600)).toEqual({ seconds: 6 });
        expect(hourLastsAt(10)).toEqual({ minutes: 6 });
    });

    it("change the speed of the freeze and the thaw alone, the waves of a water without inertia left out", () => {
        const message = freezeThawSettingMessage(60, {
            ...settings,
            inertia: false,
            life: DEFAULT_LIFE_SETTINGS,
            meadow: DEFAULT_MEADOW_SETTINGS,
            pools: [],
        });
        expect(message.freezeThawSpeed).toBe(60);
        expect(message.speed).toBe(1);
        expect(message).not.toHaveProperty("waveRoughness");
    });
});
