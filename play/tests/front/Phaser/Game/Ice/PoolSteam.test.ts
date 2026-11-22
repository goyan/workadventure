import { describe, expect, it } from "vitest";
import { steamingPools, steamOver } from "@wa/front/Phaser/Game/Ice/FrozenPoolsView";

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

    it("rises from a painted pool whole, its rows of cells put back together", () => {
        const painted = { depthPx: 32, hot: true };
        const row = (x: number, y: number, width: number) => ({ x, y, width, height: 8, painted });
        const pools = steamingPools([
            row(16, 0, 32),
            row(8, 8, 48),
            row(8, 16, 48),
            // Another pool further down.
            row(200, 200, 16),
            { x: 400, y: 0, width: 64, height: 64 },
        ]);
        expect(pools).toHaveLength(3);
        expect(pools).toContainEqual({ x: 8, y: 0, width: 48, height: 24, painted });
        expect(pools).toContainEqual({ x: 200, y: 200, width: 16, height: 8, painted });
        expect(pools).toContainEqual({ x: 400, y: 0, width: 64, height: 64 });
    });
});
