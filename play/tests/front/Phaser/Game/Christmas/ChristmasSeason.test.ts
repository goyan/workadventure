import { describe, expect, it } from "vitest";
import { ChristmasThemeMode, isChristmasActive } from "../../../../../src/front/Phaser/Game/Christmas/ChristmasSeason";

describe("isChristmasActive", () => {
    const at = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12);

    it("auto covers December 1st to January 6th", () => {
        expect(isChristmasActive(ChristmasThemeMode.Auto, at(11, 30))).toBe(false);
        expect(isChristmasActive(ChristmasThemeMode.Auto, new Date(2026, 11, 1, 0, 0))).toBe(true);
        expect(isChristmasActive(ChristmasThemeMode.Auto, at(12, 25))).toBe(true);
        expect(isChristmasActive(ChristmasThemeMode.Auto, new Date(2027, 0, 6, 23, 59))).toBe(true);
        expect(isChristmasActive(ChristmasThemeMode.Auto, new Date(2027, 0, 7, 0, 0))).toBe(false);
        expect(isChristmasActive(ChristmasThemeMode.Auto, at(7, 14))).toBe(false);
    });

    it("always and never ignore the date", () => {
        expect(isChristmasActive(ChristmasThemeMode.Always, at(7, 14))).toBe(true);
        expect(isChristmasActive(ChristmasThemeMode.Never, at(12, 25))).toBe(false);
    });
});
