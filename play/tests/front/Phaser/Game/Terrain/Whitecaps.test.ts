import { describe, expect, it } from "vitest";
import { whitecapShare, windHeading } from "../../../../../src/front/Phaser/Game/Terrain/Whitecaps";

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
