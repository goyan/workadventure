import { get } from "svelte/store";
import type { PrecipitationAir } from "@workadventure/map-editor";
import { realWeatherAt } from "@wa/common/RealWeather";
import { fireConditionsStore } from "@wa/front/Stores/FireConditionsStore";
import type { RealForecastState } from "./RealWeather";
import { chosenWeatherNow } from "./ChosenPlaceWeather";
import { shownPlaceTimeline, showsChosenPlaceWeather } from "./RealWeatherClient";
import type { MapSnowSettings } from "./SnowCover";

/** The air of the quarter hour under way of a timeline: its temperature and its humidity, when both are known. */
export function airAt(state: RealForecastState, epoch: number): PrecipitationAir | undefined {
    if (state.status !== "known") return undefined;
    const now = realWeatherAt(state.slots, epoch);
    if (!now || now.temperature === null || now.humidity === undefined) return undefined;
    return { temperature: now.temperature, humidity: now.humidity };
}

/** Where the air of a precipitation can come from, each read at the same instant. */
export interface PrecipitationAirSources {
    /** The timeline of the city this player follows, when the precipitation drawn is that of their city. */
    chosenPlace: RealForecastState | undefined;
    /** The heat and the humidity set by hand in the room, when they are. */
    byHand: PrecipitationAir | undefined;
    /** The timeline at the place of the map (Paris without one). */
    mapPlace: RealForecastState;
}

/**
 * The air the precipitation drawn falls through, by its source. The precipitation of this player's own city (they
 * follow it on their clock, "Jour dans le monde") falls through the air of that city, so that what they see matches
 * their own sky and banner. The precipitation of the map falls through the air of the map, the same for every player
 * who follows the server and the one the server goes by (FireConditionsManager.air): set by hand in the room, else the
 * real air at the place of the map. Undefined while it is not known: it then rains.
 */
export function drawnPrecipitationAir(sources: PrecipitationAirSources, epoch: number): PrecipitationAir | undefined {
    if (sources.chosenPlace) return airAt(sources.chosenPlace, epoch);
    return sources.byHand ?? airAt(sources.mapPlace, epoch);
}

let memo: { settings: MapSnowSettings | undefined; second: number; air: PrecipitationAir | undefined } | undefined;

/**
 * The air the precipitation shown to this player falls through, which says whether it is rain or snow (snowShare),
 * by the source of that precipitation (drawnPrecipitationAir): the air of the city they follow on their clock when
 * the weather drawn for them is that of their city (showsChosenPlaceWeather), else the air of the map, whatever
 * weather the map shows, the same for every player who follows the server. A weather tried in the map settings panel
 * falls through the air of the place tried. Undefined while none is known: it then rains. Read again once a second of
 * the game clock.
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

/**
 * The air of the room, the same for every player whatever weather each follows: the heat and the humidity set by
 * hand, else the real air at the place of the map. What the server reads too (FireConditionsManager.air), so a
 * catastrophe of the room, a downpour, is drawn as the server lets it fall: as rain or as snow. Undefined while not
 * known: it then rains.
 */
export function roomPrecipitationAir(
    settings: MapSnowSettings | undefined,
    date: Date | undefined,
): PrecipitationAir | undefined {
    if (!date) return undefined;
    const conditions = get(fireConditionsStore);
    if (conditions?.manual) return { temperature: conditions.temperature, humidity: conditions.humidity };
    return airAt(shownPlaceTimeline(settings), date.getTime());
}

function readAir(settings: MapSnowSettings | undefined, date: Date): PrecipitationAir | undefined {
    const conditions = get(fireConditionsStore);
    return drawnPrecipitationAir(
        {
            chosenPlace: showsChosenPlaceWeather() ? chosenWeatherNow().state : undefined,
            byHand: conditions?.manual
                ? { temperature: conditions.temperature, humidity: conditions.humidity }
                : undefined,
            mapPlace: shownPlaceTimeline(settings),
        },
        date.getTime(),
    );
}
