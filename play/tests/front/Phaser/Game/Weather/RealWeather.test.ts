import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { withRealWeather } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";
import { fogStrength } from "../../../../../src/front/Phaser/Game/Weather/WeatherFrame";
import { snowCoverage } from "../../../../../src/front/Phaser/Game/Weather/SnowCover";

const auto = { frequency: "calm" as const, include: [WeatherType.Rain] };

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
