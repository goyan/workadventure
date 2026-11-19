import { WeatherType } from "../types";
import type { WeatherLocation } from "../types";
import { z } from "zod";

/** Paris, the place of a map without one (real weather and night clock). */
export const PARIS_LATITUDE = 48.8566;
export const PARIS_LONGITUDE = 2.3522;

/** A point on the globe: the place of a map, for its real weather and its sun. */
export type MapPlace = Pick<WeatherLocation, "latitude" | "longitude">;

/** Two decimals, about a kilometre: the weather is the same there, and nearby maps share one timeline. */
export function roundedCoordinate(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * How often a browser asks the pusher for the timeline again. The pusher never changes a quarter hour that starts
 * before every browser has asked again, so all of them show the same weather.
 */
export const REAL_WEATHER_POLL_MS = 5 * 60 * 1000;

/** A weather that can be observed: the map modes (Automatic, Real) are not. */
export const ObservedWeather = z.enum([
    WeatherType.Clear,
    WeatherType.Fog,
    WeatherType.Rain,
    WeatherType.Snow,
    WeatherType.Storm,
]);
export type ObservedWeather = z.infer<typeof ObservedWeather>;

/** Length of a slot of the Open-Meteo timeline (minutely_15): a quarter of an hour. */
export const REAL_WEATHER_SLOT_MS = 15 * 60 * 1000;

/**
 * A quarter hour of the weather at the place of a map: from `at` (epoch ms) for REAL_WEATHER_SLOT_MS, its game weather
 * and its temperature (°C), each null when the weather service gave nothing usable for it.
 */
export const RealWeatherSlot = z.object({
    at: z.number().int().nonnegative(),
    weather: ObservedWeather.nullable(),
    temperature: z.number().finite().nullable(),
    /** Clouds of the quarter hour, 0 to 1 (absent: none): the cloud cover, over a clear sky or a rain. */
    cloudiness: z.number().min(0).max(1).optional(),
    /** Where the wind of the quarter hour comes from, in degrees (0 north, 90 east; absent: not given). */
    windFrom: z.number().min(0).max(360).optional(),
    /** Speed of the wind of the quarter hour, km/h at 10 m (absent: not given). */
    windSpeed: z.number().min(0).max(500).optional(),
    /** How hard it rains over the quarter hour, mm an hour (a rain or a storm only; absent: not given). */
    rainRate: z.number().min(0).max(2000).optional(),
    /** Relative humidity of the air over the quarter hour, in % (absent: not given). */
    humidity: z.number().min(0).max(100).optional(),
});
export type RealWeatherSlot = z.infer<typeof RealWeatherSlot>;

/**
 * What the pusher answers on /real-weather: the timeline of the weather at a place, a couple of hours back and some
 * hours ahead, in order. Every browser reads the same timeline at the same time, so the weather changes at once for all.
 */
export const RealWeatherForecast = z.object({ slots: z.array(RealWeatherSlot).max(96) });
export type RealWeatherForecast = z.infer<typeof RealWeatherForecast>;

const QUARTERS_AN_HOUR = 4;

/** Quarter hours asked before and after now: two hours back (the start of the weather under way), six ahead. */
export const REAL_WEATHER_PAST_SLOTS = 8;
export const REAL_WEATHER_FORECAST_SLOTS = 24;

/** The Open-Meteo request for the timeline at a place (coordinates as given: round them first), read by slotsFromOpenMeteo. */
export function openMeteoTimelineUrl(latitude: number, longitude: number): URL {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set(
        "minutely_15",
        "weather_code,temperature_2m,cloud_cover,wind_direction_10m,wind_speed_10m,precipitation,relative_humidity_2m",
    );
    url.searchParams.set("past_minutely_15", String(REAL_WEATHER_PAST_SLOTS));
    url.searchParams.set("forecast_minutely_15", String(REAL_WEATHER_FORECAST_SLOTS));
    url.searchParams.set("timeformat", "unixtime");
    return url;
}

const OpenMeteoTimeline = z.object({
    minutely_15: z.object({
        time: z.array(z.number().int().nonnegative()).max(96),
        weather_code: z.array(z.number().nullable()).max(96),
        temperature_2m: z.array(z.number().finite().nullable()).max(96),
        /** Cloud cover in %, asked since the clouds; absent from older answers. */
        cloud_cover: z.array(z.number().finite().nullable()).max(96).optional(),
        /** Where the wind comes from (degrees), asked since the wind moves the clouds; absent from older answers. */
        wind_direction_10m: z.array(z.number().min(0).max(360).nullable()).max(96).optional(),
        /** Wind speed (km/h), asked since the clouds go as fast as the wind; absent from older answers. */
        wind_speed_10m: z.array(z.number().min(0).max(500).nullable()).max(96).optional(),
        /** Rain, showers and snow of the quarter hour (mm), asked since the rain has levels; absent from older answers. */
        precipitation: z.array(z.number().min(0).max(500).nullable()).max(96).optional(),
        /** Relative humidity of the air (%), asked since the grass dries and burns; absent from older answers. */
        relative_humidity_2m: z.array(z.number().min(0).max(100).nullable()).max(96).optional(),
    }),
});

/**
 * The timeline of an Open-Meteo answer asked with minutely_15=weather_code,temperature_2m,cloud_cover,wind_direction_10m,wind_speed_10m,precipitation,relative_humidity_2m
 * and timeformat=unixtime.
 * Each value is taken for the quarter hour starting at its time. Undefined when the answer has no such timeline.
 */
export function slotsFromOpenMeteo(answer: unknown): RealWeatherSlot[] | undefined {
    const parsed = OpenMeteoTimeline.safeParse(answer);
    if (!parsed.success) return undefined;
    const {
        time,
        weather_code,
        temperature_2m,
        cloud_cover,
        wind_direction_10m,
        wind_speed_10m,
        precipitation,
        relative_humidity_2m,
    } = parsed.data.minutely_15;
    if (weather_code.length !== time.length || temperature_2m.length !== time.length) return undefined;
    if (cloud_cover && cloud_cover.length !== time.length) return undefined;
    if (wind_direction_10m && wind_direction_10m.length !== time.length) return undefined;
    if (wind_speed_10m && wind_speed_10m.length !== time.length) return undefined;
    if (precipitation && precipitation.length !== time.length) return undefined;
    if (relative_humidity_2m && relative_humidity_2m.length !== time.length) return undefined;
    return time.map((seconds, index) => {
        const code = weather_code[index];
        // The cloud cover itself when given (any weather: it sets the clouds over the rain too), else the WMO code.
        const cover = cloud_cover?.[index];
        const cloudiness =
            cover !== undefined && cover !== null
                ? Math.max(0, Math.min(1, cover / 100))
                : code === null
                  ? undefined
                  : cloudinessFromWmoCode(code);
        const weather = (code === null ? undefined : weatherFromWmoCode(code)) ?? null;
        // The precipitation given with the code of a quarter hour, as seen in real answers (they change together):
        // the sum over a quarter hour, four times that an hour.
        const fallen = precipitation?.[index];
        const raining = weather === WeatherType.Rain || weather === WeatherType.Storm;
        return {
            at: seconds * 1000,
            weather,
            temperature: temperature_2m[index],
            ...(cloudiness ? { cloudiness } : {}),
            ...(typeof wind_direction_10m?.[index] === "number" ? { windFrom: wind_direction_10m[index] } : {}),
            ...(typeof wind_speed_10m?.[index] === "number" ? { windSpeed: wind_speed_10m[index] } : {}),
            ...(raining && typeof fallen === "number" ? { rainRate: fallen * QUARTERS_AN_HOUR } : {}),
            ...(typeof relative_humidity_2m?.[index] === "number" ? { humidity: relative_humidity_2m[index] } : {}),
        };
    });
}

/**
 * The real weather at one instant: its game weather, since when it lasts and until when (epoch ms; no end when the
 * run reaches the end of the timeline or a hole), the weather just before it if known, and its temperature (°C).
 */
export interface RealWeatherAt {
    weather: ObservedWeather;
    since: number;
    until: number | undefined;
    before: ObservedWeather | undefined;
    temperature: number | null;
    /** Start of the quarter hour under way, its clouds and those of the quarter hour before (0 if none). */
    slotAt: number;
    cloudiness: number;
    cloudinessBefore: number;
    /** Where the wind of the quarter hour under way and of the one before come from (degrees), when given. */
    windFrom: number | undefined;
    windFromBefore: number | undefined;
    /** The wind speed (km/h) of the quarter hour under way and of the one before, when given. */
    windSpeed: number | undefined;
    windSpeedBefore: number | undefined;
    /** How hard it rains (mm an hour) over the quarter hour under way and over the one before, when given. */
    rainRate: number | undefined;
    rainRateBefore: number | undefined;
    /**
     * The wet episode: rain and storm together, whichever follows the other. Since when it has been raining, while it
     * rains; when it last stopped, when a rain ended within the last half hour of the timeline.
     */
    rainSince: number | undefined;
    rainEndedAt: number | undefined;
}

/**
 * The weather of the quarter hour of `slots` (in order) under way at `epoch`, dated from the start to the end of its
 * unbroken run of the same weather: every browser finds the same dates, so fog and snow fade alike for everyone. Undefined
 * outside the timeline, in a hole, or for a quarter hour without weather.
 */
export function realWeatherAt(slots: readonly RealWeatherSlot[], epoch: number): RealWeatherAt | undefined {
    let index = slots.length - 1;
    while (index >= 0 && slots[index].at > epoch) index--;
    if (index < 0) return undefined;
    const current = slots[index];
    const weather = current.weather;
    if (weather === null || epoch >= current.at + REAL_WEATHER_SLOT_MS) return undefined;
    const follows = (later: number, earlier: number): boolean =>
        slots[later].at === slots[earlier].at + REAL_WEATHER_SLOT_MS;
    let first = index;
    while (first > 0 && slots[first - 1].weather === weather && follows(first, first - 1)) first--;
    let last = index;
    while (last < slots.length - 1 && slots[last + 1].weather === weather && follows(last + 1, last)) last++;
    const next = last < slots.length - 1 && follows(last + 1, last) ? slots[last + 1] : undefined;
    const previous = first > 0 && follows(first, first - 1) ? slots[first - 1] : undefined;
    const wet = (slot: RealWeatherSlot): boolean =>
        slot.weather === WeatherType.Rain || slot.weather === WeatherType.Storm;
    let rainSince: number | undefined;
    let rainEndedAt: number | undefined;
    if (wet(current)) {
        let start = index;
        while (start > 0 && wet(slots[start - 1]) && follows(start, start - 1)) start--;
        rainSince = slots[start].at;
    } else {
        // The last quarter hour of rain among the two before this one: the puddles take less than that to dry.
        for (let back = index - 1; back >= Math.max(0, index - 2) && follows(back + 1, back); back--) {
            if (wet(slots[back])) {
                rainEndedAt = slots[back].at + REAL_WEATHER_SLOT_MS;
                break;
            }
        }
    }
    return {
        weather,
        since: slots[first].at,
        until: next?.weather ? next.at : undefined,
        before: previous?.weather ?? undefined,
        temperature: current.temperature,
        slotAt: current.at,
        cloudiness: current.cloudiness ?? 0,
        cloudinessBefore: index > 0 && follows(index, index - 1) ? (slots[index - 1].cloudiness ?? 0) : 0,
        windFrom: current.windFrom,
        windFromBefore: index > 0 && follows(index, index - 1) ? slots[index - 1].windFrom : undefined,
        windSpeed: current.windSpeed,
        windSpeedBefore: index > 0 && follows(index, index - 1) ? slots[index - 1].windSpeed : undefined,
        rainRate: current.rainRate,
        rainRateBefore: index > 0 && follows(index, index - 1) ? slots[index - 1].rainRate : undefined,
        rainSince,
        rainEndedAt,
    };
}

/** Clouds of a WMO code that the game draws as clear: 1 (mainly clear) a few, 2 half the sky, 3 overcast. */
export function cloudinessFromWmoCode(code: number): number | undefined {
    if (code === 1) return 0.2;
    if (code === 2) return 0.5;
    if (code === 3) return 0.9;
    return undefined;
}

/**
 * The game weather for a WMO weather interpretation code, as reported by Open-Meteo. Clouds count as clear; freezing
 * drizzle and rain fall as rain; hail is part of a thunderstorm. An unknown code has no weather.
 */
export function weatherFromWmoCode(code: number): ObservedWeather | undefined {
    if (!Number.isInteger(code)) return undefined;
    if (code >= 0 && code <= 3) return WeatherType.Clear;
    if (code === 45 || code === 48) return WeatherType.Fog;
    if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
        return WeatherType.Rain;
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return WeatherType.Snow;
    if (code >= 95 && code <= 99) return WeatherType.Storm;
    return undefined;
}
