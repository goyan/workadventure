import { describe, expect, it } from "vitest";
import { SNOW_MAX_MM, THAW_SPEED } from "@workadventure/map-editor";
import { ICE_BEARS_MM } from "@workadventure/map-editor";
import {
    cycleAfterAbsence,
    iceAt,
    isFrozen,
    ownIceMm,
    ownSnowAfter,
    POOL_ICE_DEPTH_PX,
    towards,
} from "@wa/front/Phaser/Game/Weather/Frost";

describe("Frost", () => {
    it("freezes the water from 0 °C, all of it at -15 °C", () => {
        expect(iceAt(5)).toBe(0);
        expect(iceAt(0)).toBe(0);
        expect(iceAt(-7.5)).toBeCloseTo(0.5);
        expect(iceAt(-15)).toBe(1);
        expect(iceAt(-40)).toBe(1);
    });

    it("freezes the shallows first and the deep water last", () => {
        const cold = iceAt(-10);
        expect(isFrozen(4, cold)).toBe(true);
        expect(isFrozen(64, cold)).toBe(false);
        expect(isFrozen(200, iceAt(-15))).toBe(true);
        // No water, no ice.
        expect(isFrozen(0, 1)).toBe(false);
        expect(isFrozen(4, 0)).toBe(false);
    });

    it("freezes a pool from its surface from about -3 °C, the deep water of a lake still open", () => {
        expect(isFrozen(POOL_ICE_DEPTH_PX, iceAt(-4))).toBe(true);
        expect(isFrozen(POOL_ICE_DEPTH_PX, iceAt(-7))).toBe(true);
        expect(isFrozen(POOL_ICE_DEPTH_PX, iceAt(-2.5))).toBe(false);
        expect(isFrozen(64, iceAt(-10))).toBe(false);
    });

    it("gives the ice of a player's own place a thickness that bears a walker from -7.5 °C", () => {
        expect(ownIceMm(iceAt(-4))).toBeLessThan(ICE_BEARS_MM);
        expect(ownIceMm(iceAt(-7))).toBeLessThan(ICE_BEARS_MM);
        expect(ownIceMm(iceAt(-7.5))).toBeCloseTo(ICE_BEARS_MM);
        expect(ownIceMm(iceAt(-12))).toBeGreaterThan(ICE_BEARS_MM);
    });

    it("moves towards the weather of now at its own pace each way, never past it", () => {
        expect(towards(0, 1, 10, 0.05, 0.01)).toBeCloseTo(0.5);
        expect(towards(1, 0, 10, 0.05, 0.01)).toBeCloseTo(0.9);
        expect(towards(0.9, 1, 60, 0.05, 0.01)).toBe(1);
        expect(towards(0.1, 0, 60, 0.05, 0.01)).toBe(0);
    });
});

describe("the snow of a player's own city", () => {
    const frost = { temperature: -5, humidity: 90, windSpeed: 0 };
    const mild = { temperature: 10, humidity: 50, windSpeed: 0 };

    it("lies as it falls in the cold, as fast as the clock of the snow runs, up to the most a ground holds", () => {
        // 2 mm an hour of water, all of it snow at -5 °C, 600 times faster than the real clock, for 9 s.
        expect(ownSnowAfter(0, 9, 2, frost)).toBeCloseTo((2 * THAW_SPEED * 9) / 3600);
        expect(ownSnowAfter(SNOW_MAX_MM - 1, 60, 500, frost)).toBe(SNOW_MAX_MM);
    });

    it("does not lie when what falls is rain, and melts in a mild air as the snow of the server does", () => {
        expect(ownSnowAfter(0, 9, 2, mild)).toBe(0);
        // 2 mm an hour of melt at 10 °C, 50 %, no wind.
        expect(ownSnowAfter(20, 3, 0, mild)).toBeCloseTo(20 - (2 * THAW_SPEED * 3) / 3600);
        expect(ownSnowAfter(1, 60, 0, mild)).toBe(0);
    });

    it("holds in a still cold air without anything falling, and goes slowly in a dry wind", () => {
        expect(ownSnowAfter(20, 60, 0, { ...frost, humidity: 100 })).toBeCloseTo(20);
        expect(ownSnowAfter(20, 60, 0, { temperature: -5, humidity: 20, windSpeed: 30 })).toBeLessThan(20);
    });

    it("stays as it is while the air of the city is not known", () => {
        expect(ownSnowAfter(20, 60, 5, undefined)).toBe(20);
        expect(ownSnowAfter(20, 60, 5, { temperature: -5, humidity: undefined, windSpeed: undefined })).toBe(20);
        expect(ownSnowAfter(20, Number.NaN, 5, frost)).toBe(20);
    });
});

describe("the cycle of a player's own city after an absence", () => {
    it("goes on from where it was: the ice towards the cold of now, the snow melted in a mild air", () => {
        const kept = { frost: 0.8, ice: 0.6, wet: 0, snowMm: 20 };
        const target = { frost: 0, ice: 0, wet: 0 };
        const mild = { temperature: 8, humidity: 70, windSpeed: 10 };
        const minute = cycleAfterAbsence(kept, 30, target, 0, mild);
        expect(minute.ice).toBeGreaterThan(0);
        expect(minute.ice).toBeLessThan(kept.ice);
        expect(minute.snowMm).toBeGreaterThan(0);
        const day = cycleAfterAbsence(kept, 24 * 3600, target, 0, mild);
        expect(day.ice).toBe(0);
        expect(day.snowMm).toBeLessThan(minute.snowMm);
    });

    it("keeps the snow of the city when its air is not known, instead of starting again from bare ground", () => {
        const kept = { frost: 0, ice: 0, wet: 0, snowMm: 12 };
        expect(cycleAfterAbsence(kept, 3600, { frost: 0, ice: 0, wet: 0 }, 0, undefined).snowMm).toBe(12);
    });
});
