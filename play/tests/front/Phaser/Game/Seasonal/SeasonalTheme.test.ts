import { describe, expect, it } from "vitest";
import { Season } from "@workadventure/map-editor";
import {
    activeSeasonalTheme,
    forcedTreeSeason,
    mapSnowShown,
    migrateChristmasMode,
    SeasonalTheme,
    SeasonalThemeMode,
    shownSeasonalThemeMode,
} from "../../../../../src/front/Phaser/Game/Seasonal/SeasonalTheme";

// The winter theme is switched off (WINTER_THEME_ENABLED): its snowy ground has no textures yet. The rules of the
// winter theme are checked with the switch turned on, so that they still hold the day it is turned on again.
describe("activeSeasonalTheme", () => {
    it.each([
        ["2026-08-31T21:59:59Z", undefined],
        ["2026-08-31T22:00:00Z", SeasonalTheme.Autumn],
        ["2026-11-30T22:59:59Z", SeasonalTheme.Autumn],
        ["2026-11-30T23:00:00Z", SeasonalTheme.Christmas],
        ["2027-01-06T22:59:59Z", SeasonalTheme.Christmas],
        ["2027-01-06T23:00:00Z", undefined],
    ])("auto at %s, Paris time, winter theme on", (iso, theme) => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, new Date(iso), true)).toBe(theme);
    });

    it.each([
        ["2026-11-30T22:59:59Z", SeasonalTheme.Autumn],
        ["2026-11-30T23:00:00Z", undefined],
        ["2026-12-24T12:00:00Z", undefined],
        ["2027-01-06T22:59:59Z", undefined],
    ])("auto at %s, Paris time, winter theme off: no winter", (iso, theme) => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, new Date(iso), false)).toBe(theme);
    });

    it("has no auto theme before server time", () => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Auto, undefined)).toBeUndefined();
    });

    it("applies forced modes without server time", () => {
        expect(activeSeasonalTheme(SeasonalThemeMode.Autumn, undefined)).toBe(SeasonalTheme.Autumn);
        expect(activeSeasonalTheme(SeasonalThemeMode.Christmas, new Date("2026-07-01T12:00:00Z"), true)).toBe(
            SeasonalTheme.Christmas,
        );
        expect(activeSeasonalTheme(SeasonalThemeMode.None, new Date("2026-12-24T12:00:00Z"))).toBeUndefined();
    });

    it("follows the calendar for a saved Christmas choice while the winter theme is off", () => {
        expect(
            activeSeasonalTheme(SeasonalThemeMode.Christmas, new Date("2026-07-01T12:00:00Z"), false),
        ).toBeUndefined();
        expect(activeSeasonalTheme(SeasonalThemeMode.Christmas, new Date("2026-10-01T12:00:00Z"), false)).toBe(
            SeasonalTheme.Autumn,
        );
        expect(
            activeSeasonalTheme(SeasonalThemeMode.Christmas, new Date("2026-12-24T12:00:00Z"), false),
        ).toBeUndefined();
    });
});

describe("shownSeasonalThemeMode", () => {
    it("shows a saved Christmas choice as auto while the winter theme is off", () => {
        expect(shownSeasonalThemeMode(SeasonalThemeMode.Christmas, false)).toBe(SeasonalThemeMode.Auto);
        expect(shownSeasonalThemeMode(SeasonalThemeMode.Christmas, true)).toBe(SeasonalThemeMode.Christmas);
        for (const mode of [SeasonalThemeMode.Auto, SeasonalThemeMode.Autumn, SeasonalThemeMode.None]) {
            expect(shownSeasonalThemeMode(mode, false)).toBe(mode);
        }
    });
});

describe("forcedTreeSeason", () => {
    it("forces the tree season of the theme", () => {
        expect(forcedTreeSeason(SeasonalTheme.Autumn)).toBe(Season.Autumn);
        expect(forcedTreeSeason(SeasonalTheme.Christmas)).toBe(Season.Winter);
        expect(forcedTreeSeason(undefined)).toBeUndefined();
    });
});

describe("migrateChristmasMode", () => {
    it("migrates the Christmas setting", () => {
        expect(migrateChristmasMode("always")).toBe(SeasonalThemeMode.Christmas);
        expect(migrateChristmasMode("never")).toBe(SeasonalThemeMode.None);
        expect(migrateChristmasMode("auto")).toBe(SeasonalThemeMode.Auto);
        expect(migrateChristmasMode(null)).toBeUndefined();
        expect(migrateChristmasMode("bogus")).toBeUndefined();
    });
});

describe("mapSnowShown", () => {
    it("lets the map snow whiten the ground and the trees only in auto, with the weather shown", () => {
        expect(mapSnowShown(SeasonalThemeMode.Auto, true)).toBe(true);
        expect(mapSnowShown(SeasonalThemeMode.Auto, false)).toBe(false);
        expect(mapSnowShown(SeasonalThemeMode.Autumn, true)).toBe(false);
        expect(mapSnowShown(SeasonalThemeMode.None, true)).toBe(false);
        expect(mapSnowShown(SeasonalThemeMode.Christmas, true, true)).toBe(false);
    });

    it("lets the map snow lie for a saved Christmas choice while the winter theme is off, as in auto", () => {
        expect(mapSnowShown(SeasonalThemeMode.Christmas, true, false)).toBe(true);
        expect(mapSnowShown(SeasonalThemeMode.Christmas, false, false)).toBe(false);
    });
});
