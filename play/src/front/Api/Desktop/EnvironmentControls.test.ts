import { get } from "svelte/store";
import { WeatherType } from "@workadventure/map-editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../Phaser/Game/GameScene";
import type { DesktopEnvironmentRequest } from "../../Interfaces/DesktopAppInterfaces";
import { gameSceneStore } from "../../Stores/GameSceneStore";
import { mapEditorActivated } from "../../Stores/MenuStore";
import { NightMode, nightModeStore } from "../../Stores/NightStore";
import { GroundMode, groundModeStore, weatherEffectsEnabledStore } from "../../Stores/WeatherStore";
import { seasonalThemeModeStore } from "../../Stores/SeasonalThemeStore";
import { SeasonalThemeMode } from "../../Phaser/Game/Seasonal/SeasonalTheme";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../Stores/GameSceneStore", async () => {
    const { writable } = await import("svelte/store");
    return { gameSceneStore: writable<GameScene | undefined>(undefined) };
});
vi.mock("../../Stores/MenuStore", async () => {
    const { writable } = await import("svelte/store");
    return { mapEditorActivated: writable(false) };
});
vi.mock("../../Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings: save }));
const { applyDesktopEnvironment, readDesktopEnvironment } = await import("./EnvironmentControls");
const settings = { weather: WeatherType.Rain };
let isNight = false;

beforeEach(() => {
    save.mockReset();
    settings.weather = WeatherType.Rain;
    isNight = false;
    gameSceneStore.set({
        connection: {},
        getNightActive: () => isNight,
        getDesktopWeather: () => settings.weather,
        getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings }) }) }),
        getMapEditorModeManager: () => ({}),
    } as unknown as GameScene);
    mapEditorActivated.set(false);
});

describe("desktop environment settings", () => {
    it("reads actual map values, remote changes, editing rights, and room departure", () => {
        expect(readDesktopEnvironment()).toMatchObject({ weather: WeatherType.Rain, canEditWeather: false });
        mapEditorActivated.set(true);
        settings.weather = WeatherType.Storm;
        expect(readDesktopEnvironment()).toMatchObject({
            weather: WeatherType.Storm,
            displayWeather: WeatherType.Storm,
            canEditWeather: true,
        });
        isNight = true;
        expect(readDesktopEnvironment()?.isNight).toBe(true);
        gameSceneStore.set(undefined);
        expect(readDesktopEnvironment()).toBeNull();
    });

    it("keeps shared weather behind the same rights and skips unchanged values", async () => {
        await expect(applyDesktopEnvironment({ setting: "weather", value: WeatherType.Snow })).rejects.toThrow(
            "Map editing",
        );
        expect(save).not.toHaveBeenCalled();
        mapEditorActivated.set(true);
        await applyDesktopEnvironment({ setting: "weather", value: WeatherType.Rain });
        expect(save).not.toHaveBeenCalled();
        await applyDesktopEnvironment({ setting: "weather", value: WeatherType.Snow });
        expect(save).toHaveBeenCalledExactlyOnceWith({
            $case: "updateWeatherSettingMessage",
            updateWeatherSettingMessage: { weather: WeatherType.Snow },
        });
    });

    it("changes the real personal stores without editing the map or opening panels", async () => {
        await applyDesktopEnvironment({ setting: "night", value: NightMode.Disabled });
        await applyDesktopEnvironment({ setting: "ground", value: GroundMode.Seasonal });
        await applyDesktopEnvironment({ setting: "seasonal", value: SeasonalThemeMode.Autumn });
        await applyDesktopEnvironment({ setting: "effects", value: false });
        expect(get(nightModeStore)).toBe(NightMode.Disabled);
        expect(get(groundModeStore)).toBe(GroundMode.Seasonal);
        expect(get(seasonalThemeModeStore)).toBe(SeasonalThemeMode.Autumn);
        expect(get(weatherEffectsEnabledStore)).toBe(false);
        expect(save).not.toHaveBeenCalled();
    });

    it("keeps the former Christmas control working for an older desktop app", async () => {
        await applyDesktopEnvironment({ setting: "christmas", value: "always" });
        expect(get(seasonalThemeModeStore)).toBe(SeasonalThemeMode.Christmas);
        expect(readDesktopEnvironment()).toMatchObject({ seasonal: SeasonalThemeMode.Christmas, christmas: "always" });
        await applyDesktopEnvironment({ setting: "christmas", value: "never" });
        expect(get(seasonalThemeModeStore)).toBe(SeasonalThemeMode.None);
        await applyDesktopEnvironment({ setting: "seasonal", value: SeasonalThemeMode.Autumn });
        // Autumn forced: Christmas never shows, which an older app can display.
        expect(readDesktopEnvironment()?.christmas).toBe("never");
        await applyDesktopEnvironment({ setting: "seasonal", value: SeasonalThemeMode.Auto });
        expect(readDesktopEnvironment()?.christmas).toBe("auto");
    });

    it("rejects mismatched values and surfaces failures without claiming a changed setting", async () => {
        await expect(
            applyDesktopEnvironment({
                setting: "night",
                value: WeatherType.Rain,
            } as unknown as DesktopEnvironmentRequest),
        ).rejects.toThrow();
        mapEditorActivated.set(true);
        save.mockRejectedValue(new Error("offline"));
        await expect(applyDesktopEnvironment({ setting: "weather", value: WeatherType.Snow })).rejects.toThrow(
            "offline",
        );
        expect(readDesktopEnvironment()?.weather).toBe(WeatherType.Rain);
    });
});
