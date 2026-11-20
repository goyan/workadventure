import { get } from "svelte/store";
import { DEFAULT_AUTO_WEATHER, WeatherType } from "@workadventure/map-editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../Phaser/Game/GameScene";
import type { DesktopEnvironmentRequest } from "../../Interfaces/DesktopAppInterfaces";
import { gameSceneStore } from "../../Stores/GameSceneStore";
import { mapEditorActivated } from "../../Stores/MenuStore";
import { NightMode, nightModeStore } from "../../Stores/NightStore";
import { cloudsShownStore, cloudsHeightStore, weatherEffectsEnabledStore } from "../../Stores/WeatherStore";
import { seasonalThemeModeStore } from "../../Stores/SeasonalThemeStore";
import { SeasonalThemeMode } from "../../Phaser/Game/Seasonal/SeasonalTheme";
import {
    DesktopAppearanceSetting,
    DesktopVisualSetting,
    DesktopLightSetting,
    DesktopSoundSetting,
    DesktopSoundsSetting,
    DesktopWeatherSetting,
} from "../../Interfaces/DesktopAppInterfaces";
import { lampEffectsEnabledStore } from "../../Stores/LampEffectsStore";
import { lampDemoEnabledStore } from "../../Stores/LampDemoStore";
import { LampMusicSource, lampMusicSourceStore } from "../../Stores/LampMusicSourceStore";
import { retroPaletteStore, uiFontStore } from "../../Stores/RetroThemeStore";
import { weatherVolumeStore } from "../../Stores/SoundEffectsStore";
import { GraphicsQuality, graphicsQualityStore } from "../../Stores/GraphicsSettingsStore";
import { desktopGraphicsMetricsRequestedStore, graphicsMetricsRequestedStore } from "../../Stores/PerfStore";

const preview = vi.hoisted(() => vi.fn());
vi.mock("../../Components/Menu/SoundPreview", () => ({ createSoundPreview: () => ({ play: preview }) }));
const save = vi.hoisted(() => vi.fn());
const openMenu = vi.hoisted(() => vi.fn());
vi.mock("../../Stores/GameSceneStore", async () => {
    const { writable } = await import("svelte/store");
    return { gameSceneStore: writable<GameScene | undefined>(undefined) };
});
vi.mock("../../Stores/MenuStore", async () => {
    const { writable } = await import("svelte/store");
    return {
        mapEditorActivated: writable(false),
        handleOpenMenuEvent: openMenu,
        SubMenusInterface: { settings: "settings" },
    };
});
vi.mock("../../Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings: save }));
const { applyDesktopEnvironment, readDesktopEnvironment } = await import("./EnvironmentControls");
const settings = { weather: WeatherType.Rain };
let isNight = false;

beforeEach(() => {
    save.mockReset();
    preview.mockReset();
    settings.weather = WeatherType.Rain;
    isNight = false;
    gameSceneStore.set({
        connection: {},
        getNightActive: () => isNight,
        getDesktopWeather: () => settings.weather,
        getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings }) }) }),
        getMapEditorModeManager: () => ({}),
        setTileAnimationsPaused: vi.fn(),
    } as unknown as GameScene);
    mapEditorActivated.set(false);
});

describe("desktop environment settings", () => {
    it("opens its settings at the request of the desktop, and says so", async () => {
        expect(readDesktopEnvironment()).toMatchObject({ canOpenSettings: true });
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.OpenSettings, value: true });
        expect(openMenu).toHaveBeenCalledWith("settings");
    });

    it("tells the None quality as Custom to the older desktop apps, and in full to the newer ones", async () => {
        const night = get(nightModeStore);
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.Quality, value: GraphicsQuality.None });
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.None);
        expect(readDesktopEnvironment()).toMatchObject({
            graphicsQuality: GraphicsQuality.Custom,
            graphicsPreset: GraphicsQuality.None,
        });
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.Quality, value: GraphicsQuality.High });
        expect(readDesktopEnvironment()).toMatchObject({
            graphicsQuality: GraphicsQuality.High,
            graphicsPreset: GraphicsQuality.High,
        });
        nightModeStore.set(night);
    });

    it("applies graphical quality without editing shared weather or changing the night clock", async () => {
        nightModeStore.set(NightMode.Always);
        const season = get(seasonalThemeModeStore);
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.Quality, value: GraphicsQuality.Low });
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.Low);
        expect(readDesktopEnvironment()).toMatchObject({ graphicsQuality: GraphicsQuality.Low, animations: false });
        expect(settings.weather).toBe(WeatherType.Rain);
        expect(get(nightModeStore)).toBe(NightMode.Always);
        expect(get(seasonalThemeModeStore)).toBe(season);
        expect(save).not.toHaveBeenCalled();
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.Quality, value: GraphicsQuality.High });
    });
    it("keeps desktop measurements separate from the web panel request", async () => {
        graphicsMetricsRequestedStore.set(true);
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.Metrics, value: true });
        graphicsMetricsRequestedStore.set(false);
        expect(get(desktopGraphicsMetricsRequestedStore)).toBe(true);
        expect(readDesktopEnvironment()?.graphicsMonitoring).toBe(true);
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.Metrics, value: false });
    });
    it("previews the selected family at its current volume and keeps animals personal", async () => {
        weatherVolumeStore.set(0.35);
        await applyDesktopEnvironment({ setting: DesktopSoundsSetting.Preview, value: DesktopSoundSetting.Weather });
        expect(preview).toHaveBeenCalledExactlyOnceWith("weather", 0.35);
        await applyDesktopEnvironment({ setting: DesktopVisualSetting.Jungle, value: false });
        expect(readDesktopEnvironment()?.jungle).toBe(false);
        expect(save).not.toHaveBeenCalled();
    });
    it("applies and reports the same appearance as the web preferences without editor rights", async () => {
        await applyDesktopEnvironment({
            setting: DesktopAppearanceSetting.Appearance,
            value: { palette: "forest", font: "system" },
        });
        expect(get(retroPaletteStore)).toBe("forest");
        expect(get(uiFontStore)).toBe("system");
        expect(readDesktopEnvironment()?.appearance).toEqual({ palette: "forest", font: "system" });
        expect(save).not.toHaveBeenCalled();
        await expect(
            applyDesktopEnvironment({
                setting: DesktopAppearanceSetting.Appearance,
                value: { palette: "invalid", font: "system" },
            } as unknown as DesktopEnvironmentRequest),
        ).rejects.toThrow();
        expect(get(retroPaletteStore)).toBe("forest");
    });
    it("selects and reports personal music, requires desktop analysis, and persists the choice", async () => {
        lampMusicSourceStore.set(LampMusicSource.Rooms);
        await expect(
            applyDesktopEnvironment({ setting: DesktopLightSetting.Source, value: LampMusicSource.Personal }),
        ).rejects.toThrow("Personal music analysis");
        expect(get(lampMusicSourceStore)).toBe(LampMusicSource.Rooms);
        vi.stubGlobal("WAD", { watchSpotifyMusic: vi.fn() });
        try {
            await applyDesktopEnvironment({ setting: DesktopLightSetting.Source, value: LampMusicSource.Personal });
            expect(readDesktopEnvironment()?.lampMusicSource).toBe(LampMusicSource.Personal);
            expect(localStorage.getItem("lampMusicSource")).toBe(LampMusicSource.Personal);
            await applyDesktopEnvironment({ setting: DesktopLightSetting.Source, value: LampMusicSource.Rooms });
            expect(save).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("keeps cloud visibility and height personal while protecting shared automatic settings", async () => {
        await applyDesktopEnvironment({ setting: DesktopWeatherSetting.Clouds, value: false });
        await applyDesktopEnvironment({ setting: DesktopWeatherSetting.CloudsHeight, value: 0.75 });
        expect(get(cloudsShownStore)).toBe(false);
        expect(get(cloudsHeightStore)).toBe(0.75);
        expect(save).not.toHaveBeenCalled();
        await expect(
            applyDesktopEnvironment({ setting: DesktopWeatherSetting.CloudsHeight, value: 2 }),
        ).rejects.toThrow();
        await expect(
            applyDesktopEnvironment({ setting: DesktopWeatherSetting.Auto, value: DEFAULT_AUTO_WEATHER }),
        ).rejects.toThrow("Map editing");
        mapEditorActivated.set(true);
        await applyDesktopEnvironment({
            setting: DesktopWeatherSetting.Auto,
            value: { frequency: "calm", include: [WeatherType.Fog], clouds: false },
        });
        expect(save).toHaveBeenCalledExactlyOnceWith({
            $case: "updateWeatherSettingMessage",
            updateWeatherSettingMessage: {
                weather: WeatherType.Rain,
                autoFrequency: "calm",
                autoInclude: [WeatherType.Fog],
                autoClouds: false,
            },
        });
    });

    it.each([WeatherType.Cloudy, WeatherType.Real, WeatherType.Fog])(
        "reports %s to modern desktop apps and keeps legacy weather compatible",
        (weather) => {
            settings.weather = weather;
            expect(readDesktopEnvironment()).toMatchObject({
                mapWeather: weather,
                weather: weather === WeatherType.Real ? WeatherType.Automatic : WeatherType.Clear,
            });
        },
    );
    it("changes music lights and demo without changing music or the shared map", async () => {
        await applyDesktopEnvironment({ setting: DesktopLightSetting.Effects, value: false });
        await applyDesktopEnvironment({ setting: DesktopLightSetting.Demo, value: true });
        expect(get(lampEffectsEnabledStore)).toBe(false);
        expect(get(lampDemoEnabledStore)).toBe(true);
        expect(readDesktopEnvironment()).toMatchObject({ lampEffects: false, lampDemo: true });
        expect(localStorage.getItem("lampEffectsEnabled")).toBe("false");
        expect(save).not.toHaveBeenCalled();
    });

    it.each(Object.values(DesktopSoundSetting))(
        "adjusts %s separately, preserves the others and saves the preference",
        async (sound) => {
            const before = readDesktopEnvironment()?.sounds;
            await applyDesktopEnvironment({ setting: DesktopSoundsSetting.Sounds, value: { sound, volume: 0.37 } });
            expect(readDesktopEnvironment()?.sounds).toEqual({ ...before, [sound]: 0.37 });
            expect(localStorage.getItem(sound)).toBe("0.37");
            expect(save).not.toHaveBeenCalled();
        },
    );

    it.each([-1, 1.01, NaN])("rejects invalid volume %s without changing the saved sound", async (volume) => {
        weatherVolumeStore.set(0.15);
        await expect(
            applyDesktopEnvironment({
                setting: DesktopSoundsSetting.Sounds,
                value: { sound: DesktopSoundSetting.Weather, volume },
            }),
        ).rejects.toThrow();
        expect(get(weatherVolumeStore)).toBe(0.15);
    });

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
            updateWeatherSettingMessage: {
                weather: WeatherType.Snow,
                autoFrequency: DEFAULT_AUTO_WEATHER.frequency,
                autoInclude: DEFAULT_AUTO_WEATHER.include,
                autoClouds: true,
            },
        });
    });

    it("changes the real personal stores without editing the map or opening panels", async () => {
        await applyDesktopEnvironment({ setting: "night", value: NightMode.Disabled });
        await applyDesktopEnvironment({ setting: "seasonal", value: SeasonalThemeMode.Autumn });
        await applyDesktopEnvironment({ setting: "effects", value: false });
        expect(get(nightModeStore)).toBe(NightMode.Disabled);
        expect(readDesktopEnvironment()?.ground).toBe("seasonal");
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

    it("reports every light setting with its words and bounds, details tied to their switch", () => {
        const controls = readDesktopEnvironment()?.lightControls ?? [];
        const byName = Object.fromEntries(controls.map((control) => [control.name, control]));
        expect(byName.nightDarkness).toMatchObject({ group: "night", kind: "number", step: 0.05 });
        expect(byName.lightBounce).toMatchObject({ kind: "number", min: 0, max: 1, dependsOn: "lightBounceOn" });
        expect(byName.lightSecondBounceOn).toMatchObject({ kind: "switch", dependsOn: "lightBounceOn" });
        expect(byName.moonPhaseCurve?.choices?.map((choice) => choice.value)).toEqual(["linear", "realistic"]);
        expect(byName.shadowTreeShape).toMatchObject({ group: "shadows", kind: "choice", dependsOn: "shadowTrees" });
        expect(byName.perfCounter).toMatchObject({ group: "other", kind: "switch" });
        expect(controls.every((control) => typeof control.label === "string")).toBe(true);
    });

    it("changes a light setting by its name, within its limits, and refuses an unknown one", async () => {
        await applyDesktopEnvironment({ setting: "light", value: { name: "lightBounceOn", value: false } });
        await applyDesktopEnvironment({ setting: "light", value: { name: "nightDarkness", value: 0.8 } });
        await applyDesktopEnvironment({ setting: "light", value: { name: "perfCounter", value: true } });
        const byName = Object.fromEntries(
            (readDesktopEnvironment()?.lightControls ?? []).map((control) => [control.name, control.value]),
        );
        expect(byName).toMatchObject({ lightBounceOn: false, nightDarkness: 0.8, perfCounter: true });
        await expect(
            applyDesktopEnvironment({ setting: "light", value: { name: "notASetting", value: true } }),
        ).rejects.toThrow();
        await expect(
            applyDesktopEnvironment({ setting: "light", value: { name: "lightBounceOn", value: 3 } }),
        ).rejects.toThrow();
        expect(save).not.toHaveBeenCalled();
    });
});
