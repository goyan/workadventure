import { describe, expect, it } from "vitest";
import {
    DOWNPOUR_DEFAULT_TILES,
    DOWNPOUR_MAX_TILES,
    DOWNPOUR_MIN_TILES,
    downpourTiles,
} from "../src/Catastrophe/Downpour";
import { Meadow } from "../src/Terrain/Meadow";
import { soilCode } from "../src/Terrain/Soils";
import { cellKey, withHeights, withSoils } from "../src/Terrain/TerrainGrid";
import { gridBoundsOf, WaterGrid } from "../src/Terrain/WaterGrid";

describe("downpourTiles", () => {
    it("keeps a size within its bounds, and takes the usual one for what is not a number", () => {
        expect(downpourTiles(5)).toBe(5);
        expect(downpourTiles(0)).toBe(DOWNPOUR_MIN_TILES);
        expect(downpourTiles(999)).toBe(DOWNPOUR_MAX_TILES);
        expect(downpourTiles(Number.NaN)).toBe(DOWNPOUR_DEFAULT_TILES);
    });
});

describe("WaterGrid.rainOn", () => {
    const cells: [string, number][] = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) cells.push([cellKey(x, y), -32]);
    const hollow = withHeights(undefined, new Map(cells));
    const grid = (): WaterGrid => new WaterGrid(hollow, gridBoundsOf(hollow, []));

    it("lays the rain on the cells of the disc only", () => {
        const water = grid();
        const laid = water.rainOn(10, 10, 3, 2);
        expect(water.depthAt(10, 10)).toBe(2);
        expect(water.depthAt(13, 10)).toBe(2);
        expect(water.depthAt(14, 10)).toBe(0);
        expect(water.depthAt(13, 13)).toBe(0);
        expect(laid).toBeCloseTo(water.totalPx());
    });

    it("rains on every cell without a radius, and even when its centre is outside the grid", () => {
        const water = grid();
        water.rainOn(-500, -500, undefined, 1);
        expect(water.depthAt(0, 0)).toBe(1);
        expect(water.depthAt(19, 19)).toBe(1);
        const edge = grid();
        expect(edge.rainOn(-1000, 10, 2, 1)).toBe(0);
    });

    it("never fills a cell over the highest level of the water, and lays nothing that is not a number", () => {
        const water = grid();
        water.rainOn(10, 10, 1, 10_000);
        expect(water.depthAt(10, 10)).toBeLessThanOrEqual(32 + water.maxSurface());
        expect(water.rainOn(10, 10, 1, 10_000)).toBe(0);
        expect(water.rainOn(10, 10, 1, Number.NaN)).toBe(0);
    });
});

describe("Meadow.soak", () => {
    const size = { width: 12, height: 5 };

    it("soaks the tiles of the disc, and all of them without a radius", () => {
        const meadow = new Meadow(size, undefined, undefined);
        expect(meadow.soak(5, 2, 1)).toBe(true);
        expect(meadow.moistureAt(5, 2)).toBe(1);
        expect(meadow.moistureAt(6, 2)).toBe(1);
        expect(meadow.moistureAt(6, 3)).toBe(0);
        expect(meadow.moistureAt(8, 2)).toBe(0);
        expect(meadow.soak(5, 2, 1)).toBe(false);
        meadow.soak(0, 0, undefined);
        expect(meadow.moistureAt(11, 4)).toBe(1);
    });

    it("leaves dry a soil that holds no water", () => {
        const rock = withSoils(
            undefined,
            new Map([0, 1].flatMap((y) => [0, 1].map((x) => [cellKey(x, y), soilCode("rock")] as [string, number]))),
        );
        const meadow = new Meadow(size, rock, undefined);
        meadow.soak(0, 0, 2);
        expect(meadow.moistureAt(0, 0)).toBe(0);
        expect(meadow.moistureAt(1, 0)).toBe(1);
    });
});
