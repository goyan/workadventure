import { describe, expect, it } from "vitest";
import {
    autoWeatherAt,
    autoWeatherChanges,
    cloudinessAt,
    FOG_UNTIL_HOUR,
    STORM_HOURS,
} from "../src/Weather/WeatherSchedule";
import { DEFAULT_AUTO_WEATHER, WeatherType } from "../src/types";

const SLOT_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SYDNEY = { latitude: -33.87, timezone: "Australia/Sydney" };
const PARIS = { latitude: 48.86, timezone: "Europe/Paris" };
/** 2026-01-01 00:00 in Paris. */
const START = Date.parse("2025-12-31T23:00:00Z");

/** The schedule of 400 days from 2026-01-01 in Paris, weather and clouds, folded into one number. */
function fingerprint(place?: { latitude: number; timezone?: string }): string {
    let hash = 0x811c9dc5;
    for (let time = START; time < START + 400 * DAY_MS; time += SLOT_MS) {
        const text = `${autoWeatherAt(new Date(time), DEFAULT_AUTO_WEATHER, place)}|${cloudinessAt(
            new Date(time + 600_000),
            DEFAULT_AUTO_WEATHER,
            place,
        ).toFixed(3)}`;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return (hash >>> 0).toString(16);
}

const sydneyHour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    hourCycle: "h23",
});

/** Weathers of every slot of `days` days from `from`, with the hour of Sydney. */
function sydneySlots(from: number, days: number): { hour: number; weather: WeatherType }[] {
    const slots = [];
    for (let time = from; time < from + days * DAY_MS; time += SLOT_MS) {
        const date = new Date(time);
        slots.push({
            hour: Number(sydneyHour.format(date)),
            weather: autoWeatherAt(date, DEFAULT_AUTO_WEATHER, SYDNEY),
        });
    }
    return slots;
}

describe("automatic weather at the place of the map", () => {
    it("is the schedule of Paris it always was, without a place or in Paris", () => {
        // Taken on the code before the place counted (2026-11-21).
        expect(fingerprint()).toBe("82cc0792");
        expect(fingerprint(PARIS)).toBe("82cc0792");
    });

    it("keeps the fog before 11 and the storms from 13 to 21 on the clock of Sydney", () => {
        const slots = sydneySlots(Date.parse("2025-12-01T00:00:00Z"), 365);
        const fog = slots.filter((slot) => slot.weather === WeatherType.Fog);
        const storms = slots.filter((slot) => slot.weather === WeatherType.Storm);
        expect(fog.length).toBeGreaterThan(0);
        expect(storms.length).toBeGreaterThan(0);
        expect(fog.every((slot) => slot.hour < FOG_UNTIL_HOUR)).toBe(true);
        expect(storms.every((slot) => slot.hour >= STORM_HOURS[0] && slot.hour < STORM_HOURS[1])).toBe(true);
    });

    it("draws the shares of the season of the place: storms in the summer of January in Sydney, none in its winter", () => {
        const storms = (from: string, days: number, place?: typeof SYDNEY): number => {
            let count = 0;
            for (let time = Date.parse(from); time < Date.parse(from) + days * DAY_MS; time += SLOT_MS) {
                if (autoWeatherAt(new Date(time), DEFAULT_AUTO_WEATHER, place) === WeatherType.Storm) count++;
            }
            return count;
        };
        // The winter shares have no storm: none in Paris in January, none in Sydney in July.
        expect(storms("2026-01-01T00:00:00Z", 31)).toBe(0);
        expect(storms("2026-07-01T00:00:00Z", 31, SYDNEY)).toBe(0);
        expect(storms("2026-01-01T00:00:00Z", 31, SYDNEY)).toBeGreaterThan(0);
        expect(storms("2026-07-01T00:00:00Z", 31)).toBeGreaterThan(0);
    });

    it("lets a map of Sydney and a map of Paris share the server without mixing their schedules", () => {
        const date = new Date("2026-01-15T03:00:00Z");
        for (let slot = 0; slot < 96; slot++) {
            autoWeatherAt(new Date(date.getTime() + slot * SLOT_MS), DEFAULT_AUTO_WEATHER, SYDNEY);
            cloudinessAt(new Date(date.getTime() + slot * SLOT_MS), DEFAULT_AUTO_WEATHER, SYDNEY);
        }
        expect(fingerprint()).toBe("82cc0792");
    });

    it("lists the next changes of the day of the place", () => {
        const date = new Date("2026-01-15T03:00:00Z");
        for (const change of autoWeatherChanges(date, DEFAULT_AUTO_WEATHER, 5, SYDNEY)) {
            expect(autoWeatherAt(change.at, DEFAULT_AUTO_WEATHER, SYDNEY)).toBe(change.weather);
        }
    });
});
