import { get } from "svelte/store";
import { z } from "zod";
import { Weather, WeatherType } from "@workadventure/map-editor";
import type {
    DesktopEnvironmentRequest,
    DesktopEnvironmentState,
    LegacyChristmasMode,
} from "../../Interfaces/DesktopAppInterfaces";
import { NightMode, nightModeStore } from "../../Stores/NightStore";
import { weatherEffectsEnabledStore } from "../../Stores/WeatherStore";
import { migrateChristmasMode, SeasonalThemeMode } from "../../Phaser/Game/Seasonal/SeasonalTheme";
import { seasonalThemeModeStore } from "../../Stores/SeasonalThemeStore";
import { gameSceneStore } from "../../Stores/GameSceneStore";
import { mapEditorActivated } from "../../Stores/MenuStore";

export const desktopEnvironmentRequestSchema = z.discriminatedUnion("setting", [
    z.object({ setting: z.literal("weather"), value: Weather }),
    z.object({ setting: z.literal("night"), value: z.nativeEnum(NightMode) }),
    // Former ground setting, replaced by the seasonal theme: accepted from older desktop apps and ignored.
    z.object({ setting: z.literal("ground"), value: z.enum(["green", "seasonal"]) }),
    z.object({ setting: z.literal("seasonal"), value: z.nativeEnum(SeasonalThemeMode) }),
    // Former Christmas control, kept for desktop apps that predate the seasonal theme.
    z.object({ setting: z.literal("christmas"), value: z.enum(["auto", "always", "never"]) }),
    z.object({ setting: z.literal("effects"), value: z.boolean() }),
]);

/** What an older desktop app shows in its three-choice Christmas control. */
function legacyChristmasMode(mode: SeasonalThemeMode): LegacyChristmasMode {
    if (mode === SeasonalThemeMode.Christmas) return "always";
    if (mode === SeasonalThemeMode.Auto) return "auto";
    return "never";
}

/** The weather mode shown by the desktop app, which knows no "real" mode (and is not changed): the closest one. */
export function desktopWeatherMode(weather: WeatherType | undefined): WeatherType {
    if (weather === WeatherType.Real) return WeatherType.Automatic;
    return weather ?? WeatherType.Clear;
}

/** The same settings and editing rights as the web controls, read without opening their panels. */
export function readDesktopEnvironment(busy = false, error = ""): DesktopEnvironmentState | null {
    const scene = get(gameSceneStore);
    if (!scene) return null;
    return {
        // The desktop app knows no "real" mode (and is not changed): it sees the closest one, the automatic weather.
        weather: desktopWeatherMode(scene.getGameMap().getWamFile()?.getWam().settings?.weather),
        displayWeather: scene.getDesktopWeather(),
        night: get(nightModeStore),
        isNight: scene.getNightActive(),
        ground: get(seasonalThemeModeStore) === SeasonalThemeMode.Autumn ? "seasonal" : "green",
        seasonal: get(seasonalThemeModeStore),
        christmas: legacyChristmasMode(get(seasonalThemeModeStore)),
        effects: get(weatherEffectsEnabledStore),
        canEditWeather: Boolean(
            get(mapEditorActivated) &&
            scene.connection &&
            scene.getMapEditorModeManager() &&
            scene.getGameMap().getWamFile(),
        ),
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
        case "weather": {
            if (!state.canEditWeather) throw new Error("Map editing is unavailable");
            if (state.weather === request.value) return;
            // Loading the editor only on a map edit avoids an eager cycle through GameScene and DesktopApi.
            const { executeUpdateWAMSettings } = await import("../../Phaser/Game/MapEditor/Commands/Facades");
            await executeUpdateWAMSettings({
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: { weather: request.value, autoInclude: [] },
            });
            break;
        }
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
    }
}
