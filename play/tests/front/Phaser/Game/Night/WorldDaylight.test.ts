import { describe, expect, it } from "vitest";
import {
    placeOfPoint,
    solarMinutes,
    worldCityAt,
    worldShadeAt,
    WorldMoment,
    WORLD_MOMENT_MINUTES,
} from "@wa/front/Phaser/Game/Night/WorldDaylight";
import { NIGHT_MAX_OPACITY, nightOpacityAt, sunElevationAt } from "@wa/front/Phaser/Game/Night/NightClock";

const PARIS = { latitude: 48.86, longitude: 2.35 };
const SANTIAGO = { latitude: -33.45, longitude: -70.67 };
const PERTH = { latitude: -31.95, longitude: 115.86 };

describe("placeOfPoint", () => {
    it("names a point after the nearest city of the list, however far it is, and keeps its own coordinates", () => {
        const place = placeOfPoint({ latitude: 69, longitude: -79 });
        expect(place.name).not.toMatch(/°/);
        expect(place.latitude).toBe(69);
        expect(place.longitude).toBe(-79);
        expect(place.timezone).toBeDefined();
    });
});

describe("worldShadeAt", () => {
    const days = ["2026-06-21", "2026-11-21", "2026-12-21"];
    const hours = [0, 3, 6, 9, 12, 15, 18, 21];

    it("darkens the map of the world as the night veil of the game, at the same places and instants", () => {
        for (const day of days) {
            for (const hour of hours) {
                const date = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
                for (const place of [PARIS, SANTIAGO, PERTH]) {
                    expect(worldShadeAt(date, place.latitude, place.longitude)).toBeCloseTo(
                        nightOpacityAt(date, place) / NIGHT_MAX_OPACITY,
                        12,
                    );
                }
            }
        }
    });

    it("leaves in full daylight a sun just above the horizon, which the game does not darken", () => {
        // Paris, 21 November 2026, a little before sunset (16:58 local): the sun is low but up.
        const date = new Date("2026-11-21T15:30:00Z");
        const elevation = sunElevationAt(date, PARIS);
        expect(elevation).toBeGreaterThan(0);
        expect(elevation).toBeLessThan(5.7);
        expect(worldShadeAt(date, PARIS.latitude, PARIS.longitude)).toBe(0);
    });

    it("is only part dark during the civil dusk, and fully dark once it is over", () => {
        // Paris, 21 November 2026: sunset at 16:58 local, end of the civil dusk around 17:33 local.
        const dusk = new Date("2026-11-21T16:15:00Z");
        const elevation = sunElevationAt(dusk, PARIS);
        expect(elevation).toBeLessThan(-0.833);
        expect(elevation).toBeGreaterThan(-6);
        const shade = worldShadeAt(dusk, PARIS.latitude, PARIS.longitude);
        expect(shade).toBeGreaterThan(0);
        expect(shade).toBeLessThan(1);
        expect(worldShadeAt(new Date("2026-11-21T20:00:00Z"), PARIS.latitude, PARIS.longitude)).toBe(1);
    });
});

describe("solarMinutes", () => {
    it("is the true solar time: the mean one plus the equation of time (about 14 min on 21 November)", () => {
        const minutes = solarMinutes(new Date("2026-11-21T12:00:00Z"), 0);
        expect(minutes - 12 * 60).toBeGreaterThan(13);
        expect(minutes - 12 * 60).toBeLessThan(15);
    });
});

describe("worldCityAt", () => {
    it("chooses the city of the moment by its true solar time", () => {
        // 11:55:36 UTC on 21 November 2026, the moment "noon" (12:30): by the mean solar time Rome would be nearest
        // (12:45 against Paris 12:05), by the true one Paris is (12:19 against Rome 12:59).
        const date = new Date("2026-11-21T11:55:36Z");
        expect(worldCityAt(date, WORLD_MOMENT_MINUTES[WorldMoment.Noon]).name).toBe("Paris");
    });
});
