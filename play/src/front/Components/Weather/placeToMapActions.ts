import { WeatherType } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { gameManager } from "../../Phaser/Game/GameManager";
import type { WorldPlace } from "../../Phaser/Game/Night/WorldDaylight";
import { canEditMapWeather } from "../../Phaser/Game/Weather/MapWeatherRights";
import { saveMapWeather } from "../../Phaser/Game/Weather/MapWeatherSave";
import {
    appliedPlaceStore,
    followPlaceUpdate,
    mapLocationOf,
    realConditionsMessage,
    revertUpdate,
    sameWeatherPlace,
} from "../../Phaser/Game/Weather/PlaceToMap";
import { fireConditionsStore } from "../../Stores/FireConditionsStore";
import { NightMode, nightModeStore } from "../../Stores/NightStore";
import { sendFireConditions } from "../Catastrophe/fireConditionsActions";

/** The map, its settings and whether this player may change its weather, read when asked. */
function mapWeatherNow() {
    const scene = gameManager.getCurrentGameScene();
    return { canEdit: canEditMapWeather(scene), settings: scene.getGameMap().getWamFile()?.getWam().settings };
}

/**
 * Makes the map follow the place this player follows, for everyone, as the weather settings of the map would
 * (saveMapWeather): its real weather at that place. Once the server confirmed it, this player goes back to the time and
 * the weather of the server: the map now follows their place. The place they followed stays remembered, not active.
 * The conditions set by hand in the room are left for the real ones too, when asked.
 * Throws, changing nothing for this player, when they may not, or when the change did not apply or was not confirmed.
 */
export async function applyPlaceToMap(place: WorldPlace, options: { leaveManual: boolean }): Promise<void> {
    const { settings } = mapWeatherNow();
    const before = { weather: settings?.weather ?? WeatherType.Clear, location: settings?.weatherLocation };
    await saveMapWeather(followPlaceUpdate(place));
    appliedPlaceStore.set({ applied: mapLocationOf(place), before });
    // Conditions set by hand come first over any place: left for the real ones when this player chose so.
    const conditions = get(fireConditionsStore);
    if (options.leaveManual && conditions?.manual) sendFireConditions(realConditionsMessage(conditions));
    nightModeStore.set(NightMode.Server);
}

/** Whether "Back to …" can be offered: this player applied a place the map still follows, and may change it again. */
export function canRevertMapPlace(): boolean {
    const applied = get(appliedPlaceStore);
    const { canEdit, settings } = mapWeatherNow();
    return (
        applied !== undefined &&
        canEdit &&
        settings?.weather === WeatherType.Real &&
        sameWeatherPlace(applied.applied, settings.weatherLocation)
    );
}

/** Brings the map back to the weather and the place it had before this player applied theirs. */
export async function revertMapPlace(): Promise<void> {
    const applied = get(appliedPlaceStore);
    if (!applied || !canRevertMapPlace()) throw new Error("Nothing to bring back");
    await saveMapWeather(revertUpdate(applied.before));
    appliedPlaceStore.set(undefined);
}
