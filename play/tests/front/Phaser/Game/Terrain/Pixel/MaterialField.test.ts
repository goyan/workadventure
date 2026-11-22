import { describe, expect, it } from "vitest";
import { cellKey, Season, withHeights, withSoils } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { MeadowState } from "../../../../../../src/front/Phaser/Game/Terrain/MeadowState";
import {
    cellMaterial,
    outlineOf,
    pickMaterial,
} from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/MaterialField";
import type { CellInputs, Cover } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/MaterialField";
import { hash2 } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelNoise";
import type { Material } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";

/** A dug cell painted with a soil (its number in SOILS: 4 sand). */
function painted(soil: number): TerrainData {
    const dug = withHeights(undefined, new Map([[cellKey(4, 4), -32]]));
    return withSoils(dug, new Map([[cellKey(4, 4), soil]]));
}

/** A meadow of 8 × 8 tiles where every tile has these values. */
function meadow(values: { grass?: number; dryness?: number; fire?: number; ash?: number }): MeadowState {
    const state = new MeadowState();
    const tiles = 64;
    const fill = (value = 0) => new Uint8Array(tiles).fill(value);
    state.receive({
        width: 8,
        height: 8,
        grass: fill(values.grass),
        moisture: fill(),
        dryness: fill(values.dryness),
        fire: fill(values.fire),
        ash: fill(values.ash),
    });
    return state;
}

describe("what covers a cell of the terrain", () => {
    it("the grass of the meadow over the soil painted under it, the soil without grass", () => {
        expect(cellMaterial({ terrain: painted(4), meadow: meadow({ grass: 255 }) }, 4, 4)).toBe("grass");
        expect(cellMaterial({ terrain: painted(4), meadow: meadow({}) }, 4, 4)).toBe("sand");
        expect(cellMaterial({ terrain: painted(4) }, 4, 4)).toBe("sand");
    });

    it("snow over everything when it lies, embers where it burns, then ash, then straw", () => {
        expect(cellMaterial({ terrain: painted(4), meadow: meadow({ grass: 255 }), snowCoverAt: () => 1 }, 4, 4)).toBe(
            "snow",
        );
        expect(cellMaterial({ terrain: painted(1), meadow: meadow({ grass: 255, fire: 200 }) }, 4, 4)).toBe("ember");
        expect(cellMaterial({ terrain: painted(1), meadow: meadow({ ash: 200 }) }, 4, 4)).toBe("ash");
        expect(cellMaterial({ terrain: painted(1), meadow: meadow({ grass: 255, dryness: 255 }) }, 4, 4)).toBe("straw");
    });

    it("grass where nothing is painted nor grows", () => {
        expect(cellMaterial({ terrain: painted(4) }, 9, 9)).toBe("grass");
    });
});

describe("what covers a point between cells", () => {
    // Grass west of the cell 24 (x 384), sand from it on.
    const cells = (cellX: number): Material => (cellX >= 24 ? "sand" : "grass");
    const at = (x: number, y: number) => pickMaterial((cellX) => cells(cellX), x, y);

    it("the material of a cell at its centre", () => {
        expect(at(16 * 10 + 8, 100)).toBe("grass");
        expect(at(16 * 30 + 8, 100)).toBe("sand");
    });

    it("an irregular border, the same at every call", () => {
        const switches = new Set<number>();
        for (let y = 0; y < 320; y += 20) {
            let first: number | undefined;
            for (let x = 360; x < 410; x++) if (first === undefined && at(x, y) === "sand") first = x;
            expect(first).toBeDefined();
            switches.add(first ?? 0);
            expect(at(first ?? 0, y)).toBe("sand");
        }
        expect(switches.size).toBeGreaterThanOrEqual(3);
    });
});

describe("the line drawn where two materials meet", () => {
    it("dark on the grass side, light on the snow side, none on the side of the lighter material", () => {
        expect(outlineOf("grass", "sand")).toBe("dark");
        expect(outlineOf("sand", "grass")).toBeUndefined();
        expect(outlineOf("snow", "grass")).toBe("light");
        expect(outlineOf("grass", "grass")).toBeUndefined();
    });
});

describe("what covers a cell of the flat ground", () => {
    // A map without relief: 10 × 10 cells, the cells x ≥ 5 indoors, the cell 2,2 under a floor of the Carte tool, the
    // cells y ≥ 8 grass tiles of the map, the cell 3,3 clay.
    const clay = withSoils(undefined, new Map([[cellKey(3, 3), 3]]));
    const flat = (overrides: Partial<CellInputs> = {}): CellInputs => ({
        terrain: clay,
        outdoor: (cellX) => cellX < 5,
        paved: (cellX, cellY) => cellX === 2 && cellY === 2,
        mapGrass: (_cellX, cellY) => cellY >= 8,
        moistureAt: () => 0,
        waterDepthAt: () => 0,
        ...overrides,
    });

    it("nothing indoors nor on a floor of the Carte tool, even under the snow", () => {
        expect(cellMaterial(flat(), 6, 1)).toBe("none");
        expect(cellMaterial(flat(), 2, 2)).toBe("none");
        expect(cellMaterial(flat({ snowCoverAt: () => 1 }), 6, 1)).toBe("none");
        expect(cellMaterial(flat({ snowCoverAt: () => 1 }), 2, 2)).toBe("none");
    });

    it("the grass tiles of the map, nothing on the bare ground outdoors, snow over all of it in winter", () => {
        expect(cellMaterial(flat(), 1, 9)).toBe("grass");
        expect(cellMaterial(flat(), 1, 1)).toBe("none");
        expect(cellMaterial(flat({ snowCoverAt: () => 1 }), 1, 1)).toBe("snow");
    });

    it("grass where the ground is dug, even with nothing painted nor growing", () => {
        const dug = withHeights(undefined, new Map([[cellKey(1, 1), -32]]));
        expect(cellMaterial(flat({ terrain: dug }), 1, 1)).toBe("grass");
    });

    it("mud where clay is wet, as the walk slows down there", () => {
        expect(cellMaterial(flat(), 3, 3)).toBe("clay");
        expect(cellMaterial(flat({ waterDepthAt: () => 0.5 }), 3, 3)).toBe("mud");
        expect(cellMaterial(flat({ moistureAt: () => 0.6 }), 3, 3)).toBe("mud");
        expect(cellMaterial(flat({ moistureAt: () => 0.59 }), 3, 3)).toBe("clay");
    });
});

describe("the snow of the heights", () => {
    it("whitens a mount over the snow line of the season, not under it", () => {
        // A mount 200 px high: over the line of the winter (96) and of the autumn (160), under the summer's (224).
        const mount = withHeights(undefined, new Map([[cellKey(1, 1), 200]]));
        const inputs = (season: Season): CellInputs => ({ terrain: mount, snowLineSeason: season });
        expect(cellMaterial(inputs(Season.Winter), 1, 1)).toBe("snow");
        expect(cellMaterial(inputs(Season.Autumn), 1, 1)).toBe("snow");
        expect(cellMaterial(inputs(Season.Summer), 1, 1)).toBe("grass");
    });
});

describe("the border of what nothing covers", () => {
    it("follows the edges of the cells exactly: no grass over a floor of the Carte tool, no hole in the grass", () => {
        // A floor of the Carte tool from the cell 24 (x 384) on, grass west of it.
        const cell = (cellX: number): Cover => (cellX >= 24 ? "none" : "grass");
        for (let y = 0; y < 320; y += 7) {
            for (let x = 360; x < 384; x++) expect(pickMaterial(cell, x + 0.5, y + 0.5), `${x},${y}`).toBe("grass");
            for (let x = 384; x < 410; x++) expect(pickMaterial(cell, x + 0.5, y + 0.5), `${x},${y}`).toBe("none");
        }
    });
});

describe("a cell of a pool painted with the relief tool", () => {
    it("is left to the map: the pixel ground has no pool yet, and must not take it for a soil", () => {
        // The soils 7 to 14 are the styles of the pools (Pools.ts): none is a material of the pixel ground.
        for (let code = 7; code <= 14; code++) {
            expect(cellMaterial({ terrain: painted(code) }, 4, 4), `soil ${code}`).toBe("none");
            expect(cellMaterial({ terrain: painted(code), meadow: meadow({ grass: 255 }) }, 4, 4)).toBe("none");
        }
    });

    it("gives a material it knows for every soil a map may keep", () => {
        const known: Cover[] = ["earth", "meadow", "clay", "sand", "rock", "gravel", "none"];
        // 1 to 6 the soils, 7 to 14 the styles of the pools: all a map keeps.
        for (let code = 1; code <= 14; code++) {
            expect(known, `soil ${code}`).toContain(cellMaterial({ terrain: painted(code) }, 4, 4));
        }
    });
});

describe("the snow of the map coming", () => {
    it("covers the ground cell after cell as it thickens, not all at once at half", () => {
        const share = (snow: number) => {
            let snowy = 0;
            for (let x = 0; x < 40; x++) {
                for (let y = 0; y < 40; y++) {
                    if (cellMaterial({ terrain: undefined, snowCoverAt: () => snow }, x, y) === "snow") snowy++;
                }
            }
            return snowy / 1600;
        };
        expect(share(0)).toBe(0);
        expect(share(0.3)).toBeGreaterThan(0.2);
        expect(share(0.3)).toBeLessThan(0.4);
        expect(share(0.7)).toBeGreaterThan(0.6);
        expect(share(1)).toBe(1);
    });

    it("whitens the cells the snow lies on, not their neighbours", () => {
        // The snow lies on the tile of 32 px at 32,32 only: the cells 2 and 3, on both axes.
        const snowCoverAt = (x: number, y: number) => (x >= 32 && x < 64 && y >= 32 && y < 64 ? 1 : 0);
        expect(cellMaterial({ terrain: undefined, snowCoverAt }, 2, 2)).toBe("snow");
        expect(cellMaterial({ terrain: undefined, snowCoverAt }, 3, 3)).toBe("snow");
        expect(cellMaterial({ terrain: undefined, snowCoverAt }, 4, 2)).toBe("grass");
        expect(cellMaterial({ terrain: undefined, snowCoverAt }, 2, 1)).toBe("grass");
    });

    it("comes by the same patches wherever half of it lies: a cell whitens at its own share of the snow", () => {
        for (let x = 0; x < 30; x++) {
            for (let y = 0; y < 30; y++) {
                const snowy = cellMaterial({ terrain: undefined, snowCoverAt: () => 0.5 }, x, y) === "snow";
                expect(snowy, `${x},${y}`).toBe(hash2(x * 7 + 13, y * 5 + 3) < 0.5);
            }
        }
    });
});
