import { hoarFrost, WeatherType } from "@workadventure/map-editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealForecastState } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";

interface Chosen {
    now: { place: { name: string; latitude: number; longitude: number } | undefined; state: RealForecastState };
}
const chosen = vi.hoisted((): Chosen => ({ now: { place: undefined, state: { status: "pending" } } }));
const map = vi.hoisted((): { timeline: RealForecastState } => ({ timeline: { status: "pending" } }));

vi.mock("../../../../../src/front/Phaser/Game/Weather/ChosenPlaceWeather", () => ({
    chosenWeatherNow: () => chosen.now,
}));
vi.mock("../../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({
    shownPlaceTimeline: () => map.timeline,
    shownWeatherSettings: () => ({ weather: WeatherType.Clear }),
    // What the frost went by before it read the humidity: the temperature of the banner.
    shownWeatherForecast: () => [
        {
            temperature:
                map.timeline.status === "known" ? (map.timeline.slots[0]?.temperature ?? undefined) : undefined,
        },
    ],
}));

const { nightDateStore } = await import("../../../../../src/front/Stores/NightStore");
const { waterCycleNow } = await import("../../../../../src/front/Phaser/Game/Weather/Frost");
const { fireConditionsStore } = await import("../../../../../src/front/Stores/FireConditionsStore");

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
const lyon = { name: "Lyon", latitude: 45.75, longitude: 4.85 };

/**
 * The frost of the ground once it reached the weather of now: a minute of the game clock later each time, long enough
 * for the frost to go all the way (FROST_RATE), within the same quarter hour of the timelines.
 */
let minute = 0;
function frostNow(): number {
    nightDateStore.set(new Date(NOW + 61_000 * ++minute));
    return waterCycleNow({ weather: WeatherType.Clear }).frost;
}

beforeEach(() => {
    chosen.now = { place: undefined, state: { status: "pending" } };
    map.timeline = { status: "pending" };
    fireConditionsStore.set(undefined);
});

describe("the frost of the ground", () => {
    it("goes by the damp air of the place of the map, and none in its dry air", () => {
        map.timeline = timeline(-2, 95, 0);
        expect(frostNow()).toBeCloseTo(hoarFrost({ temperature: -2, humidity: 95, windSpeed: 0 }));
        expect(frostNow()).toBeGreaterThan(0.5);
        map.timeline = timeline(-2, 40, 0);
        expect(frostNow()).toBe(0);
    });

    it("is held back by the wind of the place", () => {
        map.timeline = timeline(-2, 95, 40);
        expect(frostNow()).toBe(0);
    });

    it("is none while the humidity of the air is not known, however cold", () => {
        map.timeline = timeline(-8);
        expect(frostNow()).toBe(0);
    });

    it("goes by the air set by hand in the room over the real one of the map", () => {
        map.timeline = timeline(-2, 95, 0);
        fireConditionsStore.set({
            manual: true,
            temperature: -2,
            humidity: 40,
            windSpeed: 0,
            windFrom: 0,
            ...thresholds,
        });
        expect(frostNow()).toBe(0);
    });

    it("goes by the air of the city this player follows, over the room and the map", () => {
        map.timeline = timeline(8, 90, 0);
        fireConditionsStore.set({
            manual: true,
            temperature: 8,
            humidity: 90,
            windSpeed: 0,
            windFrom: 0,
            ...thresholds,
        });
        chosen.now = { place: lyon, state: timeline(-2, 95, 0) };
        expect(frostNow()).toBeGreaterThan(0.5);
        // The city not known yet: no frost, the map's is not shown in its place.
        chosen.now = { place: lyon, state: { status: "pending" } };
        map.timeline = timeline(-2, 95, 0);
        expect(frostNow()).toBe(0);
    });
});
