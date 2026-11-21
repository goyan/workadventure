import { snowShareOf, WeatherType } from "@workadventure/map-editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealForecastState } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";

interface Place {
    name: string;
    longName?: string;
    latitude: number;
    longitude: number;
}
interface Chosen {
    now: { place: Place | undefined; state: RealForecastState };
}
const chosen = vi.hoisted((): Chosen => ({ now: { place: undefined, state: { status: "pending" } } }));
const map = vi.hoisted(
    (): { timeline: RealForecastState; weather: string; trial: boolean; place: Place | undefined } => ({
        timeline: { status: "pending" },
        weather: "clear",
        trial: false,
        place: undefined,
    }),
);

vi.mock("../../../../../src/front/Phaser/Game/Weather/ChosenPlaceWeather", () => ({
    chosenWeatherNow: () => chosen.now,
}));
vi.mock("../../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({
    shownPlaceTimeline: () => map.timeline,
    shownMapPlace: () => map.place,
    showsChosenPlaceWeather: () => chosen.now.place !== undefined && !map.trial,
    // The weather drawn: that of the city followed (clear here) unless the map's is tried; the map's own.
    shownWeatherSettings: () => ({ weather: chosen.now.place && !map.trial ? "clear" : map.weather }),
    mapWeatherSettings: () => ({ weather: map.weather }),
}));

const { nightDateStore } = await import("../../../../../src/front/Stores/NightStore");
const { fireConditionsStore } = await import("../../../../../src/front/Stores/FireConditionsStore");
const { frostAirNow, frostOf, mapFrostAirNow } = await import("../../../../../src/front/Phaser/Game/Weather/Frost");
const { precipitationAirNow, roomPrecipitationAir } =
    await import("../../../../../src/front/Phaser/Game/Weather/PrecipitationAir");
const { weatherBoardNow } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherBoardNow");

const QUARTER = 15 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 10, 6);
const timeline = (temperature: number, humidity?: number, windSpeed?: number): RealForecastState => ({
    status: "known",
    slots: [
        {
            at: NOW,
            weather: WeatherType.Clear,
            temperature,
            ...(humidity === undefined ? {} : { humidity }),
            ...(windSpeed === undefined ? {} : { windSpeed }),
        },
        { at: NOW + QUARTER, weather: WeatherType.Clear, temperature: 9, humidity: 50 },
    ],
});
const thresholds = { thresholdTemperature: 30, thresholdHumidity: 30, thresholdWindSpeed: 30 };
const auckland = { name: "Auckland, Nouvelle-Zélande", latitude: -36.85, longitude: 174.76 };
const settings = { weather: WeatherType.Clear };

// A second of the game clock later each time: the readers keep what they read for a second.
let second = 0;
function now(): Date {
    const date = new Date(NOW + 1000 * ++second);
    nightDateStore.set(date);
    return date;
}
const told = (map_: number, here: number, version = 1) => ({
    version: () => version,
    meanSnowCover: () => map_,
    snowCoverAt: () => here,
});

beforeEach(() => {
    chosen.now = { place: undefined, state: { status: "pending" } };
    map.timeline = { status: "pending" };
    map.weather = "clear";
    map.trial = false;
    map.place = undefined;
    fireConditionsStore.set(undefined);
});

describe("weatherBoardNow", () => {
    it("reads the air of the map for a player who follows the server", () => {
        map.timeline = timeline(-2, 95, 3);
        map.place = { name: "Oslo, Norvège", latitude: 59.9, longitude: 10.7 };
        const board = weatherBoardNow(settings, now(), undefined, undefined);
        expect(board.follows).toBe("server");
        expect(board.mapAir).toEqual({ temperature: -2, humidity: 95, windSpeed: 3, byHand: false, place: "Oslo" });
        expect(board.ownAir).toBeUndefined();
        expect(board.frost).toMatchObject({ air: "map", temperature: -2, reason: "frost" });
        expect(board.precipitation).toMatchObject({ air: "map", form: "snow" });
    });

    it("reads the conditions set by hand in the room first, for the map", () => {
        map.timeline = timeline(15, 60, 5);
        fireConditionsStore.set({
            manual: true,
            temperature: -4,
            humidity: 90,
            windSpeed: 2,
            windFrom: 0,
            ...thresholds,
        });
        const board = weatherBoardNow(settings, now(), undefined, undefined);
        expect(board.mapAir).toEqual({ temperature: -4, humidity: 90, windSpeed: 2, byHand: true });
        expect(board.downpour).toMatchObject({ form: "snow", temperature: -4 });
        expect(board.soil).toMatchObject({ reason: "frozen" });
    });

    it("reads the case that asked for the board: a warm map, a cold dry city followed", () => {
        map.timeline = timeline(24, 55, 12);
        chosen.now = { place: auckland, state: timeline(-3, 45, 40) };
        const date = now();
        const board = weatherBoardNow(settings, date, undefined, undefined);
        expect(board.follows).toBe("city");
        expect(board.city).toBe("Auckland");
        expect(board.ownAir).toEqual({
            temperature: -3,
            humidity: 45,
            windSpeed: 40,
            byHand: false,
            place: "Auckland",
        });
        expect(board.frost).toMatchObject({ air: "own", audience: "you", frost: 0, reason: "dry" });
        expect(board.downpour).toMatchObject({ air: "map", audience: "everyone", form: "rain", temperature: 24 });
        // Never another value than what the game draws from the same readers.
        expect(board.precipitation.share).toBe(snowShareOf(precipitationAirNow(settings, date)));
        expect(board.precipitation.share).toBe(1);
        expect(board.downpour.share).toBe(snowShareOf(roomPrecipitationAir(settings, date)));
        expect(board.frost.frost).toBe(frostOf(frostAirNow(settings, date)));
        // ...and the map's side is what a player who follows the server draws.
        expect(board.frost.onMap?.frost).toBe(frostOf(mapFrostAirNow(settings, date)));
        expect(board.frost.onMap).toMatchObject({ temperature: 24, windSpeed: 12, reason: "groundWarm" });
        expect(board.precipitation).toMatchObject({ form: "snow", differs: true });
        expect(board.precipitation.onMap).toMatchObject({ form: "rain", temperature: 24 });
        expect(board.ice).toMatchObject({ stage: "shallows", differs: true });
    });

    it("names a point far from any city by its long name: its coordinates, the nearest city and how far", () => {
        map.timeline = timeline(14, 84, 8);
        chosen.now = {
            place: {
                name: "72° S 170° E",
                longName: "72° S 170° E · Auckland 4,000 km away",
                latitude: -72.4,
                longitude: 170.2,
            },
            state: timeline(-34, 69, 15),
        };
        const board = weatherBoardNow(settings, now(), undefined, undefined);
        expect(board.city).toBe("72° S 170° E · Auckland 4,000 km away");
        expect(board.ownAir?.place).toBe("72° S 170° E · Auckland 4,000 km away");
    });

    it("says whether something falls for the player, and on the map", () => {
        map.timeline = timeline(-3, 80, 0);
        map.weather = "rain";
        expect(weatherBoardNow(settings, now(), told(0, 0), undefined)).toMatchObject({
            precipitation: { falling: true },
            snow: { trend: "building" },
        });
        // Under their own clear sky nothing falls for them, while it still snows on the map.
        chosen.now = { place: auckland, state: timeline(20, 50, 0) };
        expect(weatherBoardNow(settings, now(), told(0, 0), undefined)).toMatchObject({
            precipitation: { falling: false, air: "own" },
            snow: { trend: "building", shown: false },
        });
    });

    it("reads the snow the server told, and nothing before it told any", () => {
        map.timeline = timeline(10, 50, 0);
        fireConditionsStore.set({
            manual: false,
            temperature: 20,
            humidity: 60,
            windSpeed: 10,
            windFrom: 0,
            ...thresholds,
        });
        expect(weatherBoardNow(settings, now(), told(0.5, 1, 0), { x: 0, y: 0 }).snow.known).toBe(false);
        const { snow } = weatherBoardNow(settings, now(), told(0.5, 1), { x: 0, y: 0 });
        expect(snow).toMatchObject({ known: true, mapCover: 0.5, hereCover: 1, trend: "melting", temperature: 10 });
    });

    it("keeps the precipitation on the map while a weather is tried in its settings", () => {
        map.timeline = timeline(12, 70, 5);
        map.trial = true;
        chosen.now = { place: auckland, state: timeline(-3, 45, 40) };
        const board = weatherBoardNow(settings, now(), undefined, undefined);
        expect(board.follows).toBe("trial");
        expect(board.precipitation).toMatchObject({ air: "map", form: "rain" });
    });
});
