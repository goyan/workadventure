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
