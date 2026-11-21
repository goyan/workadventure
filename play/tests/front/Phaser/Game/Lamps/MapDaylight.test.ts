import { WeatherType } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import type { RealForecastState } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";

// The city this player follows on their clock ("Daytime somewhere"), and the weather known there.
interface Chosen {
    place: WeatherLocation | undefined;
    state: RealForecastState;
}
const chosen = vi.hoisted((): { now: Chosen } => ({ now: { place: undefined, state: { status: "pending" } } }));
vi.mock("../../../../../src/front/Phaser/Game/Weather/ChosenPlaceWeather", () => ({
    chosenWeatherNow: () => chosen.now,
}));
vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getAuthToken: () => "token" },
}));
vi.mock("../../../../../src/front/Enum/ComputedConst", () => ({ ABSOLUTE_PUSHER_URL: "http://pusher.test/" }));
vi.mock("../../../../../src/front/Stores/NightStore", async () => {
    const { writable } = await import("svelte/store");
    return { nightDateStore: writable<Date | undefined>(undefined) };
});

import { mapDaylightAt } from "../../../../../src/front/Phaser/Game/Lamps/MapDaylight";

const MINUTE = 60_000;
// Paris, 21 November 2026 at noon: the sun is more than 15° high.
const NOON = new Date("2026-11-21T11:00:00Z");
const tokyo: WeatherLocation = { name: "Tokyo", latitude: 35.68, longitude: 139.69, timezone: "Asia/Tokyo" };

/** A storm all around NOON, known at the city chosen. */
function storm(): RealForecastState {
    return {
        status: "known",
        slots: Array.from({ length: 28 }, (_, index) => ({
            at: NOON.getTime() - 60 * MINUTE + index * 15 * MINUTE,
            weather: WeatherType.Storm,
            temperature: 12,
        })),
    };
}

describe("mapDaylightAt", () => {
    it("reads the weather of the map, not the one of the city a player follows on their clock", () => {
        const map = { weather: WeatherType.Clear };
        chosen.now = { place: undefined, state: { status: "pending" } };
        const onServerTime = mapDaylightAt(map, NOON);
        chosen.now = { place: tokyo, state: storm() };
        expect(mapDaylightAt(map, NOON)).toBe(onServerTime);
        expect(onServerTime).toBe(1);
    });
});
