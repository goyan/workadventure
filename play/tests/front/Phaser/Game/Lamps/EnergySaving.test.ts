import { describe, expect, it, vi } from "vitest";
import {
    daylightOf,
    ENERGY_SAVING_BACK_BELOW,
    ENERGY_SAVING_OUT_AT,
    EnergySavingClock,
    energySavingAt,
    isLampSaved,
    lampFootOnGround,
} from "../../../../../src/front/Phaser/Game/Lamps/EnergySaving";

const MINUTE = 60_000;

/** A daylight that follows a list of levels, one per minute from 0 (the last one holds afterwards). */
const levels =
    (...values: number[]) =>
    (at: number): number =>
        values[Math.max(0, Math.min(values.length - 1, Math.floor(at / MINUTE)))];

describe("daylightOf", () => {
    it("gives nothing with the sun on the horizon or under it, all of it from 15° up under a clear sky", () => {
        expect(daylightOf(-10, 1)).toBe(0);
        expect(daylightOf(0, 1)).toBe(0);
        expect(daylightOf(7.5, 1)).toBeCloseTo(0.5);
        expect(daylightOf(15, 1)).toBe(1);
        expect(daylightOf(60, 1)).toBe(1);
    });

    it("is dimmed by the weather of the map", () => {
        expect(daylightOf(40, 0.3)).toBeCloseTo(0.3);
        expect(daylightOf(40, 0.15)).toBeCloseTo(0.15);
    });

    it("gives nothing for a value that is not a number", () => {
        expect(daylightOf(Number.NaN, 1)).toBe(0);
        expect(daylightOf(30, Number.NaN)).toBe(0);
    });
});

describe("energySavingAt", () => {
    it("puts the lamps out at or above the higher level, and lights them under the lower one", () => {
        expect(ENERGY_SAVING_BACK_BELOW).toBeLessThan(ENERGY_SAVING_OUT_AT);
        expect(energySavingAt(0, () => ENERGY_SAVING_OUT_AT)).toBe(true);
        expect(energySavingAt(0, () => 0.9)).toBe(true);
        expect(energySavingAt(0, () => ENERGY_SAVING_BACK_BELOW - 0.01)).toBe(false);
        expect(energySavingAt(0, () => 0)).toBe(false);
    });

    it("puts nothing out while the daylight is not known", () => {
        expect(energySavingAt(0, () => undefined)).toBe(false);
    });

    it("between the two levels, keeps the lamps out after a bright day: a passing cloud does not light them", () => {
        // Bright until minute 10, then a cloud between the two levels.
        const daylight = levels(...Array<number>(10).fill(0.6), ...Array<number>(30).fill(0.2));
        expect(energySavingAt(30 * MINUTE, daylight)).toBe(true);
    });

    it("between the two levels, keeps the lamps on after a dark night: a dawn that hesitates does not put them out", () => {
        const daylight = levels(...Array<number>(10).fill(0.05), ...Array<number>(30).fill(0.2));
        expect(energySavingAt(30 * MINUTE, daylight)).toBe(false);
    });

    it("lights the lamps when nothing decided for hours", () => {
        expect(energySavingAt(24 * 60 * MINUTE, () => 0.2)).toBe(false);
    });
});

describe("EnergySavingClock", () => {
    it("decides as energySavingAt for a player who just came, whatever they saw before", () => {
        // Dark, then bright, then between the two levels: the lamps stay out.
        const daylight = levels(0.05, 0.05, 0.6, 0.6, 0.2, 0.2, 0.2, 0.2);
        const watching = new EnergySavingClock(daylight);
        for (let at = 0; at <= 7 * MINUTE; at += 1000) watching.savingAt(at);
        const coming = new EnergySavingClock(daylight);
        expect(coming.savingAt(7 * MINUTE)).toBe(watching.savingAt(7 * MINUTE));
        expect(coming.savingAt(7 * MINUTE)).toBe(true);
    });

    it("follows the hysteresis as time goes: out once bright, back on only once dark enough", () => {
        const daylight = levels(0.1, 0.2, 0.3, 0.2, 0.19, 0.17, 0.2);
        const clock = new EnergySavingClock(daylight);
        expect(clock.savingAt(0)).toBe(false);
        expect(clock.savingAt(MINUTE)).toBe(false);
        expect(clock.savingAt(2 * MINUTE)).toBe(true);
        expect(clock.savingAt(3 * MINUTE)).toBe(true);
        expect(clock.savingAt(4 * MINUTE)).toBe(true);
        expect(clock.savingAt(5 * MINUTE)).toBe(false);
        expect(clock.savingAt(6 * MINUTE)).toBe(false);
    });

    it("works the daylight out at most once a second", () => {
        const daylight = vi.fn(() => 0.6);
        const clock = new EnergySavingClock(daylight);
        clock.savingAt(1000);
        clock.savingAt(1500);
        clock.savingAt(1999);
        expect(daylight).toHaveBeenCalledTimes(1);
        clock.savingAt(2000);
        expect(daylight).toHaveBeenCalledTimes(2);
    });
});

describe("isLampSaved", () => {
    const at = (x: number, y: number, elevation = 0) => ({
        x,
        y,
        displayWidth: 32,
        displayHeight: 64,
        getElevation: () => elevation,
    });
    /** Outdoors left of x = 100, a room right of it. */
    const outdoorAt = (x: number): boolean => x < 100;

    it("reads where the lamp stands: the middle of the foot of its image, on the ground under a raised floor", () => {
        expect(lampFootOnGround(at(10, 20))).toEqual({ x: 26, y: 83 });
        expect(lampFootOnGround(at(10, 20, 64))).toEqual({ x: 26, y: 147 });
    });

    it("puts out a lamp outdoors by day when the map asks for it", () => {
        expect(isLampSaved(true, outdoorAt, at(0, 0))).toBe(true);
    });

    it("leaves a lamp in a room alone", () => {
        expect(isLampSaved(true, outdoorAt, at(200, 0))).toBe(false);
    });

    it("changes nothing while the saving does not apply, or while the outdoors are not known", () => {
        expect(isLampSaved(false, outdoorAt, at(0, 0))).toBe(false);
        expect(isLampSaved(true, undefined, at(0, 0))).toBe(false);
    });
});
