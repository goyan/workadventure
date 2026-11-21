import { WeatherType } from "@workadventure/map-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealForecastState } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";

interface Chosen {
    now: { place: { name: string; latitude: number; longitude: number } | undefined; state: RealForecastState };
}
const chosen = vi.hoisted((): Chosen => ({ now: { place: undefined, state: { status: "pending" } } }));
const map = vi.hoisted((): { timeline: RealForecastState; asked: number } => ({
    timeline: { status: "pending" },
    asked: 0,
}));

vi.mock("../../../../../src/front/Phaser/Game/Weather/ChosenPlaceWeather", () => ({
    chosenWeatherNow: () => chosen.now,
}));
vi.mock("../../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({
    shownPlaceTimeline: () => {
        map.asked++;
        return map.timeline;
    },
}));

const { airAt, precipitationAirNow, roomPrecipitationAir } =
    await import("../../../../../src/front/Phaser/Game/Weather/PrecipitationAir");
const { fireConditionsStore } = await import("../../../../../src/front/Stores/FireConditionsStore");

const QUARTER = 15 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 10, 12);
const timeline = (temperature: number | null, humidity?: number): RealForecastState => ({
    status: "known",
    slots: [
        { at: NOW, weather: WeatherType.Rain, temperature, ...(humidity === undefined ? {} : { humidity }) },
        { at: NOW + QUARTER, weather: WeatherType.Rain, temperature: 9, humidity: 50 },
    ],
});
const thresholds = { thresholdTemperature: 30, thresholdHumidity: 30, thresholdWindSpeed: 30 };
const byHand = { manual: true, temperature: -4, humidity: 70, windSpeed: 0, windFrom: 0, ...thresholds };
const lyon = { name: "Lyon", latitude: 45.75, longitude: 4.85 };
/** A new settings object and a new second each time: nothing is read from the memo. */
let second = 0;
const read = () => precipitationAirNow({ weather: WeatherType.Rain }, new Date(NOW + 1000 * ++second));

beforeEach(() => {
    chosen.now = { place: undefined, state: { status: "pending" } };
    map.timeline = { status: "pending" };
    fireConditionsStore.set(undefined);
});
afterEach(() => fireConditionsStore.set(undefined));

describe("airAt", () => {
    it("reads the temperature and the humidity of the quarter hour under way, when both are known", () => {
        expect(airAt(timeline(-1, 85), NOW + 1)).toEqual({ temperature: -1, humidity: 85 });
        expect(airAt(timeline(-1, 85), NOW + QUARTER)).toEqual({ temperature: 9, humidity: 50 });
        expect(airAt(timeline(-1), NOW + 1)).toBeUndefined();
        expect(airAt(timeline(null, 85), NOW + 1)).toBeUndefined();
        expect(airAt(timeline(-1, 85), NOW - 1)).toBeUndefined();
        expect(airAt({ status: "pending" }, NOW)).toBeUndefined();
        expect(airAt({ status: "unavailable" }, NOW)).toBeUndefined();
    });
});

describe("precipitationAirNow", () => {
    it("is not known without the game clock, nor before the place of the map answered: it then rains", () => {
        expect(precipitationAirNow({ weather: WeatherType.Rain }, undefined)).toBeUndefined();
        expect(read()).toBeUndefined();
        fireConditionsStore.set({ ...byHand, manual: false, temperature: 20, humidity: 60 });
        expect(read()).toBeUndefined();
    });

    it("is the real air at the place of the map, whatever weather the map shows", () => {
        map.timeline = timeline(-1, 85);
        expect(read()).toEqual({ temperature: -1, humidity: 85 });
        // The mild conditions the room keeps for its fire on such a map say nothing of the air.
        fireConditionsStore.set({ ...byHand, manual: false, temperature: 20, humidity: 60 });
        expect(read()).toEqual({ temperature: -1, humidity: 85 });
    });

    it("is the heat and the humidity set by hand in the room, over the real air of the map", () => {
        map.timeline = timeline(12, 80);
        fireConditionsStore.set(byHand);
        expect(read()).toEqual({ temperature: -4, humidity: 70 });
    });

    it("is the air of the city this player follows, over everything: their weather is theirs alone", () => {
        map.timeline = timeline(12, 80);
        fireConditionsStore.set(byHand);
        chosen.now = { place: lyon, state: timeline(1, 99) };
        expect(read()).toEqual({ temperature: 1, humidity: 99 });
        // Not known yet for that city: a rain, not the air of the map.
        chosen.now = { place: lyon, state: { status: "pending" } };
        expect(read()).toBeUndefined();
    });

    it("has an air of the room that ignores the city this player follows: a catastrophe is the room's", () => {
        const room = () => roomPrecipitationAir({ weather: WeatherType.Rain }, new Date(NOW));
        chosen.now = { place: lyon, state: timeline(20, 50) };
        map.timeline = timeline(12, 80);
        expect(room()).toEqual({ temperature: 12, humidity: 80 });
        fireConditionsStore.set(byHand);
        expect(room()).toEqual({ temperature: -4, humidity: 70 });
        expect(roomPrecipitationAir({ weather: WeatherType.Rain }, undefined)).toBeUndefined();
    });

    it("is read once a second of the game clock for the same map settings", () => {
        map.timeline = timeline(-1, 85);
        const settings = { weather: WeatherType.Rain };
        const before = map.asked;
        const date = new Date(NOW + 500_000);
        const first = precipitationAirNow(settings, date);
        expect(precipitationAirNow(settings, new Date(date.getTime() + 400))).toBe(first);
        expect(map.asked).toBe(before + 1);
        precipitationAirNow(settings, new Date(date.getTime() + 1000));
        expect(map.asked).toBe(before + 2);
    });
});
