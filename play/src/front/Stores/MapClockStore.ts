import { writable } from "svelte/store";

/**
 * The clocks of a map a player who may edit it can speed up from the action bar (MapClockWidget): today the cold
 * alone (the speed of the freeze and the thaw, WaterSettings.freezeThawSpeed). Others may come (the meadow, the
 * seasons) with an id of their own.
 */
export type MapClockId = "freezeThaw";

/**
 * How fast each clock of the map goes, as the map says it now: set when the map is read and at each change of its
 * settings (UpdateWAMSettingFrontCommand), from this player or another one. Absent: as in reality (×1).
 */
export const mapClockSpeedsStore = writable<Partial<Record<MapClockId, number>>>({});
