import { describe, expect, it } from "vitest";
import {
    NIGHT_MAX_OPACITY,
    nightOpacity,
    nightOpacityAtMinutes,
    parisMinutes,
    parseNightAt,
} from "../../../../../src/front/Phaser/Game/Night/NightClock";

const at = (h: number, m: number): number => h * 60 + m;

describe("nightOpacityAtMinutes", () => {
    it("is fully transparent during the day", () => {
        expect(nightOpacityAtMinutes(at(12, 0))).toBe(0);
        expect(nightOpacityAtMinutes(at(18, 29))).toBe(0);
        expect(nightOpacityAtMinutes(at(18, 30))).toBe(0);
    });

    it("ramps up linearly during dusk (18:30 to 19:00)", () => {
        expect(nightOpacityAtMinutes(at(18, 45))).toBeCloseTo(NIGHT_MAX_OPACITY / 2);
        expect(nightOpacityAtMinutes(at(19, 0))).toBeCloseTo(NIGHT_MAX_OPACITY);
    });

    it("stays at maximum during the night (19:00 to 7:00)", () => {
        expect(NIGHT_MAX_OPACITY).toBe(0.6);
        expect(nightOpacityAtMinutes(at(3, 0))).toBe(NIGHT_MAX_OPACITY);
        expect(nightOpacityAtMinutes(at(6, 59))).toBe(NIGHT_MAX_OPACITY);
        expect(nightOpacityAtMinutes(at(7, 0))).toBe(NIGHT_MAX_OPACITY);
    });

    it("ramps down linearly during dawn (7:00 to 7:30)", () => {
        expect(nightOpacityAtMinutes(at(7, 15))).toBeCloseTo(NIGHT_MAX_OPACITY / 2);
        expect(nightOpacityAtMinutes(at(7, 30))).toBe(0);
    });

    it("interpolates fractional minutes", () => {
        expect(nightOpacityAtMinutes(at(18, 37) + 0.5)).toBeCloseTo((7.5 / 30) * NIGHT_MAX_OPACITY);
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

describe("nightOpacity", () => {
    it("is at maximum at 19:00 Paris time, winter and summer", () => {
        expect(nightOpacity(new Date("2026-01-15T18:00:00Z"))).toBeCloseTo(NIGHT_MAX_OPACITY);
        expect(nightOpacity(new Date("2026-07-15T17:00:00Z"))).toBeCloseTo(NIGHT_MAX_OPACITY);
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
