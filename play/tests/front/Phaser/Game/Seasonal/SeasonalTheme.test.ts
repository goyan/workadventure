import { describe, expect, it } from "vitest";
import { Season } from "@workadventure/map-editor";
import {
    activeSeasonalTheme,
    forcedTreeSeason,
    mapSnowShown,
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
        // The snow decor of the map weather is no theme: it forces no season on the trees.
        expect(forcedTreeSeason(SeasonalTheme.Christmas)).toBeUndefined();
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

describe("mapSnowShown", () => {
    it("lets the map snow whiten the ground and the trees only in auto, with the weather shown", () => {
        expect(mapSnowShown(SeasonalThemeMode.Auto, true)).toBe(true);
        expect(mapSnowShown(SeasonalThemeMode.Auto, false)).toBe(false);
        expect(mapSnowShown(SeasonalThemeMode.Autumn, true)).toBe(false);
        expect(mapSnowShown(SeasonalThemeMode.None, true)).toBe(false);
    });
});
