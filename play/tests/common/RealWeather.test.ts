import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    cloudinessFromWmoCode,
    RealWeatherForecast,
    realWeatherAt,
    slotsFromOpenMeteo,
    weatherFromWmoCode,
} from "../../src/common/RealWeather";
import type { ObservedWeather, RealWeatherSlot } from "../../src/common/RealWeather";
import { OPEN_METEO_ASKED_AT, OPEN_METEO_PARIS } from "./OpenMeteoFixture";
import { OPEN_METEO_RAINY } from "./OpenMeteoRainyFixture";

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
        // Code 1 (mainly clear): a clear quarter hour with a few clouds.
        expect(slots?.[31]).toEqual({ at: 1794675600000, weather: "clear", temperature: 8.1, cloudiness: 0.2 });
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

describe("cloudinessFromWmoCode", () => {
    it("gives clouds to the clear codes: 1 a few, 2 half the sky, 3 overcast; none otherwise", () => {
        expect(cloudinessFromWmoCode(0)).toBeUndefined();
        expect(cloudinessFromWmoCode(1)).toBe(0.2);
        expect(cloudinessFromWmoCode(2)).toBe(0.5);
        expect(cloudinessFromWmoCode(3)).toBe(0.9);
        expect(cloudinessFromWmoCode(61)).toBeUndefined();
    });

    it("takes the cloud cover (%) of each quarter hour when Open-Meteo gives it, the code otherwise", () => {
        expect(
            slotsFromOpenMeteo({
                minutely_15: {
                    time: [0, 900, 1800, 2700],
                    weather_code: [0, 2, 61, 3],
                    temperature_2m: [5, 5, 5, 5],
                    cloud_cover: [35, 80, 100, null],
                },
            }),
        ).toEqual([
            { at: 0, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.35 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.8 },
            { at: 2 * SLOT, weather: WeatherType.Rain, temperature: 5, cloudiness: 1 },
            { at: 3 * SLOT, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.9 },
        ]);
    });

    it("refuses a cloud cover column of another length", () => {
        expect(
            slotsFromOpenMeteo({
                minutely_15: { time: [0, 900], weather_code: [0, 0], temperature_2m: [1, 1], cloud_cover: [10] },
            }),
        ).toBeUndefined();
    });

    it("keeps a cloudy quarter hour clear, with its clouds", () => {
        expect(
            slotsFromOpenMeteo({ minutely_15: { time: [0, 900], weather_code: [3, 0], temperature_2m: [5, 5] } }),
        ).toEqual([
            { at: 0, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.9 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5 },
        ]);
    });

    it("gives the clouds of the quarter hour under way and of the one before, for fading", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Rain, temperature: 5 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.9 },
            { at: 2 * SLOT, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.2 },
        ];
        expect(realWeatherAt(slots, SLOT)).toMatchObject({ slotAt: SLOT, cloudiness: 0.9, cloudinessBefore: 0 });
        expect(realWeatherAt(slots, 2 * SLOT + 1)).toMatchObject({
            slotAt: 2 * SLOT,
            cloudiness: 0.2,
            cloudinessBefore: 0.9,
        });
        // A change of clouds does not break the run of clear weather.
        expect(realWeatherAt(slots, 2 * SLOT + 1)).toMatchObject({ since: SLOT });
    });

    it("takes where the wind comes from (degrees, 0 north, 90 east) for each quarter hour when Open-Meteo gives it", () => {
        expect(
            slotsFromOpenMeteo({
                minutely_15: {
                    time: [0, 900],
                    weather_code: [0, 0],
                    temperature_2m: [5, 5],
                    wind_direction_10m: [270, null],
                },
            }),
        ).toEqual([
            { at: 0, weather: WeatherType.Clear, temperature: 5, windFrom: 270 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5 },
        ]);
    });

    it("takes the wind speed (km/h at 10 m) of each quarter hour when Open-Meteo gives it", () => {
        expect(
            slotsFromOpenMeteo({
                minutely_15: {
                    time: [0, 900],
                    weather_code: [0, 0],
                    temperature_2m: [5, 5],
                    wind_speed_10m: [32.4, null],
                },
            }),
        ).toEqual([
            { at: 0, weather: WeatherType.Clear, temperature: 5, windSpeed: 32.4 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5 },
        ]);
    });

    it("takes the humidity of the air (%) of each quarter hour when Open-Meteo gives it", () => {
        expect(
            slotsFromOpenMeteo({
                minutely_15: {
                    time: [0, 900],
                    weather_code: [0, 0],
                    temperature_2m: [5, 5],
                    relative_humidity_2m: [73, null],
                },
            }),
        ).toEqual([
            { at: 0, weather: WeatherType.Clear, temperature: 5, humidity: 73 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5 },
        ]);
    });

    it("refuses a humidity column of another length", () => {
        expect(
            slotsFromOpenMeteo({
                minutely_15: {
                    time: [0, 900],
                    weather_code: [0, 0],
                    temperature_2m: [5, 5],
                    relative_humidity_2m: [73],
                },
            }),
        ).toBeUndefined();
    });

    it("gives the wind of the quarter hour under way and of the one before, for turning", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Clear, temperature: 5, windFrom: 350 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5, windFrom: 20 },
        ];
        expect(realWeatherAt(slots, SLOT + 1)).toMatchObject({ windFrom: 20, windFromBefore: 350 });
        expect(
            realWeatherAt(
                [
                    { at: 0, weather: WeatherType.Clear, temperature: 5, windSpeed: 10 },
                    { at: SLOT, weather: WeatherType.Clear, temperature: 5, windSpeed: 30 },
                ],
                SLOT + 1,
            ),
        ).toMatchObject({ windSpeed: 30, windSpeedBefore: 10 });
        expect(realWeatherAt(slots, 1)).toMatchObject({ windFrom: 350, windFromBefore: undefined });
    });

    it("lets an older tab read a quarter hour with clouds", () => {
        expect(
            RealWeatherForecast.safeParse({ slots: [{ at: 0, weather: "clear", temperature: 1, cloudiness: 0.5 }] })
                .success,
        ).toBe(true);
    });
});

describe("realWeatherAt", () => {
    const paris = slotsFromOpenMeteo(OPEN_METEO_PARIS) ?? [];

    it("gives the weather of the quarter hour under way, now, in one hour and in four hours", () => {
        expect(realWeatherAt(paris, NOW)).toMatchObject({
            weather: "clear",
            since: 1794647700000,
            temperature: 8.2,
            cloudiness: 0,
        });
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

    it("tells when the run ends and what came before it, for fading out and melting", () => {
        const slots = [
            slot(0, WeatherType.Snow),
            slot(SLOT, WeatherType.Fog),
            slot(2 * SLOT, WeatherType.Fog),
            slot(3 * SLOT, WeatherType.Clear),
        ];
        expect(realWeatherAt(slots, SLOT + 1)).toMatchObject({ until: 3 * SLOT, before: WeatherType.Snow });
        // The last run, or a run before a hole, has no known end; the first one, nothing known before it.
        expect(realWeatherAt(slots, 3 * SLOT)).toMatchObject({ until: undefined, before: WeatherType.Fog });
        expect(realWeatherAt(slots, 0)).toMatchObject({ until: SLOT, before: undefined });
        expect(realWeatherAt([slot(0, WeatherType.Rain), slot(2 * SLOT, WeatherType.Clear)], 0)).toMatchObject({
            until: undefined,
        });
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

describe("how hard it rains", () => {
    it("reads the rate of a real rain: the precipitation of the quarter hour, four times that an hour", () => {
        const slots = slotsFromOpenMeteo(OPEN_METEO_RAINY);
        // Code 53 with 0.2 mm, 51 with 0.1 mm, then showers (80) with 0.4 mm over the quarter hour.
        expect(slots?.[0]).toMatchObject({ weather: WeatherType.Rain, rainRate: 0.8 });
        expect(slots?.[2]).toMatchObject({ weather: WeatherType.Rain, rainRate: 0.4 });
        expect(slots?.[6]).toMatchObject({ weather: WeatherType.Rain, rainRate: 1.6 });
    });

    it("gives no rate outside a rain or a storm, nor to an answer without precipitation", () => {
        expect(slotsFromOpenMeteo(OPEN_METEO_PARIS)?.every((slot) => slot.rainRate === undefined)).toBe(true);
        const clear = {
            minutely_15: { time: [0, 900], weather_code: [0, 71], temperature_2m: [5, 5], precipitation: [0, 0.3] },
        };
        expect(slotsFromOpenMeteo(clear)?.some((slot) => "rainRate" in slot)).toBe(false);
    });

    it("tells the rate of the quarter hour under way and of the one before", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Rain, temperature: 5, rainRate: 0.4 },
            { at: SLOT, weather: WeatherType.Rain, temperature: 5, rainRate: 8 },
        ];
        expect(realWeatherAt(slots, SLOT + 1)).toMatchObject({ rainRate: 8, rainRateBefore: 0.4 });
        expect(realWeatherAt(slots, 1)).toMatchObject({ rainRate: 0.4, rainRateBefore: undefined });
    });
});
