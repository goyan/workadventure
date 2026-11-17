import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { slotsFromOpenMeteo } from "../../../../../src/common/RealWeather";
import { weatherForecast } from "../../../../../src/front/Phaser/Game/Weather/WeatherForecast";
import { autoWeatherAt, cloudinessAt } from "../../../../../src/front/Phaser/Game/Weather/WeatherSchedule";
import { OPEN_METEO_ASKED_AT, OPEN_METEO_PARIS } from "../../../../common/OpenMeteoFixture";

const HOUR = 60 * 60 * 1000;
const NOW = OPEN_METEO_ASKED_AT * 1000;
const paris = { status: "known" as const, slots: slotsFromOpenMeteo(OPEN_METEO_PARIS) ?? [] };
const auto = { frequency: "stormy" as const, include: [WeatherType.Rain, WeatherType.Storm, WeatherType.Fog] };

describe("weatherForecast", () => {
    it("gives the real weather and temperature now, in one hour and in four hours", () => {
        expect(weatherForecast({ weather: WeatherType.Real }, NOW, paris)).toEqual([
            { at: NOW, weather: WeatherType.Clear, temperature: 8.2 },
            { at: NOW + HOUR, weather: WeatherType.Clear, temperature: 9.4 },
            { at: NOW + 4 * HOUR, weather: WeatherType.Clear, temperature: 10 },
        ]);
    });

    it("leaves blank an hour past the end of the timeline, and everything before the first answer", () => {
        const late = NOW + 3 * HOUR;
        const cells = weatherForecast({ weather: WeatherType.Real }, late, paris);
        expect(cells[0].weather).toBe(WeatherType.Clear);
        expect(cells[2]).toEqual({ at: late + 4 * HOUR, weather: undefined, temperature: undefined });
        expect(weatherForecast({ weather: WeatherType.Real }, NOW, { status: "pending" })).toEqual([
            { at: NOW, weather: undefined, temperature: undefined },
            { at: NOW + HOUR, weather: undefined, temperature: undefined },
            { at: NOW + 4 * HOUR, weather: undefined, temperature: undefined },
        ]);
    });

    it("follows the seasonal schedule in Automatic or when the real weather is unavailable, with the real temperature when known", () => {
        const expected = [0, 1, 4].map((hours) => ({
            at: NOW + hours * HOUR,
            weather: autoWeatherAt(new Date(NOW + hours * HOUR), auto),
            temperature: undefined,
        }));
        const withTemperatures = expected.map((cell, index) => ({ ...cell, temperature: [8.2, 9.4, 10][index] }));
        expect(weatherForecast({ weather: WeatherType.Automatic, weatherAuto: auto }, NOW, paris)).toEqual(
            withTemperatures,
        );
        expect(
            weatherForecast({ weather: WeatherType.Automatic, weatherAuto: auto }, NOW, { status: "unavailable" }),
        ).toEqual(expected);
        expect(
            weatherForecast({ weather: WeatherType.Real, weatherAuto: auto }, NOW, { status: "unavailable" }),
        ).toEqual(expected);
        expect(
            weatherForecast({ weather: WeatherType.Real, weatherAuto: auto }, NOW + 9 * HOUR, paris)[0].weather,
        ).toBe(autoWeatherAt(new Date(NOW + 9 * HOUR), auto));
    });

    it("keeps a fixed weather, clear for a map without weather", () => {
        expect(weatherForecast({ weather: WeatherType.Snow }, NOW, paris).map((cell) => cell.temperature)).toEqual([
            8.2, 9.4, 10,
        ]);
        expect(weatherForecast({ weather: WeatherType.Snow }, NOW, paris).map((cell) => cell.weather)).toEqual([
            WeatherType.Snow,
            WeatherType.Snow,
            WeatherType.Snow,
        ]);
        expect(weatherForecast(undefined, NOW, paris).map((cell) => cell.weather)).toEqual([
            WeatherType.Clear,
            WeatherType.Clear,
            WeatherType.Clear,
        ]);
    });

    it("draws a snow as rain out of the snow season of Paris, as the sky does", () => {
        const july = Date.UTC(2026, 6, 14, 12);
        const snowing = {
            status: "known" as const,
            slots: Array.from({ length: 24 }, (_, index) => ({
                at: july + (index - 1) * 15 * 60 * 1000,
                weather: WeatherType.Snow as const,
                temperature: 1,
            })),
        };
        expect(weatherForecast({ weather: WeatherType.Snow }, july, paris)[0].weather).toBe(WeatherType.Rain);
        expect(weatherForecast({ weather: WeatherType.Real }, july, snowing)[0]).toEqual({
            at: july,
            weather: WeatherType.Rain,
            temperature: 1,
        });
        expect(weatherForecast({ weather: WeatherType.Snow }, NOW, paris)[0].weather).toBe(WeatherType.Snow);
    });

    it("gives the clouds of each hour: real quarter hours, the automatic chain, the Cloudy tile", () => {
        const cloudy = {
            status: "known" as const,
            slots: Array.from({ length: 24 }, (_, index) => ({
                at: NOW + (index - 1) * 15 * 60 * 1000,
                weather: WeatherType.Clear as const,
                temperature: 5,
                cloudiness: 0.9,
            })),
        };
        expect(weatherForecast({ weather: WeatherType.Real }, NOW, cloudy)[0]).toMatchObject({
            weather: WeatherType.Clear,
            cloudiness: 0.9,
        });
        expect(weatherForecast({ weather: WeatherType.Cloudy }, NOW, paris).map((cell) => cell)).toEqual([
            { at: NOW, weather: WeatherType.Clear, temperature: 8.2, cloudiness: 0.5 },
            { at: NOW + HOUR, weather: WeatherType.Clear, temperature: 9.4, cloudiness: 0.5 },
            { at: NOW + 4 * HOUR, weather: WeatherType.Clear, temperature: 10, cloudiness: 0.5 },
        ]);
        expect(
            weatherForecast({ weather: WeatherType.Automatic, weatherAuto: auto }, NOW, paris)[1].cloudiness ?? 0,
        ).toBe(cloudinessAt(new Date(NOW + HOUR), auto));
    });
    it("gives the real wind speed of the place, rounded to the km/h, and nothing when the wind is unknown", () => {
        const windy = {
            status: "known" as const,
            slots: Array.from({ length: 24 }, (_, index) => ({
                at: NOW + (index - 1) * 15 * 60 * 1000,
                weather: WeatherType.Clear as const,
                temperature: 5,
                ...(index < 8 ? { windSpeed: index < 5 ? 12.4 : 12.6 } : {}),
            })),
        };
        expect(weatherForecast({ weather: WeatherType.Real }, NOW, windy).map((cell) => cell.windSpeed)).toEqual([
            12,
            13,
            undefined,
        ]);
        expect(weatherForecast({ weather: WeatherType.Snow }, NOW, windy).map((cell) => cell.windSpeed)).toEqual([
            12,
            13,
            undefined,
        ]);
        expect(weatherForecast({ weather: WeatherType.Real }, NOW, windy)[2]).not.toHaveProperty("windSpeed");
        expect(weatherForecast({ weather: WeatherType.Real }, NOW, { status: "unavailable" })[0]).not.toHaveProperty(
            "windSpeed",
        );
    });
    it("gives where the real wind comes from with its speed only, and never for a calm rounded to 0 km/h", () => {
        const slot = (index: number, wind: { windSpeed?: number; windFrom?: number }) => ({
            at: NOW + (index - 1) * 15 * 60 * 1000,
            weather: WeatherType.Clear as const,
            temperature: 5,
            ...wind,
        });
        const windy = {
            status: "known" as const,
            slots: Array.from({ length: 24 }, (_, index) =>
                index < 5
                    ? slot(index, { windSpeed: 22, windFrom: 315 })
                    : index < 8
                      ? slot(index, { windFrom: 90 })
                      : slot(index, { windSpeed: 0.4, windFrom: 180 }),
            ),
        };
        const cells = weatherForecast({ weather: WeatherType.Real }, NOW, windy);
        expect(cells.map((cell) => cell.windFrom)).toEqual([315, undefined, undefined]);
        expect(cells[1]).not.toHaveProperty("windFrom");
        expect(cells[2]).toHaveProperty("windSpeed", 0);
        expect(cells[2]).not.toHaveProperty("windFrom");
        expect(weatherForecast({ weather: WeatherType.Rain }, NOW, windy)[0].windFrom).toBe(315);
    });
});
