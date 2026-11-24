import { describe, expect, it } from "vitest";
import { CELL_AREA_M2, LITRES_PER_M3, metresOf, TILE_AREA_M2 } from "../src/Terrain/Scale";

describe("terrain scale", () => {
    it("uses the scale of the lamps: a tile is 1.2 m² of floor", () => {
        expect(TILE_AREA_M2).toBe(1.2);
        // A cell is half a tile wide: a quarter of its area.
        expect(CELL_AREA_M2).toBeCloseTo(0.3);
        // A tile of altitude is as high as a tile is wide.
        expect(metresOf(-32)).toBeCloseTo(-Math.sqrt(1.2));
        expect(metresOf(0)).toBe(0);
        expect(LITRES_PER_M3).toBe(1000);
    });
});
