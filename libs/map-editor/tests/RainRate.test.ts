import { describe, expect, it } from "vitest";
import { rainRateAt, STORM_RAIN_RATE, USUAL_RAIN_RATE } from "../src/Weather/RainRate";
import { slotsFromOpenMeteo, historySlotsFromOpenMeteo } from "../src/Weather/RealWeather";
import { autoWeatherAt } from "../src/Weather/WeatherSchedule";
import { WeatherType } from "../src/types";

// Part of a real Open-Meteo answer (Jakarta, 2026-11-18): code 53 with 0.2 mm, 51 with 0.1 mm, 80 with 0.4 mm, 3 dry.
const START = 1794987900;
const rainy = {
    minutely_15: {
        time: [0, 1, 2, 3].map((quarter) => START + quarter * 900),
        weather_code: [53, 51, 80, 3],
        temperature_2m: [27, 27, 27, 27],
        precipitation: [0.2, 0.1, 0.4, 0],
    },
};

describe("rainRateAt", () => {
    it("is dry without rain, and usual for a fixed rain or storm", () => {
        expect(USUAL_RAIN_RATE).toBe(2);
        expect(STORM_RAIN_RATE).toBe(10);
        expect(rainRateAt({ weather: WeatherType.Clear }, 0, undefined)).toBe(0);
        expect(rainRateAt(undefined, 0, undefined)).toBe(0);
        expect(rainRateAt({ weather: WeatherType.Rain }, 0, undefined)).toBe(2);
        expect(rainRateAt({ weather: WeatherType.Storm }, 0, undefined)).toBe(10);
        expect(rainRateAt({ weather: WeatherType.Fog }, 0, undefined)).toBe(0);
        expect(rainRateAt({ weather: WeatherType.Cloudy }, 0, undefined)).toBe(0);
    });

    it("reads a map saved with a fixed snow as a rain, in any season", () => {
        expect(rainRateAt({ weather: WeatherType.Snow }, Date.UTC(2026, 6, 14, 12), undefined)).toBe(2);
        expect(rainRateAt({ weather: WeatherType.Snow }, Date.UTC(2026, 0, 14, 12), undefined)).toBe(2);
    });

    it("gives the water a real snowfall holds: the cold of the room says how much of it is snow", () => {
        // WMO 73 (moderate snow fall) with 0.5 mm of water in the quarter hour, 71 (slight) with 0.1 mm.
        const snowy = slotsFromOpenMeteo({
            minutely_15: {
                time: [0, 1].map((quarter) => START + quarter * 900),
                weather_code: [73, 71],
                temperature_2m: [-1, -1],
                precipitation: [0.5, 0.1],
            },
        });
        expect(snowy?.map((slot) => slot.weather)).toEqual([WeatherType.Rain, WeatherType.Rain]);
        const real = { weather: WeatherType.Real };
        expect(rainRateAt(real, (snowy?.[0].at ?? 0) + 1, snowy)).toBeCloseTo(2);
        expect(rainRateAt(real, (snowy?.[1].at ?? 0) + 1, snowy)).toBeCloseTo(0.4);
    });

    it("follows the automatic schedule", () => {
        const auto = { weather: WeatherType.Automatic };
        const seen = new Set<number>();
        for (let hour = 0; hour < 24 * 60; hour++) {
            const date = new Date(Date.UTC(2026, 9, 1) + hour * 3_600_000);
            const drawn = autoWeatherAt(date);
            const expected = drawn === WeatherType.Rain ? 2 : drawn === WeatherType.Storm ? 10 : 0;
            expect(rainRateAt(auto, date.getTime(), undefined)).toBe(expected);
            seen.add(expected);
        }
        // Two months of autumn show dry weather and rain at least.
        expect(seen.has(0) && seen.has(2)).toBe(true);
    });

    it("reads the real rate of the quarter hour under way", () => {
        const slots = slotsFromOpenMeteo(rainy) ?? [];
        const real = { weather: WeatherType.Real };
        expect(rainRateAt(real, slots[0].at + 1, slots)).toBeCloseTo(0.8);
        expect(rainRateAt(real, slots[2].at + 1, slots)).toBeCloseTo(1.6);
        expect(rainRateAt(real, slots[3].at + 1, slots)).toBe(0);
    });

    it("falls back to the usual rate, then to the automatic schedule, when the real one is not known", () => {
        const real = { weather: WeatherType.Real };
        // A rainy quarter hour without a rate (an answer older than the rates).
        const noRate = slotsFromOpenMeteo({ minutely_15: { ...rainy.minutely_15, precipitation: undefined } }) ?? [];
        expect(rainRateAt(real, noRate[0].at + 1, noRate)).toBe(2);
        // Outside the timeline, and without any timeline: what the automatic schedule draws.
        const slots = slotsFromOpenMeteo(rainy) ?? [];
        const far = slots[0].at - 86_400_000;
        const automatic = rainRateAt({ weather: WeatherType.Automatic }, far, undefined);
        expect(rainRateAt(real, far, slots)).toBe(automatic);
        expect(rainRateAt(real, far, undefined)).toBe(automatic);
    });

    it("never gives a broken rate", () => {
        expect(rainRateAt({ weather: WeatherType.Rain }, Number.NaN, undefined)).toBe(2);
        expect(rainRateAt({ weather: WeatherType.Automatic }, Number.NaN, undefined)).toBe(0);
    });
});

describe("historySlotsFromOpenMeteo", () => {
    it("gives each past hour as four quarter hours, its rain an hour as it is", () => {
        const slots = historySlotsFromOpenMeteo({
            hourly: {
                time: [3600, 7200],
                weather_code: [61, 0],
                temperature_2m: [4, -2],
                precipitation: [2, 0],
                relative_humidity_2m: [90, 60],
            },
        });
        expect(slots).toHaveLength(8);
        expect(slots?.[0]).toMatchObject({ at: 3_600_000, temperature: 4, rainRate: 2, humidity: 90 });
        expect(slots?.[3].at).toBe(3_600_000 + 3 * 15 * 60 * 1000);
        expect(slots?.[4]).toMatchObject({ at: 7_200_000, temperature: -2 });
        expect(historySlotsFromOpenMeteo({ minutely_15: {} })).toBeUndefined();
    });
});
