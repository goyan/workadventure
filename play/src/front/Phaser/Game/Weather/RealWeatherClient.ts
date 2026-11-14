import Debug from "debug";
import { WeatherLocation, WeatherType } from "@workadventure/map-editor";
import { derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { z } from "zod";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../../../Enum/ComputedConst";
import { nightDateStore } from "../../../Stores/NightStore";
import { REAL_WEATHER_POLL_MS, RealWeatherForecast, roundedCoordinate } from "../../../../common/RealWeather";
import type { MapPlace } from "../../../../common/RealWeather";
import { realWeatherStateAt, withRealWeather, withWeatherPreview } from "./RealWeather";
import type { RealForecastState, RealWeatherState, WeatherPreview } from "./RealWeather";
import type { MapSnowSettings } from "./SnowCover";
import { weatherForecast } from "./WeatherForecast";
import type { ForecastCell } from "./WeatherForecast";

const debug = Debug("front:real-weather");

// The place followed (undefined: Paris, the default of the pusher) and what is known of its weather timeline.
let followedKey: string | undefined;
let followed: MapPlace | undefined;
let state: RealForecastState = { status: "pending" };
/** Whether the place followed has answered yet: until then, the weather of the previous place stays shown. */
let answered = false;
let lastAskedAt = 0;
const store = writable<RealForecastState>(state);
let interval: ReturnType<typeof setInterval> | undefined;
let generation = 0;

function placeKey(place: MapPlace | undefined): string {
    return place ? `${roundedCoordinate(place.latitude)},${roundedCoordinate(place.longitude)}` : "paris";
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
        answered = true;
        set({ status: "known", slots: forecast.slots });
    } catch (error) {
        debug("Real weather request failed: %O", error);
        // A failed poll keeps the timeline already known; a first failure for a place falls back to the seasonal draw.
        if (asked === generation && !answered) set({ status: "unavailable" });
    }
}

/** Polls again every REAL_WEATHER_POLL_MS while a map shows the real weather; stops once none has for that long. */
function tick(): void {
    if (Date.now() - lastAskedAt > REAL_WEATHER_POLL_MS) {
        clearInterval(interval);
        interval = undefined;
        // Asked again later, the place is followed anew: polled at once, its last timeline shown meanwhile.
        followedKey = undefined;
        return;
    }
    poll().catch((error: unknown) => debug("Real weather poll failed: %O", error));
}

function follow(place: MapPlace | undefined): void {
    lastAskedAt = Date.now();
    const key = placeKey(place);
    if (key === followedKey) return;
    if (followedKey !== undefined) answered = false;
    followedKey = key;
    followed = place;
    generation++;
    poll().catch((error: unknown) => debug("Real weather poll failed: %O", error));
    interval ??= setInterval(tick, REAL_WEATHER_POLL_MS);
}

/** The weather timeline known for this place (Paris when absent), without asking: pending for a place not followed. */
function knownFor(place: MapPlace | undefined): RealForecastState {
    return placeKey(place) === followedKey || state.status === "known" ? state : { status: "pending" };
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

// Asked several times per image (sky, trees, snow on the ground): computed again only when something it reads changed,
// or once per second of the game clock.
let memo:
    | {
          settings: MapSnowSettings | undefined;
          weather: WeatherType | undefined;
          location: unknown;
          auto: unknown;
          startedAt: number | undefined;
          preview: WeatherPreview | undefined;
          state: RealForecastState;
          second: number | undefined;
          shown: MapSnowSettings | undefined;
      }
    | undefined;

/**
 * The map weather settings as they are shown to this person at `date` (the game clock): the weather being tried in the
 * settings panel if any, then a map set to "real" gets the weather of its place at that date (withRealWeather). Only
 * such a map makes this browser ask.
 */
export function shownWeatherSettings(
    settings: MapSnowSettings | undefined,
    date: Date | undefined,
): MapSnowSettings | undefined {
    const tried = withWeatherPreview(settings, preview);
    if (tried?.weather !== WeatherType.Real) return tried;
    follow(tried.weatherLocation);
    const second = date === undefined ? undefined : Math.floor(date.getTime() / 1000);
    if (
        memo &&
        memo.settings === settings &&
        memo.weather === settings?.weather &&
        memo.location === settings?.weatherLocation &&
        memo.auto === settings?.weatherAuto &&
        memo.startedAt === settings?.weatherStartedAt &&
        memo.preview === preview &&
        memo.state === state &&
        memo.second === second
    ) {
        return memo.shown;
    }
    const shown = withRealWeather(tried, realWeatherStateAt(state, date));
    memo = {
        settings,
        weather: settings?.weather,
        location: settings?.weatherLocation,
        auto: settings?.weatherAuto,
        startedAt: settings?.weatherStartedAt,
        preview,
        state,
        second,
        shown,
    };
    return shown;
}

/**
 * The weather this person will see now, in one hour and in four hours (the weather banner), the tried one included.
 * It only reads what the game already asked for (the game follows the place of a map in Real at every image).
 */
export function shownWeatherForecast(settings: MapSnowSettings | undefined, date: Date): ForecastCell[] {
    const shown = withWeatherPreview(settings, preview);
    const real: RealForecastState =
        shown?.weather === WeatherType.Real ? knownFor(shown.weatherLocation) : { status: "unavailable" };
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
