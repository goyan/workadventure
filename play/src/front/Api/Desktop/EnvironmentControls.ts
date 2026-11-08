import { get } from "svelte/store";
import { z } from "zod";
import { Weather, WeatherType } from "@workadventure/map-editor";
import type { DesktopEnvironmentRequest, DesktopEnvironmentState } from "../../Interfaces/DesktopAppInterfaces";
import { NightMode, nightModeStore } from "../../Stores/NightStore";
import { GroundMode, groundModeStore, weatherEffectsEnabledStore } from "../../Stores/WeatherStore";
import { ChristmasThemeMode } from "../../Phaser/Game/Christmas/ChristmasSeason";
import { christmasThemeModeStore } from "../../Stores/ChristmasThemeStore";
import { gameSceneStore } from "../../Stores/GameSceneStore";
import { mapEditorActivated } from "../../Stores/MenuStore";

export const desktopEnvironmentRequestSchema = z.discriminatedUnion("setting", [
    z.object({ setting: z.literal("weather"), value: Weather }),
    z.object({ setting: z.literal("night"), value: z.nativeEnum(NightMode) }),
    z.object({ setting: z.literal("ground"), value: z.nativeEnum(GroundMode) }),
    z.object({ setting: z.literal("christmas"), value: z.nativeEnum(ChristmasThemeMode) }),
    z.object({ setting: z.literal("effects"), value: z.boolean() }),
]);

/** The same settings and editing rights as the web controls, read without opening their panels. */
export function readDesktopEnvironment(busy = false, error = ""): DesktopEnvironmentState | null {
    const scene = get(gameSceneStore);
    if (!scene) return null;
    return {
        weather: scene.getGameMap().getWamFile()?.getWam().settings?.weather ?? WeatherType.Clear,
        displayWeather: scene.getDesktopWeather(),
        night: get(nightModeStore),
        isNight: scene.getNightActive(),
        ground: get(groundModeStore),
        christmas: get(christmasThemeModeStore),
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
                updateWeatherSettingMessage: { weather: request.value },
            });
            break;
        }
        case "night":
            nightModeStore.set(request.value);
            break;
        case "ground":
            groundModeStore.set(request.value);
            break;
        case "christmas":
            christmasThemeModeStore.set(request.value);
            break;
        case "effects":
            weatherEffectsEnabledStore.set(request.value);
            break;
    }
}
