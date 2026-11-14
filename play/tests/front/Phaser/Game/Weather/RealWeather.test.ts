import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    realWeatherStateAt,
    withRealWeather,
    withWeatherPreview,
} from "../../../../../src/front/Phaser/Game/Weather/RealWeather";
import type { RealWeatherSlot } from "../../../../../src/common/RealWeather";
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

describe("a real weather fades out when its run ends", () => {
    const since = Date.UTC(2026, 10, 14, 9, 0);
    const until = since + 4 * SLOT;

    it("thins a fog over the last three minutes of its run", () => {
        expect(fogStrength(WeatherType.Fog, new Date(until - 90_000), undefined, since, until)).toBeCloseTo(0.5);
        expect(fogStrength(WeatherType.Fog, new Date(until - 10 * 60_000), undefined, since, until)).toBe(1);
    });

    it("melts the snow on the ground over ten minutes after it stopped", () => {
        expect(snowCoverage(WeatherType.Clear, since + 5 * 60_000, undefined, undefined, since)).toBeCloseTo(0.5);
        expect(snowCoverage(WeatherType.Rain, since + 10 * 60_000, undefined, undefined, since)).toBe(0);
        expect(snowCoverage(WeatherType.Clear, since + 5 * 60_000)).toBe(0);
    });

    it("gives the end of the run and the end of a snow to the map settings", () => {
        const slots: RealWeatherSlot[] = [
            { at: since - SLOT, weather: WeatherType.Snow, temperature: -1 },
            { at: since, weather: WeatherType.Fog, temperature: 0 },
            { at: since + SLOT, weather: WeatherType.Clear, temperature: 1 },
        ];
        const state = realWeatherStateAt({ status: "known", slots }, new Date(since + 1));
        expect(state).toEqual({
            status: "known",
            weather: WeatherType.Fog,
            since,
            until: since + SLOT,
            snowMeltFrom: since,
        });
        expect(withRealWeather({ weather: WeatherType.Real }, state)).toEqual({
            weather: WeatherType.Fog,
            weatherStartedAt: since,
            weatherEndsAt: since + SLOT,
            snowMeltFrom: since,
        });
        expect(realWeatherStateAt({ status: "known", slots }, new Date(since - 1))).toEqual({
            status: "known",
            weather: WeatherType.Snow,
            since: since - SLOT,
            until: since,
            snowMeltFrom: undefined,
        });
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

    it("tries going back to the default place, unlike a preview that says nothing of the place", () => {
        expect(
            withWeatherPreview(
                { weather: WeatherType.Real, weatherLocation: lyon },
                { weather: WeatherType.Real, weatherLocation: undefined },
            ),
        ).toEqual({ weather: WeatherType.Real });
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
            until: 2 * SLOT,
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
