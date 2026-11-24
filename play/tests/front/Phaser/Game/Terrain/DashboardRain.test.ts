import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { dashboardRain } from "../../../../../src/front/Phaser/Game/Terrain/DashboardRain";

const lille = { real: true, city: "Lille", now: WeatherType.Clear, manual: false };

describe("dashboardRain", () => {
    it("names the place of the map, whose rain alone brings water", () => {
        expect(dashboardRain(lille, undefined)).toEqual({ place: "Lille", manual: false, mapSnows: false });
    });

    it("names no place for a weather of the map chosen as a tile", () => {
        expect(dashboardRain({ ...lille, real: false }, undefined)).toEqual({ manual: false, mapSnows: false });
    });

    it("tells conditions set by hand", () => {
        expect(dashboardRain({ ...lille, manual: true }, undefined)).toMatchObject({ place: "Lille", manual: true });
    });

    it("tells when it snows on the map: only the share of rain is counted", () => {
        expect(dashboardRain({ ...lille, now: WeatherType.Snow }, undefined)).toMatchObject({ mapSnows: true });
        expect(dashboardRain({ ...lille, now: WeatherType.Rain }, undefined)).toMatchObject({ mapSnows: false });
    });

    it("tells the rain or the snow of the player's own city, which falls on their screen only", () => {
        expect(dashboardRain(lille, { city: "Hong Kong à 770 km", now: WeatherType.Rain })).toMatchObject({
            own: { city: "Hong Kong à 770 km", snow: false },
        });
        expect(dashboardRain(lille, { city: "Oslo", now: WeatherType.Storm })).toMatchObject({
            own: { city: "Oslo", snow: false },
        });
        expect(dashboardRain(lille, { city: "Oslo", now: WeatherType.Snow })).toMatchObject({
            own: { city: "Oslo", snow: true },
        });
    });

    it("tells nothing of the player's own city where nothing falls", () => {
        expect(dashboardRain(lille, { city: "Oslo", now: WeatherType.Clear })).not.toHaveProperty("own");
        expect(dashboardRain(lille, { city: "Oslo", now: undefined })).not.toHaveProperty("own");
    });
});
