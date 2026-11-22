import { WeatherType } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { gameManager } from "../../Phaser/Game/GameManager";
import { executeUpdateWAMSettings } from "../../Phaser/Game/MapEditor/Commands/Facades";
import type { WorldPlace } from "../../Phaser/Game/Night/WorldDaylight";
import { canEditMapWeather } from "../../Phaser/Game/Weather/MapWeatherRights";
import {
    appliedPlaceStore,
    followPlaceMessage,
    mapLocationOf,
    realConditionsMessage,
    revertMessage,
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
 * Makes the map follow the place this player follows, for everyone: its real weather at that place, saved in the map.
 * Only once the map holds it: the conditions set by hand are left for the real ones, and this player goes back to the
 * weather of the map, when asked. Throws when this player may not, or when the change did not apply. A refusal of the
 * server coming afterwards is not seen here (as for the weather settings of the map).
 */
export async function applyPlaceToMap(
    place: WorldPlace,
    options: { leaveManual: boolean; followMap: boolean },
): Promise<void> {
    const { canEdit, settings } = mapWeatherNow();
    if (!canEdit) throw new Error("This player may not change the weather of the map");
    const before = { weather: settings?.weather ?? WeatherType.Clear, location: settings?.weatherLocation };
    await executeUpdateWAMSettings(followPlaceMessage(place));
    // The editor logs a command that failed and does not throw: the map is read again to know it changed.
    if (!followsPlace(place)) throw new Error("The weather of the map was not changed");
    appliedPlaceStore.set({ applied: mapLocationOf(place), before });
    const conditions = get(fireConditionsStore);
    if (options.leaveManual && conditions?.manual) sendFireConditions(realConditionsMessage(conditions));
    if (options.followMap) nightModeStore.set(NightMode.Server);
}

/** Whether the map, as this browser holds it, follows the place in real weather. */
function followsPlace(place: WorldPlace): boolean {
    const { settings } = mapWeatherNow();
    return settings?.weather === WeatherType.Real && sameWeatherPlace(place, settings.weatherLocation);
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
    await executeUpdateWAMSettings(revertMessage(applied.before));
    if (followsPlace(applied.applied)) throw new Error("The weather of the map was not brought back");
    appliedPlaceStore.set(undefined);
}
