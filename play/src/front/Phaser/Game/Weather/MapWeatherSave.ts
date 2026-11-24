import type { UpdateWeatherSettingMessage } from "@workadventure/messages";
import { gameManager } from "../GameManager";
import { executeUpdateWAMSettings } from "../MapEditor/Commands/Facades";
import { canEditMapWeather } from "./MapWeatherRights";

/** How long the server is waited for before a change of the weather of the map is said not confirmed (ms). */
export const MAP_WEATHER_CONFIRM_MS = 10_000;

/**
 * Saves the weather of the map (its weather, its automatic settings, its place) for everyone: the one way the weather
 * settings of the map (Settings, Ambiance) and the weather cards change it. Resolves once the server acknowledged it;
 * throws when this player may not change it, when it did not apply, when the server refused it or did not answer.
 */
export async function saveMapWeather(update: UpdateWeatherSettingMessage): Promise<void> {
    const scene = gameManager.getCurrentGameScene();
    const editor = scene.getMapEditorModeManager();
    if (!canEditMapWeather(scene) || !editor) throw new Error("This player may not change the weather of the map");
    await executeUpdateWAMSettings({ $case: "updateWeatherSettingMessage", updateWeatherSettingMessage: update });
    // The editor logs a command that failed and does not throw: the map is read again to know it applied.
    const settings = scene.getGameMap().getWamFile()?.getWam().settings;
    if (settings?.weather !== update.weather) throw new Error("The weather of the map was not changed");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const accepted = await Promise.race([
        editor.whenCommandsSettled(),
        new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), MAP_WEATHER_CONFIRM_MS);
        }),
    ]).finally(() => clearTimeout(timer));
    if (!accepted) throw new Error("The server did not confirm the weather of the map");
}
