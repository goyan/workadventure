import { z } from "zod";
import type { WeatherLocation } from "@workadventure/map-editor";
import { WORLD_CITIES } from "./WorldCities";

/**
 * Places known for their snow, asked with the cities of the sky of the world when a player looks for a place where it
 * snows (the list of the sky has few cold places, none in the south): they are not part of the morning, noon and
 * evening of the world. Coordinates from Wikipedia, time zones from the tz database (zone1970.tab).
 */
export const WORLD_WEATHER_EXTRA_PLACES: readonly WeatherLocation[] = [
    { name: "Sapporo", latitude: 43.06, longitude: 141.35, timezone: "Asia/Tokyo" },
    { name: "Tromsø", latitude: 69.65, longitude: 18.96, timezone: "Europe/Oslo" },
    { name: "Nuuk", latitude: 64.18, longitude: -51.74, timezone: "America/Nuuk" },
    { name: "Ushuaïa", latitude: -54.81, longitude: -68.31, timezone: "America/Argentina/Ushuaia" },
];

/** The places whose weather now is asked all at once, to find where it rains or snows in the world. */
export const WORLD_WEATHER_PLACES: readonly WeatherLocation[] = [...WORLD_CITIES, ...WORLD_WEATHER_EXTRA_PLACES];

/** The weather now at a place of the list, as the game reads it (RealWeather): its WMO code, its air, its water. */
export const WorldPlaceWeather = z.object({
    name: z.string().min(1).max(100),
    weatherCode: z.number().int().nullable(),
    temperature: z.number().finite().nullable(),
    /** Relative humidity, in %. */
    humidity: z.number().min(0).max(100).nullable(),
    /** What fell over the quarter hour under way, as mm of water an hour (snow as its water). */
    rainRate: z.number().min(0).max(2000).nullable(),
    isDay: z.boolean(),
});
export type WorldPlaceWeather = z.infer<typeof WorldPlaceWeather>;

/** What the pusher answers on /real-weather/world: the weather now at every place, and since when (epoch ms). */
export const WorldWeatherReport = z.object({ at: z.number(), places: z.array(WorldPlaceWeather).max(100) });
export type WorldWeatherReport = z.infer<typeof WorldWeatherReport>;

/**
 * The one request of Open-Meteo for the weather now at every place (its coordinates comma separated: the answer is a
 * list, one per place, in the same order), with the values the game reads for the rain and the snow.
 */
export function openMeteoWorldUrl(places: readonly Pick<WeatherLocation, "latitude" | "longitude">[]): URL {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", places.map((place) => place.latitude).join(","));
    url.searchParams.set("longitude", places.map((place) => place.longitude).join(","));
    url.searchParams.set("current", "weather_code,temperature_2m,relative_humidity_2m,precipitation,is_day");
    url.searchParams.set("timeformat", "unixtime");
    return url;
}

const OpenMeteoCurrent = z.object({
    current: z.object({
        time: z.number().int().nonnegative(),
        /** Seconds the values of `current` cover: a quarter hour. */
        interval: z.number().int().positive(),
        weather_code: z.number().nullable(),
        temperature_2m: z.number().finite().nullable(),
        relative_humidity_2m: z.number().min(0).max(100).nullable(),
        /** Rain, showers and snow over the interval, in mm of water. */
        precipitation: z.number().min(0).max(500).nullable(),
        is_day: z.number().nullable(),
    }),
});
const OpenMeteoWorld = z.array(OpenMeteoCurrent).max(100);

/** The weather now at each place asked, from the answer of openMeteoWorldUrl; undefined for an answer that is not one. */
export function worldWeatherFromOpenMeteo(
    answer: unknown,
    places: readonly Pick<WeatherLocation, "name">[],
): WorldWeatherReport | undefined {
    const parsed = OpenMeteoWorld.safeParse(answer);
    if (!parsed.success || parsed.data.length !== places.length || places.length === 0) return undefined;
    const reports = parsed.data.map(({ current }, index) => ({
        name: places[index]?.name ?? "",
        weatherCode: current.weather_code === null ? null : Math.round(current.weather_code),
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        rainRate:
            current.precipitation === null
                ? null
                : Math.round(((current.precipitation * 3600) / current.interval) * 100) / 100,
        isDay: current.is_day === 1,
    }));
    return { at: (parsed.data[0]?.current.time ?? 0) * 1000, places: reports };
}
