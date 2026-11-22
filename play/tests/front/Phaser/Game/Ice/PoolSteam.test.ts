import { describe, expect, it } from "vitest";
import { steamOver } from "@wa/front/Phaser/Game/Ice/FrozenPoolsView";

const air = (temperature: number, windSpeed?: number) => ({ temperature, humidity: undefined, windSpeed });

describe("the steam of a heated pool", () => {
    it("is the densest in a deep dry cold, as at -33 °C and 63 % of humidity in Yakutsk", () => {
        expect(steamOver({ temperature: -33, humidity: 63, windSpeed: 2 })).toBeGreaterThan(0.9);
    });

    it("shows on a cool morning already, and thickens with the cold", () => {
        expect(steamOver(air(15))).toBe(0);
        expect(steamOver(air(5))).toBeGreaterThan(0);
        expect(steamOver(air(5))).toBeLessThan(steamOver(air(-1)));
        expect(steamOver(air(-1))).toBeLessThan(steamOver(air(-15)));
        expect(steamOver(air(-15))).toBe(1);
    });

    it("is thinned by the wind, never blown away", () => {
        expect(steamOver(air(-33, 50))).toBeCloseTo(0.4);
        expect(steamOver(air(-33, 15))).toBeCloseTo(0.7);
    });

    it("is none while the air is not known", () => {
        expect(steamOver(undefined)).toBe(0);
        expect(steamOver(air(Number.NaN))).toBe(0);
    });
});
