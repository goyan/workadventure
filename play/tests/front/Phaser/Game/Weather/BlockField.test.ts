import { describe, expect, it } from "vitest";
import { cloudPatches } from "../../../../../src/front/Phaser/Game/Weather/Clouds";
import { fieldLevels, fogBlocks, outdoorCells } from "../../../../../src/front/Phaser/Game/Weather/WeatherFrame";
import { paintField } from "../../../../../src/front/Phaser/Game/Weather/BlockSurface";

describe("fieldLevels and outdoorCells", () => {
    it("give each outdoor cell the thickness the blocks of the runs have there, walls cutting the outside in bands", () => {
        const size = 32;
        const area = { x: 0, y: 0, columns: 200, rows: 120 };
        const view = { x: 0, y: 0, width: 200 * size, height: 120 * size };
        // Three outdoor runs a row, one tile high, like the team map cut by its buildings.
        const runs = [];
        for (let y = 0; y < view.height; y += size) {
            for (const [x, width] of [
                [0, 1920],
                [2048, 2560],
                [4736, 1664],
            ]) {
                runs.push({ x, y, width, height: size });
            }
        }
        const patches = cloudPatches(42_000, view, 0.8, false);
        const levels = fieldLevels(area, size, patches);
        const outdoor = outdoorCells(area, size, runs);
        const expected = new Uint8Array(area.columns * area.rows);
        for (const block of fogBlocks(runs, patches, size)) {
            for (let x = block.x; x < block.x + block.width; x += size) {
                expected[(block.y / size) * area.columns + x / size] = block.level;
            }
        }
        const masked = levels.map((level, index) => (outdoor[index] ? level : 0));
        expect(Array.from(masked)).toEqual(Array.from(expected));
        // The cells between the runs are not outdoor.
        expect(outdoor[59]).toBe(1);
        expect(outdoor[60]).toBe(0);
    });
});

describe("paintField", () => {
    const area = { x: 0, y: 0, columns: 4, rows: 1 };
    const pixel = (pixels: Uint8ClampedArray, column: number) => Array.from(pixels.slice(column * 4, column * 4 + 4));

    it("paints the outdoor cells only, the field moved by whole cells (the shadow of a cloud)", () => {
        const pixels = new Uint8ClampedArray(4 * 4);
        // A field one cell wider on each side than the canvas, a cloud on its second cell (the first of the canvas).
        const field = { x: -16, y: 0, columns: 6, rows: 1 };
        const levels = Uint8Array.from([0, 8, 0, 0, 0, 0]);
        const outdoor = Uint8Array.from([1, 1, 1, 0]);
        paintField(pixels, area, 16, field, levels, outdoor, { columns: 1, rows: 0 }, 0x000000, () => 1);
        expect(pixel(pixels, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(pixels, 1)).toEqual([0, 0, 0, 255]);
        paintField(
            pixels,
            area,
            16,
            field,
            Uint8Array.from([0, 0, 0, 0, 8, 0]),
            outdoor,
            { columns: 0, rows: 0 },
            0xffffff,
            () => 1,
        );
        // Indoors (the fourth cell): nothing, even under a cloud.
        expect(pixel(pixels, 3)).toEqual([0, 0, 0, 0]);
    });
});
