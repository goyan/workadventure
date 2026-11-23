import { describe, expect, it } from "vitest";
import { SLOPE_PACK, texel, waterLevels, writeSlopes } from "@wa/front/Phaser/Game/Terrain/GroundSplat";

/**
 * The slope of the surface of the water, worked out on the processor and told to the water shader (SLOPE_PACK: green
 * east, blue south, 128 level, 127 a slope of 1), which lights a face of water by it (waterFacing).
 */
describe("slope of the water", () => {
    const columns = 5;
    const rows = 3;
    /** The surface of the water over each cell, from its ground (dug: negative) and its depth, as the view reads them. */
    const slopes = (ground: number[], depth: number[]): { east: number[]; south: number[] } => {
        const data = new Uint8ClampedArray(columns * 4 * rows * 3 * 4);
        ground.forEach((height, cell) => {
            const at = texel(3, cell, columns, rows);
            data[at] = Math.max(0, -height);
            data[at + 1] = Math.max(0, height);
        });
        const levels = new Float32Array(columns * rows);
        waterLevels(data, Float32Array.from(depth), levels, columns, rows);
        writeSlopes(data, levels, columns, rows);
        const east: number[] = [];
        const south: number[] = [];
        for (let cell = 0; cell < columns * rows; cell++) {
            east.push(data[texel(SLOPE_PACK, cell, columns, rows) + 1]);
            south.push(data[texel(SLOPE_PACK, cell, columns, rows) + 2]);
        }
        return { east, south };
    };

    it("leaves a level water level, whatever the ground under it", () => {
        const ground = [-60, -40, -55, -20, -60, -50, -30, -60, -45, -60, -60, -60, -35, -60, -40];
        const depth = ground.map((height) => -10.25 - height);
        const { east, south } = slopes(ground, depth);
        expect(east.every((byte) => byte === 128)).toBe(true);
        expect(south.every((byte) => byte === 128)).toBe(true);
    });

    it("tells a surface rising 8 px a cell (16 px) eastwards as a slope of one half", () => {
        const ground = new Array<number>(columns * rows).fill(-100);
        const depth = ground.map((_, cell) => 40 + 8 * (cell % columns));
        const { east, south } = slopes(ground, depth);
        // The middle cell: (56 - 40) / 32 = 0.5, 128 + 0.5 * 127.
        expect(east[1 * columns + 2]).toBe(192);
        expect(south[1 * columns + 2]).toBe(128);
    });

    it("finds no slope at a shore, where a cell around holds less than 2 px", () => {
        const ground = new Array<number>(columns * rows).fill(-100);
        const depth = ground.map((_, cell) => 40 + 8 * (cell % columns));
        depth[1 * columns + 3] = 1;
        const { east } = slopes(ground, depth);
        expect(east[1 * columns + 2]).toBe(128);
    });

    it("finds a level water everywhere without depths", () => {
        const data = new Uint8ClampedArray(columns * 4 * rows * 3 * 4).fill(7);
        writeSlopes(data, undefined, columns, rows);
        expect(data[texel(SLOPE_PACK, 7, columns, rows) + 1]).toBe(128);
        expect(data[texel(SLOPE_PACK, 7, columns, rows) + 2]).toBe(128);
    });
});
