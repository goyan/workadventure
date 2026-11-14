import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { RealWeatherReport, weatherFromWmoCode } from "../../src/common/RealWeather";

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

describe("RealWeatherReport", () => {
    it("accepts a known weather with the time it began, or no weather at all", () => {
        expect(RealWeatherReport.parse({ weather: "fog", since: 1000 })).toEqual({ weather: "fog", since: 1000 });
        expect(RealWeatherReport.parse({ weather: null, since: null })).toEqual({ weather: null, since: null });
    });

    it("refuses the map modes, which are not observed weathers", () => {
        expect(RealWeatherReport.safeParse({ weather: "automatic", since: 1 }).success).toBe(false);
        expect(RealWeatherReport.safeParse({ weather: "real", since: 1 }).success).toBe(false);
    });
});
