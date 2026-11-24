import { describe, expect, it } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import {
    followPlaceUpdate,
    mapLocationOf,
    placeToMapState,
    realConditionsMessage,
    revertUpdate,
    sameWeatherPlace,
} from "../../../../../src/front/Phaser/Game/Weather/PlaceToMap";
import type { WorldPlace } from "../../../../../src/front/Phaser/Game/Night/WorldDaylight";
import type { RealForecastState } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";

const LILLE = { name: "Lille, Hauts-de-France, France", latitude: 50.63, longitude: 3.06, timezone: "Europe/Paris" };
/** The point of the capture that asked for the button: far from any city, named after Hong Kong. */
const POINT: WorldPlace = {
    name: "Hong Kong 770 km",
    longName: "24° N 122° E · Hong Kong à 770 km",
    coordinates: "24° N 122° E",
    latitude: 24.2,
    longitude: 121.9,
    timezone: "Asia/Taipei",
};
const KNOWN: RealForecastState = { status: "known", slots: [{ at: 0, weather: WeatherType.Rain, temperature: 7 }] };

describe("placeToMapState", () => {
    const base = { canEdit: true, place: POINT, mapPlace: LILLE, mapWeather: WeatherType.Automatic, data: KNOWN };

    it("is ready for an editor whose place has a real weather the map does not follow", () => {
        expect(placeToMapState(base)).toBe("ready");
    });

    it("says the map already follows the place once it is there in real weather, for everyone", () => {
        const there = { ...base, mapPlace: mapLocationOf(POINT), mapWeather: WeatherType.Real };
        expect(placeToMapState(there)).toBe("already");
        expect(placeToMapState({ ...there, canEdit: false })).toBe("already");
        // The same place in an automatic weather is not followed: its real weather is not.
        expect(placeToMapState({ ...there, mapWeather: WeatherType.Automatic })).toBe("ready");
    });

    it("tells a player who may not edit the map, and waits for the weather of the place", () => {
        expect(placeToMapState({ ...base, canEdit: false })).toBe("noRight");
        expect(placeToMapState({ ...base, data: { status: "pending" } })).toBe("pending");
        expect(placeToMapState({ ...base, data: { status: "unavailable" } })).toBe("noData");
        expect(placeToMapState({ ...base, data: { status: "known", slots: [] } })).toBe("noData");
    });

    it("takes a map without a place for Paris", () => {
        const paris: WorldPlace = { name: "Paris", latitude: 48.86, longitude: 2.35 };
        expect(placeToMapState({ ...base, place: paris, mapPlace: undefined, mapWeather: WeatherType.Real })).toBe(
            "already",
        );
    });
});

describe("mapLocationOf", () => {
    it("saves a point far from any city by its coordinates, with its time zone", () => {
        expect(mapLocationOf(POINT)).toEqual({
            name: "24° N 122° E",
            latitude: 24.2,
            longitude: 121.9,
            timezone: "Asia/Taipei",
        });
    });

    it("saves a city by its name", () => {
        expect(
            mapLocationOf({ name: "Hong Kong", latitude: 22.3, longitude: 114.17, timezone: "Asia/Hong_Kong" }),
        ).toMatchObject({ name: "Hong Kong", timezone: "Asia/Hong_Kong" });
    });
});

describe("updates", () => {
    it("makes the map follow the place in real weather, keeping its automatic settings", () => {
        const update = followPlaceUpdate(POINT);
        expect(update).toMatchObject({
            weather: WeatherType.Real,
            location: { name: "24° N 122° E", latitude: 24.2, longitude: 121.9, timezone: "Asia/Taipei" },
        });
        expect(update).not.toHaveProperty("autoFrequency");
    });

    it("brings back the weather and the place of before, or the default place", () => {
        expect(revertUpdate({ weather: WeatherType.Automatic, location: LILLE })).toMatchObject({
            weather: WeatherType.Automatic,
            location: LILLE,
        });
        expect(revertUpdate({ weather: WeatherType.Clear, location: undefined })).toMatchObject({
            weather: WeatherType.Clear,
            clearLocation: true,
        });
    });

    it("goes back to the real conditions, the thresholds of the room kept", () => {
        const manual = {
            manual: true,
            temperature: 35,
            humidity: 10,
            windSpeed: 40,
            windFrom: 90,
            thresholdTemperature: 28,
            thresholdHumidity: 25,
            thresholdWindSpeed: 30,
        };
        expect(realConditionsMessage(manual)).toEqual({ ...manual, manual: false });
    });

    it("compares places as the server rounds them", () => {
        expect(sameWeatherPlace({ ...LILLE, name: "Lille" }, LILLE)).toBe(true);
        expect(sameWeatherPlace(undefined, { name: "Paris", latitude: 48.8566, longitude: 2.3522 })).toBe(true);
        expect(sameWeatherPlace(LILLE, POINT)).toBe(false);
    });
});
