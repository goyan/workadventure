import { get } from "svelte/store";
import type { PrecipitationAir } from "@workadventure/map-editor";
import { realWeatherAt } from "@wa/common/RealWeather";
import { fireConditionsStore } from "@wa/front/Stores/FireConditionsStore";
import { chosenWeatherNow } from "./ChosenPlaceWeather";
import type { RealForecastState } from "./RealWeather";
import { shownPlaceTimeline } from "./RealWeatherClient";
import type { MapSnowSettings } from "./SnowCover";

/** The air of the quarter hour under way of a timeline: its temperature and its humidity, when both are known. */
export function airAt(state: RealForecastState, epoch: number): PrecipitationAir | undefined {
    if (state.status !== "known") return undefined;
    const now = realWeatherAt(state.slots, epoch);
    if (!now || now.temperature === null || now.humidity === undefined) return undefined;
    return { temperature: now.temperature, humidity: now.humidity };
}

let memo: { settings: MapSnowSettings | undefined; second: number; air: PrecipitationAir | undefined } | undefined;

/**
 * The air the precipitation shown to this player falls through, which says whether it is rain or snow (snowShare):
 * the real air of their own city when they follow one (its weather is theirs alone, see ChosenPlaceWeather), else the
 * heat and the humidity set by hand in the room, else the real air at the place of the map (Paris without one),
 * whatever weather the map shows: the same sources, in the same order, as the frost of the ground (Frost.ts), and for
 * the last two the same air for every player of the map. Undefined while none is known: it then rains. Read again
 * once a second of the game clock.
 */
export function precipitationAirNow(
    settings: MapSnowSettings | undefined,
    date: Date | undefined,
): PrecipitationAir | undefined {
    if (!date) return undefined;
    const second = Math.floor(date.getTime() / 1000);
    if (memo && memo.settings === settings && memo.second === second) return memo.air;
    const air = readAir(settings, date);
    memo = { settings, second, air };
    return air;
}

function readAir(settings: MapSnowSettings | undefined, date: Date): PrecipitationAir | undefined {
    const { place, state } = chosenWeatherNow();
    if (place) return airAt(state, date.getTime());
    const conditions = get(fireConditionsStore);
    if (conditions?.manual) return { temperature: conditions.temperature, humidity: conditions.humidity };
    return airAt(shownPlaceTimeline(settings), date.getTime());
}
