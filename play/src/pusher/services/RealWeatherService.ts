import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import { z } from "zod";
import type { WeatherLocation } from "@workadventure/map-editor";
import {
    PARIS_LATITUDE,
    PARIS_LONGITUDE,
    REAL_WEATHER_POLL_MS,
    REAL_WEATHER_SLOT_MS,
    roundedCoordinate,
    slotsFromOpenMeteo,
} from "../../common/RealWeather";
import type { MapPlace, RealWeatherForecast, RealWeatherSlot } from "../../common/RealWeather";

/**
 * One call to Open-Meteo every half hour at most per place, whatever the number of players: the timeline runs six hours
 * ahead, so the weather keeps changing on time between calls, and through a failed one.
 */
const REFRESH_MS = 30 * 60 * 1000;
/** Without any weather for now (first call failed, after a restart), the next try comes much sooner. */
const RETRY_MS = 2 * 60 * 1000;
/** Quarter hours asked before and after now: two hours back (the start of the weather under way), six ahead. */
const PAST_SLOTS = 8;
const FORECAST_SLOTS = 24;
const KEPT_PAST_MS = PAST_SLOTS * REAL_WEATHER_SLOT_MS;
const TIMEOUT_MS = 5000;
const MINUTE_MS = 60 * 1000;
/** Places followed at once (one per map with a place, in practice a handful): the one asked least recently goes. */
const MAX_PLACES = 50;
/** New places, and town searches not in cache, a minute for the whole pusher: the free Open-Meteo quota is shared. */
const NEW_PLACES_PER_MINUTE = 20;
const SEARCHES_PER_MINUTE = 30;
const MAX_SEARCHES = 200;

const PARIS: MapPlace = { latitude: PARIS_LATITUDE, longitude: PARIS_LONGITUDE };

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

/** An unexpected answer of Open-Meteo, a dependency of the real weather: logged and reported. */
function reportFailure(operation: string, error: unknown): void {
    const cause = asError(error);
    console.error(`Open-Meteo ${operation} failed`, cause);
    Sentry.captureException(cause);
}

/** At most `limit` events in any minute (times given by `now`), for the whole pusher. */
class MinuteBudget {
    private readonly times: number[] = [];

    public constructor(
        private readonly limit: number,
        private readonly now: () => number,
    ) {}

    public take(): boolean {
        const now = this.now();
        while (this.times.length > 0 && now - this.times[0] >= MINUTE_MS) this.times.shift();
        if (this.times.length >= this.limit) return false;
        this.times.push(now);
        return true;
    }
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
 * A new forecast for the quarter hours to come, the ones already known by browsers as they were given: those begun,
 * and those starting before every browser has asked again (REAL_WEATHER_POLL_MS), so a quarter hour shows the same
 * weather to everyone. Quarter hours ended over two hours ago are forgotten.
 */
function merged(kept: readonly RealWeatherSlot[], fresh: readonly RealWeatherSlot[], now: number): RealWeatherSlot[] {
    const byStart = new Map<number, RealWeatherSlot>();
    for (const slot of fresh) byStart.set(slot.at, slot);
    for (const slot of kept) if (slot.at <= now + REAL_WEATHER_POLL_MS) byStart.set(slot.at, slot);
    return [...byStart.values()].filter((slot) => recent(slot, now)).sort((a, b) => a.at - b.at);
}

function coversNow(slots: readonly RealWeatherSlot[], now: number): boolean {
    return slots.some((slot) => slot.at <= now && now < slot.at + REAL_WEATHER_SLOT_MS);
}

/** The weather timeline at the places of the maps, shared by every player of this pusher. */
export class RealWeatherService {
    private readonly places = new Map<string, PlaceWeather>();
    private readonly newPlaces: MinuteBudget;

    public constructor(
        private readonly fetchFn: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {
        this.newPlaces = new MinuteBudget(NEW_PLACES_PER_MINUTE, now);
    }

    public async get(place: MapPlace = PARIS): Promise<RealWeatherForecast> {
        const latitude = roundedCoordinate(place.latitude);
        const longitude = roundedCoordinate(place.longitude);
        const key = `${latitude},${longitude}`;
        let entry = this.places.get(key);
        if (entry) {
            // Asked again: it becomes the most recent place, the last to be forgotten.
            this.places.delete(key);
        } else {
            // Too many new places this minute: no weather for this one yet (its maps fall back to the seasonal draw).
            if (!this.newPlaces.take()) return { slots: [] };
            if (this.places.size >= MAX_PLACES) {
                const leastRecent = this.places.keys().next().value;
                if (leastRecent !== undefined) this.places.delete(leastRecent);
            }
            entry = { slots: [], lastAttemptAt: -Infinity, pending: undefined };
        }
        this.places.set(key, entry);
        const followed = entry;
        const now = this.now();
        const wait = coversNow(followed.slots, now) ? REFRESH_MS : RETRY_MS;
        if (now - followed.lastAttemptAt >= wait) {
            followed.lastAttemptAt = now;
            followed.pending ??= this.refresh(followed, latitude, longitude).finally(() => {
                followed.pending = undefined;
            });
        }
        if (followed.pending) await followed.pending;
        const answeredAt = this.now();
        followed.slots = followed.slots.filter((slot) => recent(slot, answeredAt));
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
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const slots = slotsFromOpenMeteo(await response.json());
            if (!slots) throw new Error("no usable timeline in the answer");
            entry.slots = merged(entry.slots, slots, this.now());
        } catch (error) {
            reportFailure("forecast", error);
        }
    }
}

/** Towns matching what is typed in the map settings, named in French (Open-Meteo geocoding, which uses GeoNames). */
export class PlaceSearchService {
    private readonly cache = new Map<string, WeatherLocation[]>();
    private readonly searches: MinuteBudget;

    public constructor(
        private readonly fetchFn: typeof fetch = fetch,
        now: () => number = Date.now,
    ) {
        this.searches = new MinuteBudget(SEARCHES_PER_MINUTE, now);
    }

    /** The towns found (none for less than two characters), or undefined when the search is unavailable. */
    public async search(query: string): Promise<WeatherLocation[] | undefined> {
        const name = query.trim().slice(0, 100);
        // The geocoding finds nothing under two characters.
        if (name.length < 2) return [];
        const key = name.toLocaleLowerCase("fr");
        const cached = this.cache.get(key);
        if (cached) return cached;
        if (!this.searches.take()) return undefined;
        try {
            const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
            url.searchParams.set("name", name);
            url.searchParams.set("count", "8");
            url.searchParams.set("language", "fr");
            url.searchParams.set("format", "json");
            const response = await this.fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const places = (OpenMeteoPlaces.parse(await response.json()).results ?? []).map((result) => ({
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
            reportFailure("geocoding", error);
            return undefined;
        }
    }
}

export const realWeatherService = new RealWeatherService();
export const placeSearchService = new PlaceSearchService();
