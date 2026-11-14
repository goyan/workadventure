import Debug from "debug";
import { WeatherLocation, WeatherType } from "@workadventure/map-editor";
import { writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { z } from "zod";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../../../Enum/ComputedConst";
import { RealWeatherReport } from "../../../../common/RealWeather";
import { withRealWeather, withWeatherPreview } from "./RealWeather";
import type { RealWeatherState, WeatherPreview } from "./RealWeather";
import type { MapSnowSettings } from "./SnowCover";

const debug = Debug("front:real-weather");
/** The pusher asks Open-Meteo every ten minutes; asking it every minute keeps players at most a minute apart. */
const POLL_MS = 60 * 1000;

type Place = Pick<WeatherLocation, "latitude" | "longitude">;

// The place followed (undefined: Paris, the default of the pusher) and what is known of its weather.
let followedKey: string | undefined;
let followed: Place | undefined;
let state: RealWeatherState = { status: "pending" };
const store = writable<RealWeatherState>(state);
let interval: ReturnType<typeof setInterval> | undefined;
let generation = 0;

function placeKey(place: Place | undefined): string {
    return place ? `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}` : "paris";
}

function set(next: RealWeatherState): void {
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
        const report = RealWeatherReport.parse(await response.json());
        // The place changed while asking: this answer is for the old one.
        if (asked !== generation) return;
        set(
            report.weather === null
                ? { status: "unavailable" }
                : { status: "known", weather: report.weather, since: report.since },
        );
    } catch (error) {
        debug("Real weather request failed: %O", error);
        // A pusher restart keeps the weather already known; only a first failure falls back to the seasonal draw.
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

/** The weather at this place (Paris when absent) as last reported by the pusher; asking starts with the first call. */
export function realWeatherNow(place?: Place): RealWeatherState {
    follow(place);
    return state;
}

/** The weather at the place followed, for the settings panel. */
export const realWeatherStore: Readable<RealWeatherState> = { subscribe: store.subscribe };

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
 * The map weather settings as they are shown to this person: the weather being tried in the settings panel if any,
 * then a map set to "real" gets the weather at its place (withRealWeather). Only such a map makes this browser ask.
 */
export function shownWeatherSettings(settings: MapSnowSettings | undefined): MapSnowSettings | undefined {
    const shown = withWeatherPreview(settings, preview);
    return shown?.weather === WeatherType.Real ? withRealWeather(shown, realWeatherNow(shown.weatherLocation)) : shown;
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
