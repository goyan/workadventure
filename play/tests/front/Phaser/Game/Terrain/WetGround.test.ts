import { describe, expect, it } from "vitest";
import { groundWetness, wetTone, WET_REFLECTANCE } from "@wa/front/Phaser/Game/Terrain/GroundSplat";

/**
 * How the ground shader darkens a wet ground. `groundWetness` and `wetTone` are the TypeScript twins of the rules of
 * GROUND_FRAG, from the same constants: they model the shader, they do not run it.
 */
describe("wet ground", () => {
    it("darkens a soaked sand much more than a wet rock, and a wet grass hardly", () => {
        const sand = wetTone(WET_REFLECTANCE.sand, 1);
        const rock = wetTone(WET_REFLECTANCE.rock, 1);
        const grass = wetTone(WET_REFLECTANCE.grass, 1);
        // The colours are sRGB: a reflectance of 0.55 of the dry one is a colour 0.76 as bright.
        expect(sand).toBeCloseTo(Math.pow(0.55, 1 / 2.2), 3);
        expect(sand).toBeLessThan(rock);
        expect(rock).toBeLessThan(grass);
        expect(grass).toBeGreaterThan(0.9);
        expect(wetTone(WET_REFLECTANCE.sand, 0)).toBe(1);
    });

    it("is wet from the moisture the server keeps, from the water over it and from the rain", () => {
        expect(groundWetness(0, 0, 0)).toBe(0);
        expect(groundWetness(0, 1, 0)).toBeCloseTo(1, 5);
        expect(groundWetness(0, 0, 1)).toBe(1);
        expect(groundWetness(0.4, 0, 0)).toBe(0.4);
        // A soil half wet is darker than half way: the reflectance falls fast with the first water.
        expect(groundWetness(0, 0.5, 0)).toBeGreaterThan(0.7);
    });

    it("saturates: wet from three sources is as dark as wet from one", () => {
        expect(groundWetness(1, 1, 1)).toBe(groundWetness(0, 0, 1));
        expect(wetTone(WET_REFLECTANCE.sand, groundWetness(1, 1, 1))).toBe(
            wetTone(WET_REFLECTANCE.sand, groundWetness(1, 0, 0)),
        );
    });
});
