import { describe, expect, it } from "vitest";
import {
    MOST_WHITE,
    spumeShare,
    whitecapShare,
    whitecapWhite,
    windHeading,
} from "@wa/front/Phaser/Game/Terrain/Whitecaps";

describe("whitecapShare", () => {
    it("is nothing in a light wind, a little at force 4, more and more at force 5 and 6", () => {
        // Beaufort: force 2 up to 11 km/h, force 4 from 20 to 28, force 5 from 29 to 38, force 6 from 39 to 49.
        expect(whitecapShare(8)).toBe(0);
        expect(whitecapShare(undefined)).toBe(0);
        expect(whitecapShare(Number.NaN)).toBe(0);
        const force4 = whitecapShare(24);
        const force5 = whitecapShare(34);
        const force6 = whitecapShare(44);
        expect(force4).toBeGreaterThan(0.001);
        expect(force4).toBeLessThan(0.006);
        expect(force5).toBeGreaterThan(force4 * 2);
        expect(force6).toBeGreaterThan(force5 * 2);
        expect(force6).toBeLessThan(0.05);
        expect(whitecapShare(100000)).toBe(1);
    });
});

describe("windHeading", () => {
    it("is where the wind goes: south under a north wind, west under an east wind", () => {
        expect(windHeading(0)).toEqual({ x: 0, y: 1 });
        const east = windHeading(90);
        expect(east?.x).toBeCloseTo(-1, 5);
        expect(east?.y).toBeCloseTo(0, 5);
        expect(windHeading(undefined)).toBeUndefined();
    });
});

describe("whitecapWhite: the white of the sea past the measures of the law", () => {
    it("is the law up to 90 km/h, and its whitecaps never more than 45 % beyond (the white sheet is spumeShare)", () => {
        for (let kmh = 0; kmh <= 90; kmh += 5) {
            expect(whitecapWhite(whitecapShare(kmh)), `${kmh} km/h`).toBeCloseTo(whitecapShare(kmh), 9);
        }
        for (let kmh = 95; kmh <= 300; kmh += 5) {
            const white = whitecapWhite(whitecapShare(kmh));
            expect(white, `${kmh} km/h`).toBeLessThanOrEqual(MOST_WHITE);
            expect(white, `${kmh} km/h`).toBeGreaterThanOrEqual(whitecapWhite(whitecapShare(kmh - 5)));
        }
        expect(MOST_WHITE).toBe(0.45);
        expect(whitecapWhite(Number.NaN)).toBe(0);
    });
});

describe("spumeShare: the sea turns white in a hurricane (Holthuijsen, Powell and Pietrzak 2012)", () => {
    it("is nothing up to 30 m/s, where streaks of foam and spray take over from the whitecaps, whole at 40 m/s", () => {
        expect(spumeShare(undefined)).toBe(0);
        expect(spumeShare(Number.NaN)).toBe(0);
        expect(spumeShare(30 * 3.6)).toBe(0);
        expect(spumeShare(35 * 3.6)).toBeGreaterThan(0.2);
        expect(spumeShare(35 * 3.6)).toBeLessThan(0.8);
        expect(spumeShare(40 * 3.6)).toBe(1);
        expect(spumeShare(250)).toBe(1);
        for (let kmh = 100; kmh <= 150; kmh += 2) {
            expect(spumeShare(kmh), `${kmh} km/h`).toBeGreaterThanOrEqual(spumeShare(kmh - 2));
        }
    });
});
