import { describe, expect, it } from "vitest";
import { autumnProgressAt, seasonAt, seasonOfMonth, treeSeasonAt } from "../src/Weather/SeasonClock";
import { Season } from "../src/types";

const SYDNEY = { latitude: -33.87, timezone: "Australia/Sydney" };
const SANTIAGO = { latitude: -33.45, timezone: "America/Santiago" };
const NEW_YORK = { latitude: 40.71, timezone: "America/New_York" };
const PARIS = { latitude: 48.86, timezone: "Europe/Paris" };

describe("seasonAt", () => {
    it("reads the season of the northern calendar in Paris, with or without a place", () => {
        const january = new Date("2026-01-15T12:00:00Z");
        expect(seasonAt(january)).toBe(Season.Winter);
        expect(seasonAt(january, PARIS)).toBe(Season.Winter);
        expect(seasonAt(new Date("2026-07-15T12:00:00Z"))).toBe(Season.Summer);
    });

    it("turns the seasons over in the southern hemisphere", () => {
        expect(seasonAt(new Date("2026-01-15T02:00:00Z"), SYDNEY)).toBe(Season.Summer);
        expect(seasonAt(new Date("2026-07-15T16:00:00Z"), SANTIAGO)).toBe(Season.Winter);
        expect(seasonAt(new Date("2026-04-15T02:00:00Z"), SYDNEY)).toBe(Season.Autumn);
        expect(seasonAt(new Date("2026-10-15T02:00:00Z"), SYDNEY)).toBe(Season.Spring);
    });

    it("turns at midnight at the place, not in Paris", () => {
        // 14:00 UTC on February 28: already March 1st at 01:00 in Sydney, still February 28 in Paris.
        const sydneyMidnight = new Date("2026-02-28T14:00:00Z");
        expect(seasonAt(sydneyMidnight, SYDNEY)).toBe(Season.Autumn);
        expect(seasonAt(sydneyMidnight)).toBe(Season.Winter);
        // 03:00 UTC on March 1st: March in Paris, still February 28 in New York.
        const parisMorning = new Date("2026-03-01T03:00:00Z");
        expect(seasonAt(parisMorning)).toBe(Season.Spring);
        expect(seasonAt(parisMorning, NEW_YORK)).toBe(Season.Winter);
    });

    it("reads the hemisphere of a place chosen without a time zone, and its day in Paris", () => {
        // A place chosen before it carried its time zone: its season is southern, its day the one of Paris.
        // 22:30 UTC on February 28 is 23:30 in Paris (summer), 23:30 UTC is March 1st there (autumn).
        const lateFebruary = new Date("2026-02-28T22:30:00Z");
        expect(seasonAt(lateFebruary, { latitude: -33.87 })).toBe(Season.Summer);
        expect(seasonAt(new Date("2026-02-28T23:30:00Z"), { latitude: -33.87 })).toBe(Season.Autumn);
        // A time zone the clock does not know reads as Paris too.
        expect(seasonAt(new Date("2026-02-28T23:30:00Z"), { latitude: -33.87, timezone: "Nowhere/Here" })).toBe(
            Season.Autumn,
        );
    });

    it("counts the equator as the north", () => {
        expect(seasonOfMonth(1, 0)).toBe(Season.Winter);
        expect(seasonOfMonth(1, -0.1)).toBe(Season.Summer);
        expect(seasonOfMonth(1)).toBe(Season.Winter);
    });
});

describe("treeSeasonAt", () => {
    it("shows the summer of the place for its winter without snow, and the winter under snow", () => {
        expect(treeSeasonAt(new Date("2026-01-15T02:00:00Z"), 0, SYDNEY)).toBe(Season.Summer);
        expect(treeSeasonAt(new Date("2026-04-15T02:00:00Z"), 0, SYDNEY)).toBe(Season.Autumn);
        expect(treeSeasonAt(new Date("2026-04-15T02:00:00Z"), 0)).toBe(Season.Spring);
        expect(treeSeasonAt(new Date("2026-01-15T02:00:00Z"), 0.5, SYDNEY)).toBe(Season.Winter);
    });
});

describe("autumnProgressAt", () => {
    it("is the one of Paris without a place", () => {
        expect(autumnProgressAt(new Date("2026-09-01T10:00:00+02:00"))).toBeCloseTo(1 / 91);
        expect(autumnProgressAt(new Date("2026-11-30T10:00:00+01:00"))).toBeCloseTo(1);
        expect(autumnProgressAt(new Date("2026-07-14T10:00:00+02:00"))).toBe(0.5);
        expect(autumnProgressAt(new Date(Number.NaN))).toBe(0.5);
    });

    it("runs from March 1st to May 31 in the south", () => {
        expect(autumnProgressAt(new Date("2026-03-01T02:00:00Z"), SYDNEY)).toBeCloseTo(1 / 92);
        expect(autumnProgressAt(new Date("2026-05-31T02:00:00Z"), SYDNEY)).toBeCloseTo(1);
        expect(autumnProgressAt(new Date("2026-10-16T02:00:00Z"), SYDNEY)).toBe(0.5);
    });
});
