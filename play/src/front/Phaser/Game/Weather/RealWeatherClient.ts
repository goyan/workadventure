import Debug from "debug";
import { WeatherLocation, WeatherType } from "@workadventure/map-editor";
import { derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { z } from "zod";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../../../Enum/ComputedConst";
import { nightDateStore } from "../../../Stores/NightStore";
import { RealWeatherForecast } from "../../../../common/RealWeather";
import { realWeatherStateAt, withRealWeather, withWeatherPreview } from "./RealWeather";
import type { RealForecastState, RealWeatherState, WeatherPreview } from "./RealWeather";
import type { MapSnowSettings } from "./SnowCover";
import { weatherForecast } from "./WeatherForecast";
import type { ForecastCell } from "./WeatherForecast";

const debug = Debug("front:real-weather");
/**
 * The weather changes on time from the timeline already received (six hours ahead); asking again every five minutes
 * only picks up the forecast the pusher renews every half hour.
 */
const POLL_MS = 5 * 60 * 1000;

type Place = Pick<WeatherLocation, "latitude" | "longitude">;

// The place followed (undefined: Paris, the default of the pusher) and what is known of its weather timeline.
let followedKey: string | undefined;
let followed: Place | undefined;
let state: RealForecastState = { status: "pending" };
const store = writable<RealForecastState>(state);
let interval: ReturnType<typeof setInterval> | undefined;
let generation = 0;

function placeKey(place: Place | undefined): string {
    return place ? `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}` : "paris";
}

function set(next: RealForecastState): void {
    state = next;
    store.set(next);
}

async function poll(): Promise<void> {
    const asked = generation;
    try {
        const url = new URL("real-weather", ABSOLUTE_PUSHER_URL);
        if (followed) {
            url.searchParams.set("latitude", String(followed.latitude));
            url.searchParams.set("longitude", String(followed.longitude));
        }
        const response = await fetch(url, {
            cache: "no-store",
            headers: { Authorization: localUserStore.getAuthToken() ?? "" },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const forecast = RealWeatherForecast.parse(await response.json());
        // The place changed while asking: this answer is for the old one.
        if (asked !== generation) return;
        set({ status: "known", slots: forecast.slots });
    } catch (error) {
        debug("Real weather request failed: %O", error);
        // A pusher restart keeps the timeline already known; only a first failure falls back to the seasonal draw.
        if (asked === generation && state.status === "pending") set({ status: "unavailable" });
    }
}

function follow(place: Place | undefined): void {
    const key = placeKey(place);
    if (key === followedKey) return;
    followedKey = key;
    followed = place;
    generation++;
    set({ status: "pending" });
    poll().catch((error: unknown) => debug("Real weather poll failed: %O", error));
    interval ??= setInterval(() => {
        poll().catch((error: unknown) => debug("Real weather poll failed: %O", error));
    }, POLL_MS);
}

/** The weather timeline at this place (Paris when absent) as last received; asking starts with the first call. */
function forecastFor(place: Place | undefined): RealForecastState {
    follow(place);
    return state;
}

/** The weather at the place followed, at the clock of the game (ticking each second), for the settings panel. */
export const realWeatherStore: Readable<RealWeatherState> = derived([store, nightDateStore], ([forecast, date]) =>
    realWeatherStateAt(forecast, date),
);

/** The weather tried in the map settings panel by this person, shown at once until the panel closes. */
let preview: WeatherPreview | undefined;
const previewStore = writable<WeatherPreview | undefined>(undefined);
export const weatherPreviewStore = {
    subscribe: previewStore.subscribe,
    set(value: WeatherPreview | undefined): void {
        // Kept in a plain variable too: the game reads it at every image.
        preview = value;
        previewStore.set(value);
    },
};

/**
 * The map weather settings as they are shown to this person at `date` (the game clock): the weather being tried in the
 * settings panel if any, then a map set to "real" gets the weather of its place at that date (withRealWeather). Only
 * such a map makes this browser ask.
 */
export function shownWeatherSettings(
    settings: MapSnowSettings | undefined,
    date: Date | undefined,
): MapSnowSettings | undefined {
    const shown = withWeatherPreview(settings, preview);
    if (shown?.weather !== WeatherType.Real) return shown;
    return withRealWeather(shown, realWeatherStateAt(forecastFor(shown.weatherLocation), date));
}

/** The weather this person will see now, in one hour and in four hours (the weather banner), the tried one included. */
export function shownWeatherForecast(settings: MapSnowSettings | undefined, date: Date): ForecastCell[] {
    const shown = withWeatherPreview(settings, preview);
    const real: RealForecastState =
        shown?.weather === WeatherType.Real ? forecastFor(shown.weatherLocation) : { status: "unavailable" };
    return weatherForecast(shown, date.getTime(), real);
}

/** The place of the map as shown to this person (the one being tried, if any): its day and night follow it. */
export function shownMapPlace(settings: MapSnowSettings | undefined): WeatherLocation | undefined {
    return withWeatherPreview(settings, preview)?.weatherLocation;
}

const Places = z.array(WeatherLocation);

/** Towns matching what is typed, through the pusher (Open-Meteo geocoding). */
export async function searchPlaces(query: string, signal: AbortSignal): Promise<WeatherLocation[]> {
    const url = new URL("real-weather/places", ABSOLUTE_PUSHER_URL);
    url.searchParams.set("q", query);
    const response = await fetch(url, {
        headers: { Authorization: localUserStore.getAuthToken() ?? "" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok) throw new Error(`Place search failed (${response.status})`);
    return Places.parse(await response.json());
}
