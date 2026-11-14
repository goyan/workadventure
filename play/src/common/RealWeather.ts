import { WeatherType } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
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
});
export type RealWeatherSlot = z.infer<typeof RealWeatherSlot>;

/**
 * What the pusher answers on /real-weather: the timeline of the weather at a place, a couple of hours back and some
 * hours ahead, in order. Every browser reads the same timeline at the same time, so the weather changes at once for all.
 */
export const RealWeatherForecast = z.object({ slots: z.array(RealWeatherSlot).max(96) });
export type RealWeatherForecast = z.infer<typeof RealWeatherForecast>;

const OpenMeteoTimeline = z.object({
    minutely_15: z.object({
        time: z.array(z.number().int().nonnegative()).max(96),
        weather_code: z.array(z.number().nullable()).max(96),
        temperature_2m: z.array(z.number().finite().nullable()).max(96),
    }),
});

/**
 * The timeline of an Open-Meteo answer asked with minutely_15=weather_code,temperature_2m and timeformat=unixtime.
 * Each value is taken for the quarter hour starting at its time. Undefined when the answer has no such timeline.
 */
export function slotsFromOpenMeteo(answer: unknown): RealWeatherSlot[] | undefined {
    const parsed = OpenMeteoTimeline.safeParse(answer);
    if (!parsed.success) return undefined;
    const { time, weather_code, temperature_2m } = parsed.data.minutely_15;
    if (weather_code.length !== time.length || temperature_2m.length !== time.length) return undefined;
    return time.map((seconds, index) => {
        const code = weather_code[index];
        return {
            at: seconds * 1000,
            weather: (code === null ? undefined : weatherFromWmoCode(code)) ?? null,
            temperature: temperature_2m[index],
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
    return {
        weather,
        since: slots[first].at,
        until: next?.weather ? next.at : undefined,
        before: previous?.weather ?? undefined,
        temperature: current.temperature,
    };
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
