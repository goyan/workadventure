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
import { mapGroundWetness } from "../../../../../src/front/Phaser/Game/Weather/Puddles";

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
            rainSince: 0,
        });
        expect(realWeatherStateAt(forecast, new Date(2 * SLOT))).toEqual({
            status: "known",
            weather: WeatherType.Snow,
            since: 2 * SLOT,
            // The rain just stopped: its puddles dry from then.
            rainDryFrom: 2 * SLOT,
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

describe("clouds of the real weather", () => {
    it("fades the clouds of a quarter hour in over three minutes, from those of the one before", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.2 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.8 },
        ];
        const state = (offset: number) => realWeatherStateAt({ status: "known", slots }, new Date(SLOT + offset));
        expect(state(0)).toMatchObject({ cloudiness: 0.2 });
        expect(state(90_000)).toMatchObject({ cloudiness: 0.5 });
        expect(state(3 * 60_000)).toMatchObject({ cloudiness: 0.8 });
        expect(withRealWeather({ weather: WeatherType.Real }, state(3 * 60_000))).toMatchObject({
            weather: WeatherType.Clear,
            cloudiness: 0.8,
        });
    });

    it("keeps the cover of a rain for its grey clouds, never as white clouds", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.4 },
            { at: SLOT, weather: WeatherType.Rain, temperature: 5, cloudiness: 0.95 },
            { at: 2 * SLOT, weather: WeatherType.Clear, temperature: 5, cloudiness: 0.6 },
        ];
        const state = (time: number) => realWeatherStateAt({ status: "known", slots }, new Date(time));
        const raining = state(SLOT + 3 * 60_000);
        expect(raining).toMatchObject({ weather: WeatherType.Rain, cloudCover: 0.95 });
        expect(raining).not.toHaveProperty("cloudiness");
        // The white clouds of the clear sky before fade out over the first minutes of the rain.
        expect(state(SLOT + 90_000)).toMatchObject({ cloudiness: 0.2 });
        // After the rain, the white clouds fade in from none.
        expect(state(2 * SLOT + 90_000)).toMatchObject({ cloudiness: 0.3 });
        expect(state(2 * SLOT + 90_000)).not.toHaveProperty("cloudCover");
        expect(withRealWeather({ weather: WeatherType.Real }, raining)).toMatchObject({ cloudCover: 0.95 });
    });
});

describe("wind of the real weather", () => {
    it("turns the wind of a quarter hour over ten minutes from the one before, the shorter way round", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Clear, temperature: 5, windFrom: 350 },
            { at: SLOT, weather: WeatherType.Rain, temperature: 5, windFrom: 20 },
        ];
        const state = (offset: number) => realWeatherStateAt({ status: "known", slots }, new Date(SLOT + offset));
        expect(state(0)).toMatchObject({ windFrom: 350 });
        expect(state(5 * 60_000)).toMatchObject({ windFrom: 5 });
        expect(state(10 * 60_000)).toMatchObject({ windFrom: 20 });
        expect(withRealWeather({ weather: WeatherType.Real }, state(10 * 60_000))).toMatchObject({ windFrom: 20 });
    });

    it("has no wind when Open-Meteo gave none", () => {
        const slots: RealWeatherSlot[] = [{ at: 0, weather: WeatherType.Clear, temperature: 5 }];
        expect(realWeatherStateAt({ status: "known", slots }, new Date(1))).not.toHaveProperty("windFrom");
    });

    it("changes the wind speed over ten minutes from that of the quarter hour before", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Clear, temperature: 5, windSpeed: 10 },
            { at: SLOT, weather: WeatherType.Clear, temperature: 5, windSpeed: 30 },
        ];
        const state = (offset: number) => realWeatherStateAt({ status: "known", slots }, new Date(SLOT + offset));
        expect(state(0)).toMatchObject({ windSpeed: 10 });
        expect(state(5 * 60_000)).toMatchObject({ windSpeed: 20 });
        expect(state(10 * 60_000)).toMatchObject({ windSpeed: 30 });
        expect(withRealWeather({ weather: WeatherType.Real }, state(10 * 60_000))).toMatchObject({ windSpeed: 30 });
    });

    it("keeps one wet episode through rain and storm, and dries from the end of the last rain", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Rain, temperature: 5 },
            { at: SLOT, weather: WeatherType.Storm, temperature: 5 },
            { at: 2 * SLOT, weather: WeatherType.Rain, temperature: 5 },
            { at: 3 * SLOT, weather: WeatherType.Clear, temperature: 5 },
            { at: 4 * SLOT, weather: WeatherType.Fog, temperature: 5 },
            { at: 5 * SLOT, weather: WeatherType.Fog, temperature: 5 },
            { at: 6 * SLOT, weather: WeatherType.Fog, temperature: 5 },
        ];
        const state = (time: number) => realWeatherStateAt({ status: "known", slots }, new Date(time));
        // The storm and the rain after it began with the first rain.
        expect(state(SLOT + 1)).toMatchObject({ weather: WeatherType.Storm, since: SLOT, rainSince: 0 });
        expect(state(2 * SLOT + 1)).toMatchObject({ weather: WeatherType.Rain, since: 2 * SLOT, rainSince: 0 });
        // The ground dries from the end of the rain, also once the clear spell has turned to fog.
        expect(state(3 * SLOT + 1)).toMatchObject({ rainDryFrom: 3 * SLOT });
        expect(state(4 * SLOT + 1)).toMatchObject({ rainDryFrom: 3 * SLOT });
        expect(state(6 * SLOT + 1)).not.toHaveProperty("rainDryFrom");
        const shown = withRealWeather({ weather: WeatherType.Real }, state(2 * SLOT + 1));
        expect(shown).toMatchObject({ rainSince: 0 });
        expect(mapGroundWetness(shown, new Date(2 * SLOT + 1))).toBe(1);
    });

    it("lets a rain going on get harder over ten minutes, a starting one fall at once", () => {
        const slots: RealWeatherSlot[] = [
            { at: 0, weather: WeatherType.Clear, temperature: 5 },
            { at: SLOT, weather: WeatherType.Rain, temperature: 5, rainRate: 1 },
            { at: 2 * SLOT, weather: WeatherType.Rain, temperature: 5, rainRate: 9 },
            { at: 3 * SLOT, weather: WeatherType.Clear, temperature: 5 },
        ];
        const state = (time: number) => realWeatherStateAt({ status: "known", slots }, new Date(time));
        expect(state(SLOT)).toMatchObject({ rainRate: 1 });
        expect(state(2 * SLOT)).toMatchObject({ rainRate: 1 });
        expect(state(2 * SLOT + 5 * 60_000)).toMatchObject({ rainRate: 5 });
        expect(state(2 * SLOT + 10 * 60_000)).toMatchObject({ rainRate: 9 });
        expect(state(3 * SLOT + 60_000)).not.toHaveProperty("rainRate");
        expect(withRealWeather({ weather: WeatherType.Real }, state(2 * SLOT + 10 * 60_000))).toMatchObject({
            rainRate: 9,
        });
    });
});
