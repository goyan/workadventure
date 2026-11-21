import { describe, expect, it } from "vitest";
import {
    ALWAYS_NIGHT_MINUTES,
    forcedSunMinutes,
    NIGHT_DARKNESS_MAX,
    NIGHT_DARKNESS_MIN,
    NIGHT_MAX_OPACITY,
    nightOpacityAt,
    nightOpacityWith,
    parisCalendarDay,
    parisWallClockToInstant,
    parseNightAt,
    sunElevationAt,
    sunElevationInParis,
    sunPlaceOf,
    sunPositionAt,
    worldClockTimeZone,
} from "../../../../../src/front/Phaser/Game/Night/NightClock";

const MINUTE = 60_000;

/** An instant given as a Paris wall clock, e.g. paris("2026-11-12", "17:14"). */
function paris(day: string, time: string): Date {
    const [year, month, date] = day.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    return parisWallClockToInstant(year, month, date, hours * 60 + minutes);
}

const shifted = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * MINUTE);

/*
 * Reference times for Paris, local time (CET/CEST), as published by timeanddate.com "Sunrise, Sunset, and Daylength"
 * for Paris, France (https://www.timeanddate.com/sun/france/paris?month=M&year=2026), read on 2026-11-12:
 * civil twilight start (sun at -6°), sunrise and sunset (-0.833°), civil twilight end (-6°).
 * Cross-checked against the independent suncalc library (1.9.0), which agrees within 3 minutes.
 * The night veil must follow them within ±2 minutes (the published times are rounded to the minute).
 */
const REFERENCES = [
    { day: "2026-03-20", dawn: "06:22", sunrise: "06:53", sunset: "19:03", dusk: "19:34" }, // March equinox
    { day: "2026-03-28", dawn: "06:05", sunrise: "06:36", sunset: "19:15", dusk: "19:47" }, // last day of CET
    { day: "2026-03-29", dawn: "07:03", sunrise: "07:34", sunset: "20:16", dusk: "20:48" }, // first day of CEST
    { day: "2026-06-21", dawn: "05:04", sunrise: "05:46", sunset: "21:57", dusk: "22:40" }, // June solstice
    { day: "2026-10-24", dawn: "07:52", sunrise: "08:24", sunset: "18:44", dusk: "19:16" }, // last day of CEST
    { day: "2026-10-25", dawn: "06:53", sunrise: "07:26", sunset: "17:42", dusk: "18:14" }, // first day of CET
    { day: "2026-11-12", dawn: "07:20", sunrise: "07:54", sunset: "17:14", dusk: "17:48" },
    { day: "2026-12-21", dawn: "08:03", sunrise: "08:41", sunset: "16:56", dusk: "17:33" }, // December solstice
];
const TOLERANCE = 2;

describe("nightOpacityAt, on the sun of Paris", () => {
    for (const { day, dawn, sunrise, sunset, dusk } of REFERENCES) {
        it(`follows the published sunrise, sunset and civil twilight on ${day}`, () => {
            // Morning: full night until the civil dawn, nothing left at sunrise.
            expect(nightOpacityAt(shifted(paris(day, dawn), -TOLERANCE))).toBe(NIGHT_MAX_OPACITY);
            expect(nightOpacityAt(shifted(paris(day, dawn), TOLERANCE))).toBeLessThan(NIGHT_MAX_OPACITY);
            expect(nightOpacityAt(shifted(paris(day, sunrise), -TOLERANCE))).toBeGreaterThan(0);
            expect(nightOpacityAt(shifted(paris(day, sunrise), TOLERANCE))).toBe(0);
            // Evening: the veil starts at sunset and is complete at the end of the civil dusk.
            expect(nightOpacityAt(shifted(paris(day, sunset), -TOLERANCE))).toBe(0);
            expect(nightOpacityAt(shifted(paris(day, sunset), TOLERANCE))).toBeGreaterThan(0);
            expect(nightOpacityAt(shifted(paris(day, dusk), -TOLERANCE))).toBeLessThan(NIGHT_MAX_OPACITY);
            expect(nightOpacityAt(shifted(paris(day, dusk), TOLERANCE))).toBe(NIGHT_MAX_OPACITY);
        });
    }

    it("keeps the maximum darkness unchanged", () => {
        expect(NIGHT_MAX_OPACITY).toBe(0.6);
        expect(nightOpacityAt(paris("2026-11-12", "03:00"))).toBe(NIGHT_MAX_OPACITY);
        expect(nightOpacityAt(paris("2026-06-21", "00:30"))).toBe(NIGHT_MAX_OPACITY);
        expect(nightOpacityAt(paris("2026-11-12", "12:00"))).toBe(0);
    });

    it("is day at 21:00 in June and night at 21:00 in November", () => {
        expect(nightOpacityAt(paris("2026-06-21", "21:00"))).toBe(0);
        expect(nightOpacityAt(paris("2026-11-12", "21:00"))).toBe(NIGHT_MAX_OPACITY);
    });

    it("darkens steadily through the dusk", () => {
        const sunset = paris("2026-11-12", "17:14");
        let previous = 0;
        for (let minutes = 2; minutes <= 34; minutes += 4) {
            const opacity = nightOpacityAt(shifted(sunset, minutes));
            expect(opacity).toBeGreaterThanOrEqual(previous);
            previous = opacity;
        }
        // Halfway between the two thresholds, about half of the darkness.
        const halfway = nightOpacityAt(paris("2026-11-12", "17:31"));
        expect(halfway).toBeGreaterThan(NIGHT_MAX_OPACITY * 0.35);
        expect(halfway).toBeLessThan(NIGHT_MAX_OPACITY * 0.65);
    });
});

describe("sunElevationInParis", () => {
    it("is close to the published noon elevation at the solstices", () => {
        // Geometric elevation at solar noon in Paris (latitude 48.8566° N): 90° - 48.8566° ± 23.44°.
        expect(sunElevationInParis(paris("2026-06-21", "13:58"))).toBeCloseTo(64.58, 0);
        expect(sunElevationInParis(paris("2026-12-21", "12:49"))).toBeCloseTo(17.7, 0);
    });
});

describe("parisWallClockToInstant", () => {
    it("uses UTC+1 in winter and UTC+2 in summer", () => {
        expect(parisWallClockToInstant(2026, 1, 15, 19 * 60).toISOString()).toBe("2026-01-15T18:00:00.000Z");
        expect(parisWallClockToInstant(2026, 7, 15, 19 * 60).toISOString()).toBe("2026-07-15T17:00:00.000Z");
    });

    it("handles both days of the clock changes", () => {
        expect(parisWallClockToInstant(2026, 3, 29, 12 * 60).toISOString()).toBe("2026-03-29T10:00:00.000Z");
        expect(parisWallClockToInstant(2026, 10, 25, 12 * 60).toISOString()).toBe("2026-10-25T11:00:00.000Z");
        // 02:30 does not exist on 2026-03-29: it still gives an instant, at night.
        const missing = parisWallClockToInstant(2026, 3, 29, 2 * 60 + 30);
        expect(Number.isNaN(missing.getTime())).toBe(false);
        expect(nightOpacityAt(missing)).toBe(NIGHT_MAX_OPACITY);
    });

    it("accepts fractional minutes", () => {
        expect(parisWallClockToInstant(2026, 1, 15, 19 * 60 + 0.5).toISOString()).toBe("2026-01-15T18:00:30.000Z");
    });
});

describe("parisCalendarDay", () => {
    it("gives the date of Paris, not the UTC one", () => {
        expect(parisCalendarDay(new Date("2026-11-12T23:30:00Z"))).toEqual({ year: 2026, month: 11, day: 13 });
        expect(parisCalendarDay(new Date("2026-11-12T22:30:00Z"))).toEqual({ year: 2026, month: 11, day: 12 });
    });
});

describe("parseNightAt", () => {
    it("parses a valid HH:MM in dev", () => {
        expect(parseNightAt("?nightAt=21:00", true)).toBe(1260);
        expect(parseNightAt("?nightAt=7:05", true)).toBe(425);
    });

    it("ignores the parameter outside dev", () => {
        expect(parseNightAt("?nightAt=21:00", false)).toBeUndefined();
    });

    it("rejects invalid or absent values", () => {
        expect(parseNightAt("?nightAt=25:00", true)).toBeUndefined();
        expect(parseNightAt("?nightAt=12:60", true)).toBeUndefined();
        expect(parseNightAt("?nightAt=abc", true)).toBeUndefined();
        expect(parseNightAt("", true)).toBeUndefined();
    });
});

/*
 * Night at the place of the map. Sunsets on 2026-11-14, local time (CET), published by timeanddate.com
 * (https://www.timeanddate.com/sun/france/{paris,brest}?month=11&year=2026), read on 2026-11-14:
 * Paris 17:11, Brest 17:40.
 */
describe("night at the place of the map", () => {
    const brest = { latitude: 48.3904, longitude: -4.4861 };

    it("uses Paris when the map has no place", () => {
        const date = paris("2026-11-14", "17:35");
        expect(nightOpacityAt(date)).toBe(nightOpacityAt(date, undefined));
    });

    it("falls later in Brest, west of Paris", () => {
        expect(nightOpacityAt(paris("2026-11-14", "17:35"))).toBeGreaterThan(0);
        expect(nightOpacityAt(paris("2026-11-14", "17:35"), brest)).toBe(0);
        expect(nightOpacityAt(paris("2026-11-14", "17:44"), brest)).toBeGreaterThan(0);
    });
});

describe("sunPlaceOf", () => {
    const montreal = { latitude: 45.5, longitude: -73.57 };

    it("lights the map with the sun of its place on the server clock", () => {
        expect(sunPlaceOf(false, montreal)).toBe(montreal);
        expect(sunPlaceOf(false, undefined)).toBeUndefined();
    });

    it("keeps the sun of Paris for a clock read as Paris time (computer clock, ?nightAt)", () => {
        // 21:00 on a computer in Montréal is read as 21:00 in Paris: the sun of Montréal then would be 15:00's.
        expect(sunPlaceOf(true, montreal)).toBeUndefined();
    });
});

describe("sunPositionAt", () => {
    // Published by timeanddate.com for 2026-11-14 (read on 2026-11-14): sunrise and sunset azimuths, solar noon altitude.
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const sydney = { latitude: -33.8688, longitude: 151.2093 };

    it("finds the sun of Paris: rising at 117° (07:57), setting at 242° (17:11), 22.9° high at 12:35", () => {
        expect(Math.abs(sunPositionAt(new Date("2026-11-14T06:57:00Z"), paris).azimuth - 117)).toBeLessThanOrEqual(1);
        expect(Math.abs(sunPositionAt(new Date("2026-11-14T16:11:00Z"), paris).azimuth - 242)).toBeLessThanOrEqual(1);
        const noon = sunPositionAt(new Date("2026-11-14T11:35:00Z"), paris);
        expect(Math.abs(noon.elevation - 22.9)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(noon.azimuth - 180)).toBeLessThanOrEqual(1);
    });

    it("finds the sun of Sydney (UTC+11): rising at 113° (05:44), setting at 247° (19:35), 74.3° high at 12:39", () => {
        expect(Math.abs(sunPositionAt(new Date("2026-11-13T18:44:00Z"), sydney).azimuth - 113)).toBeLessThanOrEqual(1);
        expect(Math.abs(sunPositionAt(new Date("2026-11-14T08:35:00Z"), sydney).azimuth - 247)).toBeLessThanOrEqual(1);
        const noon = sunPositionAt(new Date("2026-11-14T01:39:00Z"), sydney);
        expect(Math.abs(noon.elevation - 74.3)).toBeLessThanOrEqual(0.5);
        // North at noon in the southern hemisphere: 0° or 360°.
        expect(Math.min(noon.azimuth, 360 - noon.azimuth)).toBeLessThanOrEqual(2);
    });

    it("gives the same elevation as sunElevationAt", () => {
        const at = new Date("2026-11-14T14:00:00Z");
        expect(sunPositionAt(at, paris).elevation).toBe(sunElevationAt(at, paris));
    });
});

describe("nightOpacityWith", () => {
    it("leaves the night as it is at the default darkness", () => {
        expect(nightOpacityWith(NIGHT_MAX_OPACITY, NIGHT_MAX_OPACITY)).toBeCloseTo(NIGHT_MAX_OPACITY);
        expect(nightOpacityWith(0.3, NIGHT_MAX_OPACITY)).toBeCloseTo(0.3);
    });

    it("makes the full night as dark as the setting, and the dusk in the same proportion", () => {
        expect(nightOpacityWith(NIGHT_MAX_OPACITY, 0.9)).toBeCloseTo(0.9);
        expect(nightOpacityWith(NIGHT_MAX_OPACITY / 2, 0.9)).toBeCloseTo(0.45);
        expect(nightOpacityWith(NIGHT_MAX_OPACITY, 0.3)).toBeCloseTo(0.3);
    });

    it("keeps the day clear whatever the setting", () => {
        expect(nightOpacityWith(0, 0.95)).toBe(0);
    });

    it("keeps a setting it cannot read within its limits", () => {
        expect(nightOpacityWith(NIGHT_MAX_OPACITY, 2)).toBeCloseTo(NIGHT_DARKNESS_MAX);
        expect(nightOpacityWith(NIGHT_MAX_OPACITY, -1)).toBeCloseTo(NIGHT_DARKNESS_MIN);
        expect(nightOpacityWith(NIGHT_MAX_OPACITY, Number.NaN)).toBeCloseTo(NIGHT_MAX_OPACITY);
    });
});

describe("worldClockTimeZone", () => {
    it("shows the time of the place of the map on the server clock", () => {
        expect(worldClockTimeZone(false, "Australia/Sydney")).toBe("Australia/Sydney");
    });

    it("shows the time of Paris on a map without a place, or whose place has no time zone", () => {
        expect(worldClockTimeZone(false, undefined)).toBe("Europe/Paris");
    });

    it("shows the time of the computer, whatever the map, for a player who follows their own clock", () => {
        expect(worldClockTimeZone(true, "Australia/Sydney")).toBeUndefined();
    });
});

describe("forcedSunMinutes", () => {
    it("follows the clock unless the night is always on or a development time is given", () => {
        expect(forcedSunMinutes(undefined, false)).toBeUndefined();
        expect(forcedSunMinutes(undefined, true)).toBe(ALWAYS_NIGHT_MINUTES);
        expect(forcedSunMinutes(12 * 60, true)).toBe(12 * 60);
    });

    it("keeps the night always shown fully dark, on the longest and on the shortest day", () => {
        for (const day of ["2026-06-21", "2026-12-21"]) {
            const [year, month, date] = day.split("-").map(Number);
            const instant = parisWallClockToInstant(year, month, date, ALWAYS_NIGHT_MINUTES);
            expect(nightOpacityAt(instant)).toBe(NIGHT_MAX_OPACITY);
        }
    });
});

describe("sunPositionAt, built from solarTermsAt", () => {
    // Read on the code before the terms that depend on the instant alone were taken out of it: nothing may move.
    const before: [string, number, number, number, number][] = [
        ["2026-03-20T06:00:00Z", -33.45, -70.67, -52.61605231228319, 150.39691346717723],
        ["2026-03-20T06:00:00Z", -31.95, 115.86, 50.94701717613423, 319.823192221064],
        ["2026-06-21T12:00:00Z", 48.86, 2.35, 64.53407667632632, 184.04394013501314],
        ["2026-06-21T12:00:00Z", -33.45, -70.67, 1.6268218065799402, 60.28591470307583],
        ["2026-06-21T12:00:00Z", -31.95, 115.86, -32.987710859470866, 278.8617486042109],
        ["2026-11-21T16:15:00Z", 48.86, 2.35, -2.4383317110033005, 241.84131820298603],
        ["2026-11-21T16:15:00Z", -33.45, -70.67, 76.22843381814131, 13.50457007873797],
        ["2026-11-21T16:15:00Z", -31.95, 115.86, -37.950125555275136, 176.2597670615479],
        ["2026-12-21T23:30:00Z", 48.86, 2.35, -64.30494103710771, 349.9537953639008],
        ["2026-12-21T23:30:00Z", -33.45, -70.67, 3.2561432942207063, 243.9025790244948],
        ["2026-12-21T23:30:00Z", -31.95, 115.86, 27.45987481312782, 101.78186280209121],
    ];

    it("gives the same sun as before, to the last digit", () => {
        for (const [iso, latitude, longitude, elevation, azimuth] of before) {
            const sun = sunPositionAt(new Date(iso), { latitude, longitude });
            expect(sun.elevation).toBe(elevation);
            expect(sun.azimuth).toBe(azimuth);
        }
    });
});
