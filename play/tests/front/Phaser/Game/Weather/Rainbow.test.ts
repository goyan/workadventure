import { describe, expect, it } from "vitest";
import { rainbowPlacement, rainbowStrength } from "../../../../../src/front/Phaser/Game/Weather/Rainbow";

describe("rainbowStrength", () => {
    it("shows a rainbow with rain under the sun, never at night", () => {
        expect(rainbowStrength(true, false, 20, 0)).toBe(1);
        expect(rainbowStrength(false, false, 20, 0)).toBe(0);
        expect(rainbowStrength(true, false, undefined, 0)).toBe(0);
        expect(rainbowStrength(true, false, -2, 0)).toBe(0);
        expect(rainbowStrength(true, false, 0, 0)).toBe(0);
    });

    it("keeps it visible where a true one would fade: near sunset, under a sun over 42°", () => {
        expect(rainbowStrength(true, false, 0.5, 0)).toBe(0.5);
        expect(rainbowStrength(true, false, 1.5, 0)).toBe(0.5);
        expect(rainbowStrength(true, false, 45, 0)).toBe(0.5);
        expect(rainbowStrength(true, false, 2.4, 0)).toBeCloseTo(0.8);
    });

    it("needs drops of water: none in a snowfall, fainter in a sleet", () => {
        expect(rainbowStrength(true, false, 20, 0, 1)).toBe(0);
        expect(rainbowStrength(true, false, 20, 0, 0.5)).toBeCloseTo(0.5);
        expect(rainbowStrength(true, false, 0.5, 0, 0.5)).toBeCloseTo(0.25);
    });

    it("is fainter in a storm and under a covered sky, never under half", () => {
        expect(rainbowStrength(true, true, 20, 0)).toBeCloseTo(0.5);
        expect(rainbowStrength(true, false, 20, 0.8)).toBeCloseTo(0.52);
        expect(rainbowStrength(true, false, 20, 0.5)).toBeCloseTo(0.7);
        expect(rainbowStrength(true, false, 0.5, 0.5)).toBe(0.5);
    });

    it("needs the sun to show: none under an overcast sky", () => {
        expect(rainbowStrength(true, false, 20, 0.85)).toBe(0);
        expect(rainbowStrength(true, false, 20, 1)).toBe(0);
    });
});

describe("rainbowPlacement", () => {
    const map = { width: 3200, height: 2000 };

    it("is fixed to the map, centred on it, and bows away from the sun", () => {
        const placement = rainbowPlacement(map, { azimuth: 180, elevation: 10 });
        expect(placement.x).toBe(1600);
        expect(placement.y).toBe(1000);
        expect(placement.radius).toBeCloseTo(700);
        // The sun in the south: the arc opens to the north (up on the map), as the shadows fall.
        expect(placement.direction.x).toBeCloseTo(0);
        expect(placement.direction.y).toBeCloseTo(-1);
    });

    it("is half a circle with the sun on the horizon, and a shorter arc as the sun rises", () => {
        expect(rainbowPlacement(map, { azimuth: 180, elevation: 0 }).span).toBeCloseTo(0);
        expect(rainbowPlacement(map, { azimuth: 180, elevation: 21 }).span).toBeCloseTo(Math.SQRT1_2);
        expect(rainbowPlacement(map, { azimuth: 180, elevation: 30 }).span).toBeGreaterThan(0.9);
        // Higher, the arc stays as it is at 30°: a true one would shrink to a dot near 42°.
        expect(rainbowPlacement(map, { azimuth: 180, elevation: 40 }).span).toBe(
            rainbowPlacement(map, { azimuth: 180, elevation: 30 }).span,
        );
    });

    it("is never wider than 50 tiles of radius", () => {
        expect(rainbowPlacement({ width: 20000, height: 20000 }, { azimuth: 0, elevation: 10 }).radius).toBe(1600);
    });
});
