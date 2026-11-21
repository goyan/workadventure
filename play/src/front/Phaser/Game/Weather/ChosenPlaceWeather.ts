import Debug from "debug";
import { WeatherType } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
import { derived, readable } from "svelte/store";
import type { Readable } from "svelte/store";
import { NightMode, nightModeStore, worldCityStore } from "@wa/front/Stores/NightStore";
import { REAL_WEATHER_POLL_MS, roundedCoordinate } from "@wa/common/RealWeather";
import type { WorldPlace } from "../Night/WorldDaylight";
import type { RealForecastState } from "./RealWeather";
import { fetchRealWeather } from "./RealWeatherFetch";
import { weatherForecast } from "./WeatherForecast";
import type { ForecastCell } from "./WeatherForecast";

const debug = Debug("front:chosen-place-weather");

/**
 * The place of this player's own weather: the city (or the point) of the world whose sky they follow
 * (NightMode.World). None while they follow the server: the weather of the map is then theirs too.
 */
export const chosenPlaceStore: Readable<WorldPlace | undefined> = derived(
    [nightModeStore, worldCityStore],
    ([mode, city]) => (mode === NightMode.World ? city : undefined),
);

/** Where a place is, rounded as the pusher keeps it: a point moved within it asks nothing again. */
function placeKey(place: WeatherLocation | undefined): string | undefined {
    return place ? `${roundedCoordinate(place.latitude)},${roundedCoordinate(place.longitude)}` : undefined;
}

/**
 * The weather timeline of the chosen place, asked when the place changes and every REAL_WEATHER_POLL_MS while one is
 * chosen; pending until it answers, unavailable when it fails before a first answer.
 */
export const chosenWeatherStateStore: Readable<{ place: WeatherLocation | undefined; state: RealForecastState }> =
    readable<{ place: WeatherLocation | undefined; state: RealForecastState }>(
        { place: undefined, state: { status: "pending" } },
        (set) => {
            let key: string | undefined;
            let place: WeatherLocation | undefined;
            let state: RealForecastState = { status: "pending" };
            let timer: ReturnType<typeof setInterval> | undefined;
            let generation = 0;

            const ask = (): void => {
                const asked = ++generation;
                const askedPlace = place;
                fetchRealWeather(askedPlace)
                    .then((forecast) => {
                        if (asked !== generation) return;
                        state = { status: "known", slots: forecast.slots };
                        set({ place: askedPlace, state });
                    })
                    .catch((error: unknown) => {
                        debug("Weather of the chosen place failed: %O", error);
                        if (asked === generation && state.status !== "known") {
                            state = { status: "unavailable" };
                            set({ place: askedPlace, state });
                        }
                    });
            };

            const unsubscribe = chosenPlaceStore.subscribe((next) => {
                const nextKey = placeKey(next);
                place = next;
                if (nextKey === key) return;
                key = nextKey;
                clearInterval(timer);
                timer = undefined;
                state = { status: "pending" };
                set({ place: next, state });
                if (!next) return;
                ask();
                timer = setInterval(ask, REAL_WEATHER_POLL_MS);
            });
            return () => {
                unsubscribe();
                clearInterval(timer);
                generation++;
            };
        },
    );

/** The real weather of the chosen place now, in one hour and in four hours, as the banner shows the map's. */
export function chosenPlaceForecast(place: WeatherLocation, state: RealForecastState, date: Date): ForecastCell[] {
    return weatherForecast({ weather: WeatherType.Real, weatherLocation: place }, date.getTime(), state);
}

/**
 * The chosen place and its weather timeline as last known, read by the game at each image (the weather it draws, the
 * frost of the ground): a plain value, kept by a subscription that lasts as long as the page.
 */
let chosenNow: { place: WeatherLocation | undefined; state: RealForecastState } = {
    place: undefined,
    state: { status: "pending" },
};
/** Stops keeping the weather of the chosen place (tests): the page keeps it for as long as it lives. */
export const stopChosenWeather = chosenWeatherStateStore.subscribe((value) => {
    chosenNow = value;
});

export function chosenWeatherNow(): { place: WeatherLocation | undefined; state: RealForecastState } {
    return chosenNow;
}
