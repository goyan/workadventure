import Debug from "debug";
import { z } from "zod";
import type { WeatherLocation } from "@workadventure/map-editor";
import { PARIS_LATITUDE, PARIS_LONGITUDE, REAL_WEATHER_SLOT_MS, slotsFromOpenMeteo } from "../../common/RealWeather";
import type { RealWeatherForecast, RealWeatherSlot } from "../../common/RealWeather";

type Place = Pick<WeatherLocation, "latitude" | "longitude">;

const debug = Debug("pusher:real-weather");

/**
 * One call to Open-Meteo every half hour at most per place, whatever the number of players: the timeline runs six hours
 * ahead, so the weather keeps changing on time between calls, and through a failed one.
 */
const REFRESH_MS = 30 * 60 * 1000;
/** Quarter hours asked before and after now: two hours back (the start of the weather under way), six ahead. */
const PAST_SLOTS = 8;
const FORECAST_SLOTS = 24;
const KEPT_PAST_MS = PAST_SLOTS * REAL_WEATHER_SLOT_MS;
const TIMEOUT_MS = 5000;
/** Places followed at once (one per map with a place, in practice a handful): the oldest is forgotten beyond. */
const MAX_PLACES = 50;
const MAX_SEARCHES = 200;

const PARIS: Place = { latitude: PARIS_LATITUDE, longitude: PARIS_LONGITUDE };

const OpenMeteoPlaces = z.object({
    results: z
        .array(
            z.object({
                name: z.string().min(1).max(200),
                latitude: z.number().min(-90).max(90),
                longitude: z.number().min(-180).max(180),
                admin1: z.string().max(200).optional(),
                country: z.string().max(200).optional(),
            }),
        )
        .max(20)
        .optional(),
});

/** Two decimals, about a kilometre: the weather is the same, and nearby maps share one call. */
function rounded(value: number): number {
    return Math.round(value * 100) / 100;
}

interface PlaceWeather {
    slots: RealWeatherSlot[];
    lastAttemptAt: number;
    pending: Promise<void> | undefined;
}

/** Whether a quarter hour ended less than two hours ago, or is still to come. */
function recent(slot: RealWeatherSlot, now: number): boolean {
    return slot.at + REAL_WEATHER_SLOT_MS >= now - KEPT_PAST_MS;
}

/**
 * A new forecast for the quarter hours to come, the ones already begun as they were given: browsers ask at different
 * times, and a quarter hour must show the same weather to everyone. Quarter hours ended over two hours ago are forgotten.
 */
function merged(kept: readonly RealWeatherSlot[], fresh: readonly RealWeatherSlot[], now: number): RealWeatherSlot[] {
    const byStart = new Map<number, RealWeatherSlot>();
    for (const slot of fresh) byStart.set(slot.at, slot);
    for (const slot of kept) if (slot.at <= now) byStart.set(slot.at, slot);
    return [...byStart.values()].filter((slot) => recent(slot, now)).sort((a, b) => a.at - b.at);
}

/** The weather timeline at the places of the maps, shared by every player of this pusher. */
export class RealWeatherService {
    private readonly places = new Map<string, PlaceWeather>();

    public constructor(
        private readonly fetchFn: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    public async get(place: Place = PARIS): Promise<RealWeatherForecast> {
        const latitude = rounded(place.latitude);
        const longitude = rounded(place.longitude);
        const key = `${latitude},${longitude}`;
        let entry = this.places.get(key);
        if (!entry) {
            if (this.places.size >= MAX_PLACES) {
                const oldest = this.places.keys().next().value;
                if (oldest !== undefined) this.places.delete(oldest);
            }
            entry = { slots: [], lastAttemptAt: -Infinity, pending: undefined };
            this.places.set(key, entry);
        }
        const followed = entry;
        if (this.now() - followed.lastAttemptAt >= REFRESH_MS) {
            followed.lastAttemptAt = this.now();
            followed.pending ??= this.refresh(followed, latitude, longitude).finally(() => {
                followed.pending = undefined;
            });
        }
        if (followed.pending) await followed.pending;
        const now = this.now();
        followed.slots = followed.slots.filter((slot) => recent(slot, now));
        return { slots: followed.slots };
    }

    private async refresh(entry: PlaceWeather, latitude: number, longitude: number): Promise<void> {
        try {
            const url = new URL("https://api.open-meteo.com/v1/forecast");
            url.searchParams.set("latitude", String(latitude));
            url.searchParams.set("longitude", String(longitude));
            url.searchParams.set("minutely_15", "weather_code,temperature_2m");
            url.searchParams.set("past_minutely_15", String(PAST_SLOTS));
            url.searchParams.set("forecast_minutely_15", String(FORECAST_SLOTS));
            url.searchParams.set("timeformat", "unixtime");
            const response = await this.fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!response.ok) {
                debug("Open-Meteo answered %d", response.status);
                return;
            }
            const slots = slotsFromOpenMeteo(await response.json());
            if (!slots) {
                debug("Open-Meteo gave no usable timeline");
                return;
            }
            entry.slots = merged(entry.slots, slots, this.now());
        } catch (error) {
            debug("Open-Meteo request failed: %O", error);
        }
    }
}

/** Towns matching what is typed in the map settings, named in French (Open-Meteo geocoding, which uses GeoNames). */
export class PlaceSearchService {
    private readonly cache = new Map<string, WeatherLocation[]>();

    public constructor(private readonly fetchFn: typeof fetch = fetch) {}

    public async search(query: string): Promise<WeatherLocation[]> {
        const name = query.trim().slice(0, 100);
        // The geocoding finds nothing under two characters.
        if (name.length < 2) return [];
        const key = name.toLocaleLowerCase("fr");
        const cached = this.cache.get(key);
        if (cached) return cached;
        try {
            const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
            url.searchParams.set("name", name);
            url.searchParams.set("count", "8");
            url.searchParams.set("language", "fr");
            url.searchParams.set("format", "json");
            const response = await this.fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!response.ok) return [];
            const parsed = OpenMeteoPlaces.safeParse(await response.json());
            if (!parsed.success) return [];
            const places = (parsed.data.results ?? []).map((result) => ({
                name: [result.name, result.admin1, result.country].filter(Boolean).join(", ").slice(0, 200),
                latitude: result.latitude,
                longitude: result.longitude,
            }));
            if (this.cache.size >= MAX_SEARCHES) {
                const oldest = this.cache.keys().next().value;
                if (oldest !== undefined) this.cache.delete(oldest);
            }
            this.cache.set(key, places);
            return places;
        } catch (error) {
            debug("Open-Meteo geocoding failed: %O", error);
            return [];
        }
    }
}

export const realWeatherService = new RealWeatherService();
export const placeSearchService = new PlaceSearchService();
