import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    RealWeatherForecast,
    realWeatherAt,
    slotsFromOpenMeteo,
    weatherFromWmoCode,
} from "../../src/common/RealWeather";
import type { ObservedWeather, RealWeatherSlot } from "../../src/common/RealWeather";
import { OPEN_METEO_ASKED_AT, OPEN_METEO_PARIS } from "./OpenMeteoFixture";

describe("weatherFromWmoCode", () => {
    // WMO weather interpretation codes, as listed by the Open-Meteo documentation.
    it.each([
        [0, WeatherType.Clear],
        [1, WeatherType.Clear],
        [2, WeatherType.Clear],
        [3, WeatherType.Clear],
        [45, WeatherType.Fog],
        [48, WeatherType.Fog],
        [51, WeatherType.Rain],
        [55, WeatherType.Rain],
        [56, WeatherType.Rain],
        [57, WeatherType.Rain],
        [61, WeatherType.Rain],
        [65, WeatherType.Rain],
        [66, WeatherType.Rain],
        [67, WeatherType.Rain],
        [71, WeatherType.Snow],
        [75, WeatherType.Snow],
        [77, WeatherType.Snow],
        [80, WeatherType.Rain],
        [82, WeatherType.Rain],
        [85, WeatherType.Snow],
        [86, WeatherType.Snow],
        [95, WeatherType.Storm],
        [96, WeatherType.Storm],
        [99, WeatherType.Storm],
    ])("code %i is %s", (code, weather) => {
        expect(weatherFromWmoCode(code)).toBe(weather);
    });

    it.each([4, 44, 50, 70, 100, -1, 1.5, Number.NaN])("unknown code %s has no weather", (code) => {
        expect(weatherFromWmoCode(code)).toBeUndefined();
    });
});

const SLOT = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = OPEN_METEO_ASKED_AT * 1000;

function slot(at: number, weather: ObservedWeather | null, temperature: number | null = null): RealWeatherSlot {
    return { at, weather, temperature };
}

describe("slotsFromOpenMeteo", () => {
    it("reads the quarter-hour timeline of a real answer: start, game weather and temperature", () => {
        const slots = slotsFromOpenMeteo(OPEN_METEO_PARIS);
        expect(slots).toHaveLength(32);
        expect(slots?.[0]).toEqual({ at: 1794647700000, weather: "clear", temperature: 4.9 });
        expect(slots?.[31]).toEqual({ at: 1794675600000, weather: "clear", temperature: 8.1 });
    });

    it("keeps a quarter hour without a usable code or temperature, without its weather or temperature", () => {
        const slots = slotsFromOpenMeteo({
            minutely_15: { time: [0, 900, 1800], weather_code: [61, 42, null], temperature_2m: [3, null, 2] },
        });
        expect(slots).toEqual([slot(0, WeatherType.Rain, 3), slot(SLOT, null), slot(2 * SLOT, null, 2)]);
    });

    it("refuses an answer without a timeline, or with columns of different lengths", () => {
        expect(slotsFromOpenMeteo({ current: { weather_code: 0 } })).toBeUndefined();
        expect(
            slotsFromOpenMeteo({ minutely_15: { time: [0, 900], weather_code: [0], temperature_2m: [1, 2] } }),
        ).toBeUndefined();
    });
});

describe("realWeatherAt", () => {
    const paris = slotsFromOpenMeteo(OPEN_METEO_PARIS) ?? [];

    it("gives the weather of the quarter hour under way, now, in one hour and in four hours", () => {
        expect(realWeatherAt(paris, NOW)).toEqual({ weather: "clear", since: 1794647700000, temperature: 8.2 });
        expect(realWeatherAt(paris, NOW + HOUR)).toMatchObject({ weather: "clear", temperature: 9.4 });
        expect(realWeatherAt(paris, NOW + 4 * HOUR)).toMatchObject({ weather: "clear", temperature: 10 });
    });

    it("dates a weather from the first quarter hour of its unbroken run, the same for everyone", () => {
        const slots = [
            slot(0, WeatherType.Clear),
            slot(SLOT, WeatherType.Rain),
            slot(2 * SLOT, WeatherType.Rain),
            slot(3 * SLOT, WeatherType.Fog),
        ];
        expect(realWeatherAt(slots, 2 * SLOT + 1)).toMatchObject({ weather: "rain", since: SLOT });
        expect(realWeatherAt(slots, 3 * SLOT)).toMatchObject({ weather: "fog", since: 3 * SLOT });
        // A hole in the timeline ends the run.
        const holed = [slot(0, WeatherType.Rain), slot(2 * SLOT, WeatherType.Rain)];
        expect(realWeatherAt(holed, 2 * SLOT)).toMatchObject({ since: 2 * SLOT });
    });

    it("gives nothing outside the timeline, in a hole, or for a quarter hour without weather", () => {
        expect(realWeatherAt(paris, 1794647700000 - 1)).toBeUndefined();
        expect(realWeatherAt(paris, 1794675600000 + SLOT)).toBeUndefined();
        expect(realWeatherAt([slot(0, WeatherType.Rain), slot(2 * SLOT, WeatherType.Rain)], SLOT)).toBeUndefined();
        expect(realWeatherAt([slot(0, null, 4)], 0)).toBeUndefined();
        expect(realWeatherAt([], 0)).toBeUndefined();
    });
});

describe("RealWeatherForecast", () => {
    it("accepts quarter hours with or without weather and temperature", () => {
        const forecast = { slots: [slot(0, WeatherType.Fog, -1.5), slot(SLOT, null)] };
        expect(RealWeatherForecast.parse(forecast)).toEqual(forecast);
        expect(RealWeatherForecast.parse({ slots: [] })).toEqual({ slots: [] });
    });

    it("refuses the map modes, which are not observed weathers", () => {
        expect(RealWeatherForecast.safeParse({ slots: [slot(0, WeatherType.Clear)] }).success).toBe(true);
        expect(
            RealWeatherForecast.safeParse({ slots: [{ at: 0, weather: "automatic", temperature: null }] }).success,
        ).toBe(false);
        expect(RealWeatherForecast.safeParse({ slots: [{ at: 0, weather: "real", temperature: null }] }).success).toBe(
            false,
        );
    });
});
