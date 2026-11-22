import { get } from "svelte/store";
import { z } from "zod";
import {
    AutoWeather,
    DEFAULT_AUTO_WEATHER,
    precipitationWeather,
    Weather,
    WeatherType,
} from "@workadventure/map-editor";
import { desktopGraphicsMetricsRequestedStore, perfStatsStore } from "../../Stores/PerfStore";
import {
    applyGraphicsQuality,
    GraphicsQuality,
    graphicsQualityStore,
    setTileAnimationsDisabled,
    tileAnimationsDisabledStore,
} from "../../Stores/GraphicsSettingsStore";
import type {
    DesktopEnvironmentRequest,
    DesktopEnvironmentState,
    LegacyChristmasMode,
} from "../../Interfaces/DesktopAppInterfaces";
import { NightMode, nightModeStore } from "../../Stores/NightStore";
import { cloudsShownStore, cloudsHeightStore, weatherEffectsEnabledStore } from "../../Stores/WeatherStore";
import { migrateChristmasMode, SeasonalThemeMode } from "../../Phaser/Game/Seasonal/SeasonalTheme";
import { seasonalThemeModeStore } from "../../Stores/SeasonalThemeStore";
import { gameSceneStore } from "../../Stores/GameSceneStore";
import { handleOpenMenuEvent, SubMenusInterface } from "../../Stores/MenuStore";
import { canEditMapWeather } from "../../Phaser/Game/Weather/MapWeatherRights";
import {
    DesktopAppearanceSetting,
    DesktopLightSetting,
    DesktopSoundSetting,
    DesktopSoundsSetting,
    DesktopWeatherSetting,
    DesktopVisualSetting,
} from "../../Interfaces/DesktopAppInterfaces";
import { lampEffectsEnabledStore } from "../../Stores/LampEffectsStore";
import { lampDemoEnabledStore } from "../../Stores/LampDemoStore";
import { LampMusicSource, lampMusicSourceStore } from "../../Stores/LampMusicSourceStore";
import {
    footstepVolumeStore,
    skateboardVolumeStore,
    weatherVolumeStore,
    doorVolumeStore,
    nerfVolumeStore,
    jungleVolumeStore,
    mapSoundsVolumeStore,
    notificationSoundVolumeStore,
} from "../../Stores/SoundEffectsStore";

import { RETRO_PALETTES, UI_FONTS, retroPaletteStore, uiFontStore } from "../../Stores/RetroThemeStore";

import { jungleEnabledStore } from "../../Stores/JungleStore";
import { createSoundPreview, type PreviewedSoundFamily } from "../../Components/Menu/SoundPreview";
import { applyDesktopLightControl, readDesktopLightControls } from "./DesktopLightControls";

const soundPreview = createSoundPreview();
const previewFamilies: Partial<Record<DesktopSoundSetting, PreviewedSoundFamily>> = {
    [DesktopSoundSetting.Footsteps]: "footsteps",
    [DesktopSoundSetting.Skateboard]: "skateboard",
    [DesktopSoundSetting.Weather]: "weather",
    [DesktopSoundSetting.Doors]: "doors",
    [DesktopSoundSetting.Nerf]: "nerf",
    [DesktopSoundSetting.Jungle]: "jungle",
    [DesktopSoundSetting.Notifications]: "notifications",
};

const soundStores = {
    [DesktopSoundSetting.Footsteps]: footstepVolumeStore.setting,
    [DesktopSoundSetting.Skateboard]: skateboardVolumeStore.setting,
    [DesktopSoundSetting.Weather]: weatherVolumeStore.setting,
    [DesktopSoundSetting.Doors]: doorVolumeStore.setting,
    [DesktopSoundSetting.Nerf]: nerfVolumeStore.setting,
    [DesktopSoundSetting.Jungle]: jungleVolumeStore.setting,
    [DesktopSoundSetting.Map]: mapSoundsVolumeStore.setting,
    [DesktopSoundSetting.Notifications]: notificationSoundVolumeStore.setting,
};

export const desktopEnvironmentRequestSchema = z.discriminatedUnion("setting", [
    z.object({
        setting: z.literal(DesktopVisualSetting.Quality),
        value: z.enum([GraphicsQuality.Low, GraphicsQuality.Medium, GraphicsQuality.High, GraphicsQuality.Ultra]),
    }),
    z.object({ setting: z.literal(DesktopVisualSetting.Metrics), value: z.boolean() }),
    z.object({ setting: z.literal(DesktopVisualSetting.OpenSettings), value: z.literal(true) }),
    z.object({ setting: z.literal(DesktopVisualSetting.Animations), value: z.boolean() }),
    z.object({ setting: z.literal(DesktopVisualSetting.Jungle), value: z.boolean() }),
    z.object({ setting: z.literal(DesktopSoundsSetting.Preview), value: z.nativeEnum(DesktopSoundSetting) }),
    z.object({
        setting: z.literal(DesktopAppearanceSetting.Appearance),
        value: z.object({ palette: z.enum(RETRO_PALETTES), font: z.enum(UI_FONTS) }),
    }),
    z.object({ setting: z.literal("weather"), value: Weather }),
    z.object({ setting: z.literal("night"), value: z.nativeEnum(NightMode) }),
    // Former ground setting, replaced by the seasonal theme: accepted from older desktop apps and ignored.
    z.object({ setting: z.literal("ground"), value: z.enum(["green", "seasonal"]) }),
    z.object({ setting: z.literal("seasonal"), value: z.nativeEnum(SeasonalThemeMode) }),
    // Former Christmas control, kept for desktop apps that predate the seasonal theme.
    z.object({ setting: z.literal("christmas"), value: z.enum(["auto", "always", "never"]) }),
    z.object({ setting: z.literal("effects"), value: z.boolean() }),
    z.object({ setting: z.literal(DesktopWeatherSetting.Clouds), value: z.boolean() }),
    z.object({ setting: z.literal(DesktopWeatherSetting.CloudsHeight), value: z.number().min(0).max(1) }),
    z.object({ setting: z.literal(DesktopWeatherSetting.Auto), value: AutoWeather }),
    z.object({ setting: z.enum([DesktopLightSetting.Effects, DesktopLightSetting.Demo]), value: z.boolean() }),
    z.object({ setting: z.literal(DesktopLightSetting.Source), value: z.nativeEnum(LampMusicSource) }),
    z.object({
        setting: z.literal(DesktopSoundsSetting.Sounds),
        value: z.object({ sound: z.nativeEnum(DesktopSoundSetting), volume: z.number().min(0).max(1) }),
    }),
    z.object({
        setting: z.literal("light"),
        value: z.object({
            name: z.string().min(1).max(100),
            value: z.union([z.number().finite(), z.boolean(), z.string().max(100)]),
        }),
    }),
]);

/** What an older desktop app shows in its three-choice Christmas control. */
function legacyChristmasMode(mode: SeasonalThemeMode): LegacyChristmasMode {
    if (mode === SeasonalThemeMode.Auto) return "auto";
    return "never";
}

/** The weather mode shown by the desktop app, which knows no "real" mode (and is not changed): the closest one. */
export function desktopWeatherMode(weather: WeatherType | undefined): WeatherType {
    if (weather === WeatherType.Real) return WeatherType.Automatic;
    if (weather === WeatherType.Cloudy || weather === WeatherType.Fog) return WeatherType.Clear;
    // A map saved with a snow: the rain it now is.
    return precipitationWeather(weather ?? WeatherType.Clear);
}

/** The same settings and editing rights as the web controls, read without opening their panels. */
export function readDesktopEnvironment(busy = false, error = ""): DesktopEnvironmentState | null {
    const scene = get(gameSceneStore);
    if (!scene) return null;
    return {
        graphicsQuality: get(graphicsQualityStore),
        canOpenSettings: true,
        graphicsMonitoring: get(desktopGraphicsMetricsRequestedStore),
        graphicsStats: get(perfStatsStore),
        animations: !get(tileAnimationsDisabledStore),
        appearance: { palette: get(retroPaletteStore), font: get(uiFontStore) },
        // Keep the legacy values for older desktop clients; modern clients use the raw map fields below.
        weather: desktopWeatherMode(scene.getGameMap().getWamFile()?.getWam().settings?.weather),
        displayWeather: desktopWeatherMode(scene.getMapWeather()),
        mapWeather: scene.getGameMap().getWamFile()?.getWam().settings?.weather ?? WeatherType.Clear,
        mapDisplayWeather: scene.getMapWeather(),
        weatherAuto: scene.getGameMap().getWamFile()?.getWam().settings?.weatherAuto ?? DEFAULT_AUTO_WEATHER,
        clouds: get(cloudsShownStore),
        cloudsHeight: get(cloudsHeightStore),
        night: get(nightModeStore),
        isNight: scene.getNightActive(),
        ground: get(seasonalThemeModeStore) === SeasonalThemeMode.Autumn ? "seasonal" : "green",
        seasonal: get(seasonalThemeModeStore),
        christmas: legacyChristmasMode(get(seasonalThemeModeStore)),
        effects: get(weatherEffectsEnabledStore),
        lampEffects: get(lampEffectsEnabledStore),
        lampDemo: get(lampDemoEnabledStore),
        lampMusicSource: get(lampMusicSourceStore),
        jungle: get(jungleEnabledStore),
        sounds: {
            footstepVolume: get(footstepVolumeStore.setting),
            skateboardVolume: get(skateboardVolumeStore.setting),
            weatherVolume: get(weatherVolumeStore.setting),
            doorVolume: get(doorVolumeStore.setting),
            nerfVolume: get(nerfVolumeStore.setting),
            jungleVolume: get(jungleVolumeStore.setting),
            mapSoundsVolume: get(mapSoundsVolumeStore.setting),
            notificationSoundVolume: get(notificationSoundVolumeStore.setting),
        },
        canEditWeather: canEditMapWeather(scene),
        lightControls: readDesktopLightControls(),
        busy,
        error,
    };
}

/** The existing map command handles persistence and server refusal; the other preferences stay personal. */
export async function applyDesktopEnvironment(input: DesktopEnvironmentRequest): Promise<void> {
    const request = desktopEnvironmentRequestSchema.parse(input);
    const state = readDesktopEnvironment();
    if (!state) throw new Error("No room is loaded");
    switch (request.setting) {
        case DesktopVisualSetting.Quality:
            applyGraphicsQuality(request.value);
            return;
        case DesktopVisualSetting.Metrics:
            desktopGraphicsMetricsRequestedStore.set(request.value);
            return;
        case DesktopVisualSetting.Animations:
            setTileAnimationsDisabled(!request.value);
            return;
        case DesktopVisualSetting.OpenSettings:
            handleOpenMenuEvent(SubMenusInterface.settings);
            return;
        case DesktopVisualSetting.Jungle:
            jungleEnabledStore.set(request.value);
            return;
        case DesktopSoundsSetting.Preview: {
            const family = previewFamilies[request.value];
            if (family) soundPreview.play(family, get(soundStores[request.value]));
            return;
        }
        case DesktopAppearanceSetting.Appearance:
            retroPaletteStore.set(request.value.palette);
            uiFontStore.set(request.value.font);
            return;
        case "weather": {
            if (!state.canEditWeather) throw new Error("Map editing is unavailable");
            if (state.mapWeather === request.value) return;
            // Loading the editor only on a map edit avoids an eager cycle through GameScene and DesktopApi.
            const { executeUpdateWAMSettings } = await import("../../Phaser/Game/MapEditor/Commands/Facades");
            await executeUpdateWAMSettings({
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: {
                    weather: request.value,
                    autoFrequency: state.weatherAuto.frequency,
                    autoInclude: state.weatherAuto.include,
                    autoClouds: state.weatherAuto.clouds !== false,
                },
            });
            break;
        }
        case DesktopWeatherSetting.Auto: {
            if (!state.canEditWeather) throw new Error("Map editing is unavailable");
            const { executeUpdateWAMSettings } = await import("../../Phaser/Game/MapEditor/Commands/Facades");
            await executeUpdateWAMSettings({
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: {
                    weather: state.mapWeather,
                    autoFrequency: request.value.frequency,
                    autoInclude: request.value.include,
                    autoClouds: request.value.clouds !== false,
                },
            });
            break;
        }
        case DesktopWeatherSetting.Clouds:
            cloudsShownStore.set(request.value);
            break;
        case DesktopWeatherSetting.CloudsHeight:
            cloudsHeightStore.set(request.value);
            break;
        case "night":
            nightModeStore.set(request.value);
            break;
        case "ground":
            break;
        case "seasonal":
            seasonalThemeModeStore.set(request.value);
            break;
        case "christmas":
            seasonalThemeModeStore.set(migrateChristmasMode(request.value) ?? SeasonalThemeMode.Auto);
            break;
        case "effects":
            weatherEffectsEnabledStore.set(request.value);
            break;
        case DesktopLightSetting.Effects:
            lampEffectsEnabledStore.set(request.value);
            break;
        case DesktopLightSetting.Demo:
            lampDemoEnabledStore.set(request.value);
            break;
        case DesktopLightSetting.Source:
            if (request.value === LampMusicSource.Personal && !window.WAD?.watchSpotifyMusic) {
                throw new Error("Personal music analysis is unavailable");
            }
            lampMusicSourceStore.set(request.value);
            break;
        case DesktopSoundsSetting.Sounds:
            soundStores[request.value.sound].set(request.value.volume);
            break;
        case "light":
            applyDesktopLightControl(request.value.name, request.value.value);
            break;
    }
}
