import { describe, expect, it } from "vitest";
import { spreadPoolColours, texel } from "@wa/front/Phaser/Game/Terrain/GroundSplat";

describe("spreadPoolColours", () => {
    it("gives the cell of an inner corner the colours of the pool beside it, not its shape", () => {
        const columns = 3;
        const rows = 3;
        const data = new Uint8ClampedArray(columns * 4 * rows * 2 * 4);
        const poolCells = [0, 1, 3];
        for (const cell of poolCells) {
            data.set([255, 48, 0], texel(5, cell, columns, rows));
            data.set([10, 120, 200], texel(6, cell, columns, rows));
            data.set([230, 220, 200], texel(7, cell, columns, rows));
        }

        spreadPoolColours(data, columns, rows);

        const corner = 4;
        expect([...data.slice(texel(5, corner, columns, rows), texel(5, corner, columns, rows) + 3)]).toEqual([
            0, 48, 0,
        ]);
        expect([...data.slice(texel(6, corner, columns, rows), texel(6, corner, columns, rows) + 3)]).toEqual([
            10, 120, 200,
        ]);
        expect([...data.slice(texel(7, corner, columns, rows), texel(7, corner, columns, rows) + 3)]).toEqual([
            230, 220, 200,
        ]);
        const far = 8;
        expect([...data.slice(texel(6, far, columns, rows), texel(6, far, columns, rows) + 3)]).toEqual([0, 0, 0]);
    });
});

describe("the picture of the weights", () => {
    it("lays its packs four across: the ice of the server is the first of a third row", () => {
        const columns = 5;
        const rows = 3;
        expect(texel(0, 0, columns, rows)).toBe(0);
        expect(texel(4, 0, columns, rows)).toBe(rows * columns * 4 * 4);
        expect(texel(8, 0, columns, rows)).toBe(2 * rows * columns * 4 * 4);
        expect(texel(8, 7, columns, rows)).toBe((2 * rows + 1) * columns * 4 * 4 + 2 * 4);
    });
});
