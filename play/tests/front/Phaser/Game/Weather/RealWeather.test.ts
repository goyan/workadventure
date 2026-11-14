import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    realWeatherStateAt,
    withRealWeather,
    withWeatherPreview,
} from "../../../../../src/front/Phaser/Game/Weather/RealWeather";
import { fogStrength } from "../../../../../src/front/Phaser/Game/Weather/WeatherFrame";
import { snowCoverage } from "../../../../../src/front/Phaser/Game/Weather/SnowCover";

const auto = { frequency: "calm" as const, include: [WeatherType.Rain] };
const SLOT = 15 * 60 * 1000;

describe("withRealWeather", () => {
    it("leaves every other mode as configured", () => {
        const settings = { weather: WeatherType.Automatic, weatherStartedAt: 5, weatherAuto: auto };
        expect(withRealWeather(settings, { status: "known", weather: WeatherType.Fog, since: 9 })).toBe(settings);
        expect(withRealWeather(undefined, { status: "unavailable" })).toBeUndefined();
    });

    it("shows the observed weather, which began when the server first saw it", () => {
        expect(
            withRealWeather(
                { weather: WeatherType.Real, weatherStartedAt: 5, weatherAuto: auto },
                { status: "known", weather: WeatherType.Fog, since: 9 },
            ),
        ).toEqual({ weather: WeatherType.Fog, weatherStartedAt: 9, weatherAuto: auto });
    });

    it("stays clear until the first answer, so no drawn weather flashes on load", () => {
        expect(withRealWeather({ weather: WeatherType.Real }, { status: "pending" })).toEqual({
            weather: WeatherType.Clear,
        });
    });

    it("falls back to the seasonal draw with the map's Auto settings when the service is down", () => {
        expect(withRealWeather({ weather: WeatherType.Real, weatherAuto: auto }, { status: "unavailable" })).toEqual({
            weather: WeatherType.Automatic,
            weatherAuto: auto,
        });
    });
});

describe("a real weather fades in from the moment it began", () => {
    const since = Date.UTC(2026, 10, 14, 9, 0);

    it("thickens a fog over three minutes", () => {
        expect(fogStrength(WeatherType.Fog, new Date(since), undefined, since)).toBe(0);
        expect(fogStrength(WeatherType.Fog, new Date(since + 90_000), undefined, since)).toBeCloseTo(0.5);
        expect(fogStrength(WeatherType.Fog, new Date(since + 10 * 60_000), undefined, since)).toBe(1);
        // A fixed fog without a start keeps its full thickness, as before.
        expect(fogStrength(WeatherType.Fog, new Date(since))).toBe(1);
    });

    it("builds up snow on the ground over ten minutes", () => {
        expect(snowCoverage(WeatherType.Snow, since + 5 * 60_000, since)).toBeCloseTo(0.5);
    });
});

describe("withWeatherPreview", () => {
    const lyon = { name: "Lyon, France", latitude: 45.74906, longitude: 4.84789 };

    it("shows the map as saved without a preview", () => {
        const settings = { weather: WeatherType.Rain, weatherStartedAt: 5 };
        expect(withWeatherPreview(settings, undefined)).toBe(settings);
    });

    it("shows the tile being tried at once, without the start of the saved episode", () => {
        expect(
            withWeatherPreview(
                { weather: WeatherType.Clear, weatherStartedAt: 5, weatherLocation: lyon },
                { weather: WeatherType.Storm, weatherAuto: auto },
            ),
        ).toEqual({ weather: WeatherType.Storm, weatherAuto: auto, weatherLocation: lyon });
    });

    it("tries a place before it is saved", () => {
        expect(
            withWeatherPreview({ weather: WeatherType.Clear }, { weather: WeatherType.Real, weatherLocation: lyon }),
        ).toEqual({ weather: WeatherType.Real, weatherLocation: lyon });
    });
});

describe("realWeatherStateAt", () => {
    const slots = [
        { at: 0, weather: WeatherType.Rain, temperature: 3 },
        { at: SLOT, weather: WeatherType.Rain, temperature: 3 },
        { at: 2 * SLOT, weather: WeatherType.Snow, temperature: -1 },
    ] as const;

    it("reads the weather of the timeline at the game date, dated from the start of its run", () => {
        const forecast = { status: "known" as const, slots: [...slots] };
        expect(realWeatherStateAt(forecast, new Date(SLOT + 1))).toEqual({
            status: "known",
            weather: WeatherType.Rain,
            since: 0,
        });
        expect(realWeatherStateAt(forecast, new Date(2 * SLOT))).toEqual({
            status: "known",
            weather: WeatherType.Snow,
            since: 2 * SLOT,
        });
    });

    it("is pending before the first answer or the game date, unavailable out of the timeline", () => {
        const forecast = { status: "known" as const, slots: [...slots] };
        expect(realWeatherStateAt({ status: "pending" }, new Date(0))).toEqual({ status: "pending" });
        expect(realWeatherStateAt(forecast, undefined)).toEqual({ status: "pending" });
        expect(realWeatherStateAt({ status: "unavailable" }, new Date(0))).toEqual({ status: "unavailable" });
        expect(realWeatherStateAt(forecast, new Date(3 * SLOT))).toEqual({ status: "unavailable" });
        expect(realWeatherStateAt({ status: "known", slots: [] }, new Date(0))).toEqual({ status: "unavailable" });
    });
});
