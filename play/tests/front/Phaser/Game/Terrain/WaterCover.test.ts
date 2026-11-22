import { describe, expect, it } from "vitest";
import {
    filmCover,
    FLOW_PACK,
    FLOW_UNITS,
    SHORE_FILM_PX,
    texel,
    waterShoreLevel,
    writeFlow,
    writeWater,
} from "@wa/front/Phaser/Game/Terrain/GroundSplat";

/**
 * The water shader draws a point when the level of the shore there, bent by a drifting noise, reaches one half.
 * `waterShoreLevel` is the TypeScript twin of that rule of the GLSL (WATER_FRAG), read from the same channels: it
 * models the shader, it does not run it.
 */
describe("water cover", () => {
    const columns = 3;
    const rows = 1;
    const packed = (wet: number[]): Uint8ClampedArray => {
        const data = new Uint8ClampedArray(columns * 4 * rows * 3 * 4);
        writeWater(data, Uint8Array.from(wet), columns, rows);
        return data;
    };
    const depthByte = (data: Uint8ClampedArray, cell: number): number => data[texel(2, cell, columns, rows) + 2];
    const presentByte = (data: Uint8ClampedArray, cell: number): number => data[texel(8, cell, columns, rows) + 2];

    it("marks every cell that holds water, however thin, apart from its depth", () => {
        const data = packed([1, 0, 40]);

        expect(presentByte(data, 0)).toBe(255);
        expect(presentByte(data, 1)).toBe(0);
        expect(presentByte(data, 2)).toBe(255);
        expect(depthByte(data, 0)).toBe(2);
        expect(depthByte(data, 2)).toBe(80);
    });

    it("says whether there is any water", () => {
        const data = new Uint8ClampedArray(columns * 4 * rows * 3 * 4);

        expect(writeWater(data, new Uint8Array(columns * rows), columns, rows)).toBe(false);
        expect(writeWater(data, Uint8Array.from([0, 3, 0]), columns, rows)).toBe(true);
    });

    it("draws a film of a few centimetres of water inside its cell, as a lake", () => {
        // 1 to 5 px of water (3 to 17 cm), at the centre of its cell: covered without any help of the noise.
        for (const px of [1, 2, 3, 5]) {
            const data = packed([px, px, px]);
            const level = waterShoreLevel(depthByte(data, 1) / 255, presentByte(data, 1) / 255);
            expect(level).toBeGreaterThanOrEqual(0.5);
        }
    });

    it("keeps the shore of a deep lake where it was", () => {
        // The depth smoothed half way to a dry cell: deep water reaches past the edge of its cell, as before.
        const half = (64 * 255) / 128 / 2 / 255;
        expect(waterShoreLevel(half, 0.5)).toBe(1);
        // Half way to a dry cell, a thin film stops at the edge of its own cell.
        expect(waterShoreLevel(1 / 255, 0.5)).toBe(0.5);
        expect(waterShoreLevel(0, 0)).toBe(0);
    });
});

describe("running water", () => {
    it("tells the shader the current of each cell, still in the middle of its bytes", () => {
        const columns = 3;
        const rows = 1;
        const data = new Uint8ClampedArray(columns * 4 * rows * 3 * 4);
        writeFlow(data, Float32Array.from([0, 0, 1, -0.5, 9, -9]), columns, rows);
        const read = (cell: number): number[] => {
            const at = texel(FLOW_PACK, cell, columns, rows);
            return [(data[at] - 128) / FLOW_UNITS, (data[at + 1] - 128) / FLOW_UNITS];
        };
        expect(read(0)).toEqual([0, 0]);
        expect(read(1)).toEqual([1, -0.5]);
        // Beyond what a byte holds, as fast as it tells.
        expect(read(2)[0]).toBeCloseTo(127 / FLOW_UNITS, 5);
        expect(read(2)[1]).toBeCloseTo(-127 / FLOW_UNITS, 5);
        writeFlow(data, undefined, columns, rows);
        expect(read(1)).toEqual([0, 0]);
    });

    it("reads as water on any ground once it runs, clearer than a film lying still, and a lake is as before", () => {
        const still = filmCover(1, 0);
        const running = filmCover(1, 1);
        expect(running).toBeGreaterThan(still + 0.1);
        expect(filmCover(1, 0.25)).toBeGreaterThan(still);
        expect(filmCover(SHORE_FILM_PX, 0)).toBe(1);
        expect(filmCover(64, 2)).toBe(1);
    });
});
