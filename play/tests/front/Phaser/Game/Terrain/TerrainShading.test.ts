import { cellKey, withHeights } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    DEEP_WATER_PX,
    deepWaterAlpha,
    groundAlpha,
    raisedAlpha,
    SHORE_PX,
    slopeAlpha,
    slopeShade,
} from "../../../../../src/front/Phaser/Game/Terrain/TerrainShading";

describe("terrain shading", () => {
    it("is flat on flat ground, dark on a slope going down to the south-east, lit on one going up", () => {
        expect(slopeShade(undefined, 5, 5)).toBe(0);
        const pit = withHeights(undefined, new Map([[cellKey(5, 5), -32]]));
        // West of the pit the ground goes down towards the east: it turns its back to the light of the north-west.
        expect(slopeShade(pit, 4, 5)).toBeLessThan(0);
        expect(slopeShade(pit, 5, 4)).toBeLessThan(0);
        // East and south of it the ground comes back up: it faces the light.
        expect(slopeShade(pit, 6, 5)).toBeGreaterThan(0);
        expect(slopeShade(pit, 5, 6)).toBeGreaterThan(0);
        // The bottom of a symmetric pit is level.
        expect(slopeShade(pit, 5, 5)).toBe(0);
        // Never beyond -1 and 1, however steep.
        const cliff = withHeights(undefined, new Map([[cellKey(5, 5), -256]]));
        expect(slopeShade(cliff, 4, 5)).toBe(-1);
        expect(slopeShade(cliff, 6, 5)).toBe(1);
    });

    it("lightens the ground with its height over the map, never where it is dug", () => {
        expect(raisedAlpha(0)).toBe(0);
        expect(raisedAlpha(-32)).toBe(0);
        expect(raisedAlpha(1)).toBeLessThan(0.02);
        expect(raisedAlpha(32)).toBeLessThan(raisedAlpha(64));
        expect(raisedAlpha(96)).toBeCloseTo(0.3);
        expect(raisedAlpha(256)).toBeCloseTo(0.3);
    });

    it("darkens the ground with its depth, and a slope with its steepness", () => {
        expect(groundAlpha(0)).toBe(0);
        // No step at the rim of a hollow (seen in the game: every dug cell was a dark square).
        expect(groundAlpha(-1)).toBeLessThan(0.03);
        expect(groundAlpha(-8)).toBeGreaterThan(0.06);
        expect(groundAlpha(-32)).toBeGreaterThan(0.2);
        expect(groundAlpha(-32)).toBeLessThan(groundAlpha(-64));
        expect(groundAlpha(-96)).toBeCloseTo(0.5);
        expect(groundAlpha(-256)).toBeCloseTo(0.5);
        expect(slopeAlpha(0)).toBe(0);
        expect(slopeAlpha(1)).toBeCloseTo(0.25);
        expect(slopeAlpha(-0.5)).toBeCloseTo(0.125);
    });

    it("deepens the colour of the water with its depth, up to a full dark blue", () => {
        expect(SHORE_PX).toBe(3);
        expect(DEEP_WATER_PX).toBe(64);
        expect(deepWaterAlpha(0)).toBe(0);
        expect(deepWaterAlpha(8)).toBeLessThan(deepWaterAlpha(40));
        expect(deepWaterAlpha(64)).toBeCloseTo(0.8);
        expect(deepWaterAlpha(500)).toBeCloseTo(0.8);
    });
});
