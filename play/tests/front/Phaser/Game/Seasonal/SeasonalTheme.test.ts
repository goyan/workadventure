import { describe, expect, it } from "vitest";
import { Season } from "@workadventure/map-editor";
import {
    activeSeasonalTheme,
    forcedTreeSeason,
    migrateChristmasMode,
    SeasonalTheme,
    SeasonalThemeMode,
} from "../../../../../src/front/Phaser/Game/Seasonal/SeasonalTheme";

describe("activeSeasonalTheme", () => {
    it.each([
        ["2026-08-31T21:59:59Z", undefined],
        ["2026-08-31T22:00:00Z", SeasonalTheme.Autumn],
        ["2026-11-30T22:59:59Z", SeasonalTheme.Autumn],
        // The Christmas theme is gone: no scripted snow in December either.
        ["2026-11-30T23:00:00Z", undefined],
        ["2026-12-24T12:00:00Z", undefined],
        ["2027-01-06T22:59:59Z", undefined],
    ])("auto at %s, Paris time", (iso, theme) => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, new Date(iso))).toBe(theme);
    });

    it("follows the autumn of the place of the map in auto: March to May in Sydney, the forced modes as before", () => {
        const sydney = { latitude: -33.87, timezone: "Australia/Sydney" };
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, new Date("2026-04-15T02:00:00Z"), sydney)).toBe(
            SeasonalTheme.Autumn,
        );
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, new Date("2026-10-15T02:00:00Z"), sydney)).toBeUndefined();
        // Midnight in Sydney: March 1st there, still February in Paris.
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, new Date("2026-02-28T14:00:00Z"), sydney)).toBe(
            SeasonalTheme.Autumn,
        );
        expect(activeSeasonalTheme(SeasonalThemeMode.None, new Date("2026-04-15T02:00:00Z"), sydney)).toBeUndefined();
        expect(activeSeasonalTheme(SeasonalThemeMode.Autumn, new Date("2026-10-15T02:00:00Z"), sydney)).toBe(
            SeasonalTheme.Autumn,
        );
    });

    it("shows the winter for who chose it, whatever the date, and never by itself", () => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Winter, new Date("2026-07-14T12:00:00Z"))).toBe(
            SeasonalTheme.Christmas,
        );
        expect(activeSeasonalTheme(SeasonalThemeMode.Winter, undefined)).toBe(SeasonalTheme.Christmas);
        // Auto has no winter: in January it shows nothing.
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, new Date("2027-01-10T12:00:00Z"))).toBeUndefined();
    });

    it("has no auto theme before server time", () => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, undefined)).toBeUndefined();
    });

    it("applies forced modes without server time", () => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Autumn, undefined)).toBe(SeasonalTheme.Autumn);
        expect(activeSeasonalTheme(SeasonalThemeMode.None, new Date("2026-10-24T12:00:00Z"))).toBeUndefined();
    });
});

describe("forcedTreeSeason", () => {
    it("forces the tree season of the theme", () => {
        expect(forcedTreeSeason(SeasonalTheme.Autumn)).toBe(Season.Autumn);
        // The winter theme: the trees of who chose it are those of the winter.
        expect(forcedTreeSeason(SeasonalTheme.Christmas)).toBe(Season.Winter);
        expect(forcedTreeSeason(undefined)).toBeUndefined();
    });
});

describe("migrateChristmasMode", () => {
    it("migrates the Christmas setting, whose theme is gone", () => {
        expect(migrateChristmasMode("always")).toBe(SeasonalThemeMode.Auto);
        expect(migrateChristmasMode("never")).toBe(SeasonalThemeMode.None);
        expect(migrateChristmasMode("auto")).toBe(SeasonalThemeMode.Auto);
        expect(migrateChristmasMode(null)).toBeUndefined();
        expect(migrateChristmasMode("bogus")).toBeUndefined();
    });
});
