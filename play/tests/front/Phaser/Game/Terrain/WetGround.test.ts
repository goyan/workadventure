import { describe, expect, it } from "vitest";
import {
    groundWetness,
    MOISTURE_CHANNEL,
    SURFACE_WET_MOISTURE,
    texel,
    wetColor,
    wetTone,
    WET_REFLECTANCE,
    writeFoam,
    writeMoisture,
} from "@wa/front/Phaser/Game/Terrain/GroundSplat";

/**
 * How the ground shader darkens a wet ground. `groundWetness` and `wetTone` are the TypeScript twins of the rules of
 * GROUND_FRAG, from the same constants: they model the shader, they do not run it.
 */
describe("wet ground", () => {
    it("darkens a soaked sand much more than a wet rock, and a wet grass hardly", () => {
        const sand = wetTone(WET_REFLECTANCE.sand, 1);
        const rock = wetTone(WET_REFLECTANCE.rock, 1);
        const grass = wetTone(WET_REFLECTANCE.grass, 1);
        // A wet beach sand reflects 0.45 of the dry one (the darker end of 0.4 to 0.6): a colour 0.70 as bright (sRGB).
        expect(WET_REFLECTANCE.sand).toBe(0.45);
        expect(sand).toBeCloseTo(Math.pow(0.45, 1 / 2.2), 3);
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
        // Once its surface is wet, a soil is soon at its full darkness: the reflectance falls fast with the first water.
        expect(groundWetness(0, 0.5, 0)).toBeGreaterThan(0.9);
        expect(groundWetness(0, SURFACE_WET_MOISTURE, 0)).toBeGreaterThan(0.75);
        // Under it, the moisture is in the depth of the soil: its surface is dry, it is drawn dry (a clear wet line).
        expect(groundWetness(0, SURFACE_WET_MOISTURE - 0.01, 0)).toBe(0);
        expect(groundWetness(0, 0.15, 0)).toBe(0);
    });

    it("saturates: wet from three sources is as dark as wet from one", () => {
        expect(groundWetness(1, 1, 1)).toBe(groundWetness(0, 0, 1));
        expect(wetTone(WET_REFLECTANCE.sand, groundWetness(1, 1, 1))).toBe(
            wetTone(WET_REFLECTANCE.sand, groundWetness(1, 0, 0)),
        );
    });
});

/** Hue (degrees), saturation and value of an sRGB colour. */
function hsv([r, g, b]: readonly number[]): { hue: number; saturation: number; value: number } {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    let hue = 0;
    if (chroma > 0) {
        if (max === r) hue = ((g - b) / chroma) % 6;
        else if (max === g) hue = (b - r) / chroma + 2;
        else hue = (r - g) / chroma + 4;
    }
    return { hue: (hue * 60 + 360) % 360, saturation: max > 0 ? chroma / max : 0, value: max };
}
const luminance = (colour: readonly number[]): number => {
    const [r, g, b] = colour.map((channel) => Math.pow(channel, 2.2));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("the colour of a wet ground", () => {
    // The sand of the game, dry, as the ground shader draws it (sRGB).
    const sand = [0.767, 0.703, 0.514];

    it("keeps its hue and deepens its colour: darker and more saturated, never greyer", () => {
        const wet = wetColor(sand, WET_REFLECTANCE.sand, 1);
        const dry = hsv(sand);
        const soaked = hsv(wet);
        expect(Math.abs(soaked.hue - dry.hue)).toBeLessThan(4);
        expect(soaked.saturation).toBeGreaterThan(dry.saturation + 0.03);
        expect(luminance(wet) / luminance(sand)).toBeCloseTo(WET_REFLECTANCE.sand, 2);
    });

    it("leaves a dry ground and a grey stone as they are in colour", () => {
        expect(wetColor(sand, WET_REFLECTANCE.sand, 0)).toEqual(sand);
        const stone = wetColor([0.5, 0.5, 0.5], WET_REFLECTANCE.rock, 1);
        expect(hsv(stone).saturation).toBeLessThan(0.001);
    });
});

describe("the moisture and the foam in the picture of the weights", () => {
    it("are kept in bytes of their own: the foam of the waves does not wipe the moisture of the soil", () => {
        const columns = 2;
        const rows = 1;
        const data = new Uint8ClampedArray(columns * 4 * rows * 3 * 4);
        writeMoisture(data, Uint8Array.from([200, 90]), columns, rows);
        writeFoam(data, Uint8Array.from([0, 5]), Uint8Array.from([0, 255]), columns, rows);
        const moistureByte = (cell: number): number => data[texel(9, cell, columns, rows) + MOISTURE_CHANNEL];
        expect(moistureByte(0)).toBe(200);
        expect(moistureByte(1)).toBe(90);
        expect(data[texel(9, 1, columns, rows)]).toBe(255);
    });
});
