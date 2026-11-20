import type { FireConditionsMessage } from "@workadventure/messages";
import Debug from "debug";
import { WeatherLocation, WeatherType } from "@workadventure/map-editor";
import { derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { z } from "zod";
import { REAL_WEATHER_POLL_MS, roundedCoordinate } from "@wa/common/RealWeather";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../../../Enum/ComputedConst";
import { nightDateStore } from "../../../Stores/NightStore";
import type { MapPlace } from "../../../../common/RealWeather";
import { fetchRealWeather } from "./RealWeatherFetch";
import { realWeatherStateAt, withRealWeather, withRealWind, withWeatherPreview } from "./RealWeather";
import type { RealForecastState, RealWeatherState, WeatherPreview } from "./RealWeather";
import type { MapSnowSettings } from "./SnowCover";
import { weatherForecast } from "./WeatherForecast";
import { AUTO_CLOUDINESS, cloudinessAt } from "./WeatherSchedule";
import type { ForecastCell } from "./WeatherForecast";
import { withManualWind } from "./ManualConditions";
import { chosenWeatherNow } from "./ChosenPlaceWeather";

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
        const forecast = await fetchRealWeather(followed);
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
 * such a map, or one that has a place of its own (for its wind), makes this browser ask.
 */
export function shownWeatherSettings(
    settings: MapSnowSettings | undefined,
    date: Date | undefined,
): MapSnowSettings | undefined {
    return withManualWind(
        personalWeatherSettings(settings, date) ?? mapWeatherSettings(settings, date),
        manualConditions,
    );
}

// The weather of the chosen place last shown: the same object while neither it nor the second of the clock changed.
let personalMemo:
    | {
          settings: MapSnowSettings | undefined;
          place: WeatherLocation;
          state: RealForecastState;
          second: number | undefined;
          shown: MapSnowSettings | undefined;
      }
    | undefined;

/**
 * The weather of this player's own place (the city chosen on their clock, see ChosenPlaceWeather), drawn for them
 * alone in place of the weather of the map: its rain, its snow, its clouds and its wind. None while they follow the
 * server, or while a weather is tried in the map settings panel (the trial shows as it is).
 */
function personalWeatherSettings(
    settings: MapSnowSettings | undefined,
    date: Date | undefined,
): MapSnowSettings | undefined {
    const { place, state: chosenState } = chosenWeatherNow();
    if (!place || preview) return undefined;
    const second = date === undefined ? undefined : Math.floor(date.getTime() / 1000);
    if (
        personalMemo &&
        personalMemo.settings === settings &&
        personalMemo.place === place &&
        personalMemo.state === chosenState &&
        personalMemo.second === second
    ) {
        return personalMemo.shown;
    }
    const real = withRealWeather(
        { ...settings, weather: WeatherType.Real, weatherLocation: place },
        realWeatherStateAt(chosenState, date),
    );
    // While its real weather is not known yet, the automatic one shows, with its clouds.
    const shown =
        real?.weather === WeatherType.Automatic && date
            ? { ...real, cloudiness: cloudinessAt(date, real.weatherAuto) }
            : real;
    personalMemo = { settings, place, state: chosenState, second, shown };
    return shown;
}

/** The conditions of the room, when a player set them by hand: their wind is the wind of the whole scene. */
let manualConditions: FireConditionsMessage | undefined;
export function setRoomConditions(conditions: FireConditionsMessage | undefined): void {
    manualConditions = conditions;
}

function mapWeatherSettings(
    settings: MapSnowSettings | undefined,
    date: Date | undefined,
): MapSnowSettings | undefined {
    const tried = withWeatherPreview(settings, preview);
    if (tried?.weather === WeatherType.Cloudy) {
        // The Cloudy tile is a clear sky with clouds, at once like the other fixed tiles.
        return withPlaceWind({ ...tried, weather: WeatherType.Clear, cloudiness: AUTO_CLOUDINESS }, date);
    }
    if (tried?.weather === WeatherType.Automatic) {
        return withPlaceWind(date ? { ...tried, cloudiness: cloudinessAt(date, tried.weatherAuto) } : tried, date);
    }
    if (tried?.weather !== WeatherType.Real) return withPlaceWind(tried, date);
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
    const real = withRealWeather(tried, realWeatherStateAt(state, date));
    // While the real weather is unavailable, the automatic one shows, with its clouds.
    const shown =
        real?.weather === WeatherType.Automatic && date
            ? { ...real, cloudiness: cloudinessAt(date, real.weatherAuto) }
            : real;
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

// The fixed weather last shown with the wind of its place: the same object while neither it nor the wind changed.
let windMemo:
    | { settings: MapSnowSettings; windFrom: number | undefined; windSpeed: number | undefined; shown: MapSnowSettings }
    | undefined;

/**
 * A weather that is not the real one, with the real wind of the place of the map when the map has a place: its
 * clouds, its trees and its rain go the way the banner says the wind blows. Such a map makes this browser follow
 * its place, as a map in Real does; a map without a place keeps the usual drift and asks nothing.
 */
function withPlaceWind(settings: MapSnowSettings | undefined, date: Date | undefined): MapSnowSettings | undefined {
    if (!settings?.weatherLocation) return settings;
    follow(settings.weatherLocation);
    const windy = withRealWind(settings, realWeatherStateAt(knownFor(settings.weatherLocation), date));
    if (!windy || windy === settings) return settings;
    if (
        windMemo &&
        windMemo.settings === settings &&
        windMemo.windFrom === windy.windFrom &&
        windMemo.windSpeed === windy.windSpeed
    ) {
        return windMemo.shown;
    }
    windMemo = { settings, windFrom: windy.windFrom, windSpeed: windy.windSpeed, shown: windy };
    return windy;
}

/**
 * The weather this person will see now, in one hour and in four hours (the weather banner), the tried one included,
 * with the real temperature of the place. Asked each second while the banner shows: it follows the place of the map
 * whatever its weather (the game itself only follows it for a map in Real), so its temperature is known too.
 */
export function shownWeatherForecast(settings: MapSnowSettings | undefined, date: Date): ForecastCell[] {
    const shown = withWeatherPreview(settings, preview);
    follow(shown?.weatherLocation);
    const known = knownFor(shown?.weatherLocation);
    // Outside Real, only the temperature is read from the timeline: a pending answer is no reason to blank the weather.
    const real: RealForecastState =
        shown?.weather === WeatherType.Real || known.status === "known" ? known : { status: "unavailable" };
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
