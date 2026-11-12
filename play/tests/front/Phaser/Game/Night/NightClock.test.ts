import { describe, expect, it } from "vitest";
import {
    NIGHT_MAX_OPACITY,
    nightOpacityAt,
    parisCalendarDay,
    parisMinutes,
    parisWallClockToInstant,
    parseNightAt,
    sunElevationInParis,
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

describe("parisMinutes", () => {
    it("uses UTC+1 in winter", () => {
        expect(parisMinutes(new Date("2026-01-15T18:00:00Z"))).toBe(19 * 60);
    });

    it("uses UTC+2 in summer", () => {
        expect(parisMinutes(new Date("2026-07-15T17:00:00Z"))).toBe(19 * 60);
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
