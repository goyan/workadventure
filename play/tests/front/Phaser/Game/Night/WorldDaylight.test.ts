import { describe, expect, it } from "vitest";
import {
    placeOfPoint,
    solarMinutes,
    WORLD_CITIES,
    worldCityAt,
    worldCityOf,
    worldShadeAt,
    WorldMoment,
} from "@wa/front/Phaser/Game/Night/WorldDaylight";
import {
    NIGHT_MAX_OPACITY,
    nightOpacityAt,
    sunElevationAt,
    sunPositionAt,
} from "@wa/front/Phaser/Game/Night/NightClock";

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
    it("chooses the city of an hour chosen by its true solar time", () => {
        // 11:55:36 UTC on 21 November 2026, an hour chosen of 12:30: by the mean solar time Rome would be nearest
        // (12:45 against Paris 12:05), by the true one Paris is (12:19 against Rome 12:59).
        const date = new Date("2026-11-21T11:55:36Z");
        expect(worldCityAt(date, 12 * 60 + 30).name).toBe("Paris");
        expect(worldCityOf(date, WorldMoment.Custom, 12 * 60 + 30).name).toBe("Paris");
    });
});

describe("worldCityOf", () => {
    const days = ["2026-03-21", "2026-06-21", "2026-11-21", "2026-12-21"];
    // Every quarter of an hour of each day: whatever the time of the server, each moment finds its city.
    const instants = days.flatMap((day) =>
        Array.from(
            { length: 96 },
            (_, quarter) => new Date(new Date(`${day}T00:00:00Z`).getTime() + quarter * 900_000),
        ),
    );
    /** How the sun goes, a few minutes later: up (morning) or down (evening). */
    const rising = (date: Date, place: { latitude: number; longitude: number }): boolean =>
        sunElevationAt(new Date(date.getTime() + 5 * 60_000), place) > sunElevationAt(date, place);

    /** The share of the instants whose sun stands between 2° and 16°: a low sun, long shadows, a golden light. */
    const lowSunShare = (elevations: number[]): number =>
        elevations.filter((elevation) => elevation >= 2 && elevation <= 16).length / elevations.length;

    it("shows in the morning a sun risen and still climbing, most often low, in a morning light", () => {
        for (const day of days) {
            const elevations: number[] = [];
            for (const date of instants.filter((instant) => instant.toISOString().startsWith(day))) {
                const city = worldCityOf(date, WorldMoment.Morning, 0);
                const elevation = sunElevationAt(date, city);
                expect(elevation, `${date.toISOString()} ${city.name}`).toBeGreaterThan(2);
                expect(rising(date, city), `${date.toISOString()} ${city.name}`).toBe(true);
                elevations.push(elevation);
            }
            // A few hours of the year have no city of the list with a low sun the right way: a higher one, a while.
            expect(lowSunShare(elevations), day).toBeGreaterThan(0.75);
        }
    });

    it("shows in the evening a sun still up and going down, never the night", () => {
        for (const day of days) {
            const elevations: number[] = [];
            for (const date of instants.filter((instant) => instant.toISOString().startsWith(day))) {
                const city = worldCityOf(date, WorldMoment.Evening, 0);
                const elevation = sunElevationAt(date, city);
                expect(elevation, `${date.toISOString()} ${city.name}`).toBeGreaterThan(2);
                expect(rising(date, city), `${date.toISOString()} ${city.name}`).toBe(false);
                elevations.push(elevation);
            }
            expect(lowSunShare(elevations), day).toBeGreaterThan(0.75);
        }
    });

    it("no longer takes for the evening a city where 18:30 is the night", () => {
        // 21 December 2026 at 18:00 UTC: 18:30 of true solar time is in Paris, where the sun set two hours before.
        const date = new Date("2026-12-21T18:00:00Z");
        expect(worldCityAt(date, 18 * 60 + 30).name).toBe("Paris");
        const city = worldCityOf(date, WorldMoment.Evening, 0);
        expect(city.name).not.toBe("Paris");
        expect(sunElevationAt(date, city)).toBeGreaterThan(2);
    });

    it("shows at noon a city less than an hour from its true solar noon", () => {
        for (const date of instants) {
            const city = worldCityOf(date, WorldMoment.Noon, 0);
            const gap = Math.abs(solarMinutes(date, city.longitude) - 12 * 60);
            expect(Math.min(gap, 1440 - gap), `${date.toISOString()} ${city.name}`).toBeLessThan(60);
        }
    });

    it("keeps the evening of a city while its sun stays near the light wanted, rather than hopping", () => {
        // 21 June 2026: the evening of the city shown first is kept for a while, minute after minute.
        const start = new Date("2026-06-21T18:00:00Z");
        const first = worldCityOf(start, WorldMoment.Evening, 0);
        let shown = first;
        let changes = 0;
        for (let minute = 1; minute <= 120; minute++) {
            const date = new Date(start.getTime() + minute * 60_000);
            const next = worldCityOf(date, WorldMoment.Evening, 0, shown);
            if (next.name !== shown.name) changes++;
            if (minute <= 20) expect(next.name).toBe(first.name);
            shown = next;
        }
        expect(changes).toBeLessThanOrEqual(4);
    });

    it("leaves a city whose sun has set, even if it was shown", () => {
        // Paris, 21 November 2026 at 17:00 UTC: the sun has set (16:58 local), it is no longer an evening.
        const date = new Date("2026-11-21T17:00:00Z");
        const paris = { name: "Paris", latitude: 48.86, longitude: 2.35 };
        expect(sunPositionAt(date, paris).elevation).toBeLessThan(0);
        expect(worldCityOf(date, WorldMoment.Evening, 0, paris).name).not.toBe("Paris");
    });

    it("keeps the hour chosen as an hour: the same cities as before", () => {
        // Read on the code before this change (its worldCityAt, given the hour wanted), but for two instants where a
        // city added since is nearer to the hour chosen: Unalaska at 18:52 (Auckland was at 17:37), Khabarovsk at 12:45
        // (Séoul was at 12:12).
        const before: [string, number, string][] = [
            ["2026-06-21T06:00:00Z", 12 * 60 + 30, "Bangkok"],
            ["2026-06-21T06:00:00Z", 18 * 60 + 30, "Unalaska"],
            ["2026-12-21T18:00:00Z", 9 * 60, "Vancouver"],
            ["2026-12-21T18:00:00Z", 12 * 60 + 30, "Chicago"],
            ["2026-12-21T18:00:00Z", 18 * 60 + 30, "Paris"],
            ["2026-03-21T12:00:00Z", 9 * 60, "Rio de Janeiro"],
            ["2026-03-21T12:00:00Z", 12 * 60 + 30, "Rome"],
            ["2026-03-21T12:00:00Z", 18 * 60 + 30, "Bangkok"],
            ["2026-11-21T03:30:00Z", 9 * 60, "Bombay"],
            ["2026-11-21T03:30:00Z", 12 * 60 + 30, "Khabarovsk"],
            ["2026-11-21T03:30:00Z", 18 * 60 + 30, "Anchorage"],
        ];
        for (const [iso, minutes, name] of before) {
            expect(worldCityOf(new Date(iso), WorldMoment.Custom, minutes).name, `${iso} ${minutes}`).toBe(name);
        }
    });
});

describe("WORLD_CITIES", () => {
    it("gives each city a time zone the clock can show", () => {
        for (const city of WORLD_CITIES) {
            expect(city.timezone, city.name).toBeDefined();
            expect(() => new Intl.DateTimeFormat("en", { timeZone: city.timezone }), city.name).not.toThrow();
        }
    });

    it("has, all year long, a city with a low sun for the morning and the evening, nearly at any time", () => {
        // The 6th and the 21st of each month, every quarter of an hour, the city shown kept as the game keeps it.
        // With the list before the cities of the north (Unalaska, St. John's, Khabarovsk, Petropavlovsk, Anadyr) were
        // added: 80 % of the time only, and suns up to 45° for a morning, 35° for an evening.
        const days = Array.from({ length: 12 }, (_, month) => month + 1).flatMap((month) =>
            ["06", "21"].map((day) => `2026-${String(month).padStart(2, "0")}-${day}`),
        );
        for (const moment of [WorldMoment.Morning, WorldMoment.Evening]) {
            for (const day of days) {
                let shown: ReturnType<typeof worldCityOf> | undefined;
                let low = 0;
                for (let quarter = 0; quarter < 96; quarter++) {
                    const date = new Date(new Date(`${day}T00:00:00Z`).getTime() + quarter * 900_000);
                    shown = worldCityOf(date, moment, 0, shown);
                    const elevation = sunElevationAt(date, shown);
                    expect(elevation, `${moment} ${date.toISOString()} ${shown.name}`).toBeLessThanOrEqual(21);
                    if (elevation >= 2 && elevation <= 16) low++;
                }
                expect(low / 96, `${moment} ${day}`).toBeGreaterThanOrEqual(0.95);
            }
        }
    });
});
