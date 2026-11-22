import { describe, expect, it } from "vitest";
import {
    WORLD_WEATHER_EXTRA_PLACES,
    WORLD_WEATHER_PLACES,
    openMeteoWorldUrl,
    worldWeatherFromOpenMeteo,
} from "../../src/common/WorldWeather";
import { WORLD_CITIES } from "../../src/common/WorldCities";

/** One place of an answer of Open-Meteo asked with current=… and timeformat=unixtime (as seen in a real answer). */
const answerOf = (current: Record<string, number | null>) => ({
    latitude: 0,
    longitude: 0,
    current: { time: 1795342500, interval: 900, ...current },
});

describe("WORLD_WEATHER_PLACES", () => {
    it("is the cities of the sky of the world, then a few snowy places, each with a time zone the clock can show", () => {
        expect(WORLD_WEATHER_PLACES.slice(0, WORLD_CITIES.length)).toEqual(WORLD_CITIES);
        expect(WORLD_WEATHER_PLACES.slice(WORLD_CITIES.length)).toEqual(WORLD_WEATHER_EXTRA_PLACES);
        for (const place of WORLD_WEATHER_PLACES) {
            expect(() => new Intl.DateTimeFormat("en", { timeZone: place.timezone }), place.name).not.toThrow();
        }
        expect(new Set(WORLD_WEATHER_PLACES.map((place) => place.name)).size).toBe(WORLD_WEATHER_PLACES.length);
    });
});

describe("openMeteoWorldUrl", () => {
    it("asks the weather now of every place in one request, with their coordinates only", () => {
        const places = [
            { name: "Paris", latitude: 48.86, longitude: 2.35, timezone: "Europe/Paris" },
            { name: "Reykjavik", latitude: 64.15, longitude: -21.94, timezone: "Atlantic/Reykjavik" },
        ];
        const url = openMeteoWorldUrl(places);
        expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
        expect(url.searchParams.get("latitude")).toBe("48.86,64.15");
        expect(url.searchParams.get("longitude")).toBe("2.35,-21.94");
        expect(url.searchParams.get("current")).toBe(
            "weather_code,temperature_2m,relative_humidity_2m,precipitation,is_day",
        );
        expect(url.searchParams.get("timeformat")).toBe("unixtime");
        expect([...url.searchParams.keys()].sort()).toEqual(["current", "latitude", "longitude", "timeformat"]);
    });
});

describe("worldWeatherFromOpenMeteo", () => {
    const places = [
        { name: "Paris", latitude: 48.86, longitude: 2.35 },
        { name: "Moscou", latitude: 55.76, longitude: 37.62 },
    ];

    it("reads the weather of each place in the order asked, its precipitation of the quarter hour as a rate an hour", () => {
        const report = worldWeatherFromOpenMeteo(
            [
                answerOf({
                    weather_code: 61,
                    temperature_2m: 8.6,
                    relative_humidity_2m: 86,
                    precipitation: 0.6,
                    is_day: 1,
                }),
                answerOf({
                    weather_code: 71,
                    temperature_2m: -2,
                    relative_humidity_2m: 77,
                    precipitation: 0.1,
                    is_day: 0,
                }),
            ],
            places,
        );
        expect(report).toEqual({
            at: 1795342500 * 1000,
            places: [
                { name: "Paris", weatherCode: 61, temperature: 8.6, humidity: 86, rainRate: 2.4, isDay: true },
                { name: "Moscou", weatherCode: 71, temperature: -2, humidity: 77, rainRate: 0.4, isDay: false },
            ],
        });
    });

    it("keeps a value Open-Meteo does not know as unknown", () => {
        const report = worldWeatherFromOpenMeteo(
            [
                answerOf({
                    weather_code: null,
                    temperature_2m: null,
                    relative_humidity_2m: null,
                    precipitation: null,
                    is_day: 1,
                }),
                answerOf({ weather_code: 0, temperature_2m: 3, relative_humidity_2m: 50, precipitation: 0, is_day: 1 }),
            ],
            places,
        );
        expect(report?.places[0]).toEqual({
            name: "Paris",
            weatherCode: null,
            temperature: null,
            humidity: null,
            rainRate: null,
            isDay: true,
        });
    });

    it("takes nothing from an answer that is not one weather per place asked", () => {
        const one = answerOf({
            weather_code: 0,
            temperature_2m: 3,
            relative_humidity_2m: 50,
            precipitation: 0,
            is_day: 1,
        });
        expect(worldWeatherFromOpenMeteo([one], places)).toBeUndefined();
        expect(worldWeatherFromOpenMeteo(one, places)).toBeUndefined();
        expect(worldWeatherFromOpenMeteo({ error: true, reason: "x" }, places)).toBeUndefined();
        expect(worldWeatherFromOpenMeteo([one, { current: { time: "now" } }], places)).toBeUndefined();
    });
});
