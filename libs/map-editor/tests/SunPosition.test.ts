import { describe, expect, it } from "vitest";
import { isDaylightAt, SUNRISE_ELEVATION, sunPositionAt } from "../src/Weather/SunPosition";

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const SYDNEY = { latitude: -33.8688, longitude: 151.2093 };

describe("the sun of a place", () => {
    it("is high at noon in Paris in summer, under the horizon at midnight", () => {
        expect(sunPositionAt(new Date("2026-06-21T12:00:00Z"), PARIS).elevation).toBeGreaterThan(60);
        expect(sunPositionAt(new Date("2026-06-21T23:00:00Z"), PARIS).elevation).toBeLessThan(0);
    });

    it("makes the day from sunrise to sunset, not from 7 to 19", () => {
        // Paris, June 21: the sun rises at 5:47 and sets at 21:58 (Paris time, UTC+2).
        expect(isDaylightAt(new Date("2026-06-21T04:00:00Z"), PARIS)).toBe(true);
        expect(isDaylightAt(new Date("2026-06-21T19:30:00Z"), PARIS)).toBe(true);
        expect(isDaylightAt(new Date("2026-06-21T20:30:00Z"), PARIS)).toBe(false);
        // Paris, December 21: it rises at 8:42 and sets at 16:56 (UTC+1).
        expect(isDaylightAt(new Date("2026-12-21T07:00:00Z"), PARIS)).toBe(false);
        expect(isDaylightAt(new Date("2026-12-21T12:00:00Z"), PARIS)).toBe(true);
        expect(isDaylightAt(new Date("2026-12-21T16:30:00Z"), PARIS)).toBe(false);
    });

    it("keeps the night in the old 7 to 19 window of the grass: 7:30 in November, 6:30 and 21:00 in June", () => {
        // Paris, November 21: the sun rises at 8:08 (UTC+1), so 7:30 is still night, noon is day.
        expect(isDaylightAt(new Date("2026-11-21T06:30:00Z"), PARIS)).toBe(false);
        expect(isDaylightAt(new Date("2026-11-21T11:00:00Z"), PARIS)).toBe(true);
        // Paris, June 21 (UTC+2): day at 6:30 and at 21:00, before the 21:58 sunset.
        expect(isDaylightAt(new Date("2026-06-21T04:30:00Z"), PARIS)).toBe(true);
        expect(isDaylightAt(new Date("2026-06-21T19:00:00Z"), PARIS)).toBe(true);
    });

    it("starts the day at the elevation the night veil of the front ends at", () => {
        expect(SUNRISE_ELEVATION).toBe(-0.833);
    });

    it("follows the place of the map: noon in Paris is night in Sydney", () => {
        expect(isDaylightAt(new Date("2026-06-21T12:00:00Z"), SYDNEY)).toBe(false);
        expect(isDaylightAt(new Date("2026-06-21T02:00:00Z"), SYDNEY)).toBe(true);
    });

    it("takes Paris when the map has no place", () => {
        expect(isDaylightAt(new Date("2026-12-21T07:00:00Z"), undefined)).toBe(false);
        expect(isDaylightAt(new Date("2026-12-21T12:00:00Z"), undefined)).toBe(true);
    });
});
