import { describe, expect, it } from "vitest";
import { soilStrokeChanges } from "../src/Terrain/TerrainBrush";
import { cellKey, soilAt, withHeights, withSoils } from "../src/Terrain/TerrainGrid";
import { MUD_PACE, SAND_PACE, SOILS, soilCode, soilDrinks, soilName, soilPace } from "../src/Terrain/Soils";
import { gridBoundsOf, WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { TerrainData } from "../src/types";

const nothing: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };

describe("the soils of a map", () => {
    it("names six soils, kept as a number in the map (0: not painted)", () => {
        expect(SOILS).toEqual(["earth", "meadow", "clay", "sand", "rock", "gravel"]);
        expect(soilCode("earth")).toBe(1);
        expect(soilCode("gravel")).toBe(6);
        expect(soilName(3)).toBe("clay");
        expect(soilName(0)).toBeUndefined();
        expect(soilName(7)).toBeUndefined();
    });

    it("keeps the soil of a cell, apart from its height, and forgets a map wiped clean", () => {
        const dug = withHeights(undefined, new Map([[cellKey(2, 3), -8]]));
        const painted = withSoils(dug, new Map([[cellKey(2, 3), soilCode("rock")]]));
        expect(soilAt(painted, 2, 3)).toBe(soilCode("rock"));
        expect(soilAt(painted, 3, 3)).toBe(0);
        expect(soilAt(undefined, 2, 3)).toBe(0);
        expect(soilAt(dug, 2, 3)).toBe(0);
        expect(TerrainData.safeParse(painted).success).toBe(true);
        const wiped = withSoils(painted, new Map([[cellKey(2, 3), 0]]));
        expect(wiped.soil).toBeUndefined();
        expect(wiped.chunks).toEqual(dug.chunks);
        // A soil the map does not know is not painted.
        expect(soilAt(withSoils(undefined, new Map([[cellKey(0, 0), 99]])), 0, 0)).toBe(0);
    });

    it("paints the whole disc of the brush, where the ground may be edited", () => {
        const rock = soilCode("rock");
        const changes = soilStrokeChanges(undefined, [{ x: 200, y: 200 }], 4, rock, () => true);
        expect(changes.get(cellKey(12, 12))).toBe(rock);
        expect(changes.get(cellKey(15, 12))).toBe(rock); // 48 px away, radius 64
        expect(changes.has(cellKey(17, 12))).toBe(false); // 80 px away
        expect(soilStrokeChanges(undefined, [{ x: 200, y: 200 }], 4, rock, () => false).size).toBe(0);
        // What is already of this soil is not sent again.
        const painted = withSoils(undefined, changes);
        expect(soilStrokeChanges(painted, [{ x: 200, y: 200 }], 4, rock, () => true).size).toBe(0);
        expect(soilStrokeChanges(painted, [{ x: 200, y: 200 }], 4, 0, () => true).size).toBe(changes.size);
    });
});

describe("the water on the soils", () => {
    it("says how much of the absorption of the map each soil drinks, on the flat and in a hollow", () => {
        // Not painted: as before the soils, the flat ground drinks and a hollow keeps its water.
        expect(soilDrinks(0, false)).toBe(1);
        expect(soilDrinks(0, true)).toBe(0);
        expect(soilDrinks(soilCode("earth"), false)).toBe(1);
        expect(soilDrinks(soilCode("meadow"), true)).toBe(0);
        expect(soilDrinks(soilCode("rock"), false)).toBe(0);
        expect(soilDrinks(soilCode("clay"), false)).toBeLessThan(0.5);
        expect(soilDrinks(soilCode("clay"), true)).toBe(0);
        expect(soilDrinks(soilCode("sand"), false)).toBeGreaterThan(1);
        expect(soilDrinks(soilCode("sand"), true)).toBeGreaterThan(1);
        expect(soilDrinks(soilCode("gravel"), true)).toBeGreaterThan(1);
    });

    const pond = (soil: number): WaterGrid => {
        const dug = withHeights(undefined, new Map([[cellKey(0, 0), -16]]));
        const terrain = soil ? withSoils(dug, new Map([[cellKey(0, 0), soil]])) : dug;
        const grid = new WaterGrid(terrain, gridBoundsOf(terrain, []));
        grid.step({ ...nothing, rainPx: 10 });
        return grid;
    };

    it("keeps a pond on rock, on clay and on a ground not painted, and drinks it through sand", () => {
        for (const soil of [0, soilCode("rock"), soilCode("clay"), soilCode("earth")]) {
            const grid = pond(soil);
            expect(grid.step({ ...nothing, absorptionPx: 1 }).absorptionPx).toBe(0);
            expect(grid.depthAt(0, 0)).toBeCloseTo(10);
        }
        const sand = pond(soilCode("sand"));
        const tally = sand.step({ ...nothing, absorptionPx: 1 });
        expect(tally.absorptionPx).toBeGreaterThan(1);
        expect(sand.depthAt(0, 0)).toBeLessThan(9);
    });

    it("lets a flood stand on rock, and go down on the ground around", () => {
        const dug = withHeights(undefined, new Map([[cellKey(0, 0), -8]]));
        const terrain = withSoils(dug, new Map([[cellKey(3, 0), soilCode("rock")]]));
        const grid = new WaterGrid(terrain, gridBoundsOf(terrain, []));
        for (let step = 0; step < 600; step++) grid.step({ ...nothing, flows: [{ cellX: 0, cellY: 0, px: 30 }] });
        const rockBefore = grid.depthAt(3, 0);
        const earthBefore = grid.depthAt(-3, 0);
        expect(rockBefore).toBeGreaterThan(1);
        expect(earthBefore).toBeGreaterThan(1);
        // One step of absorption alone, larger than what the water moves in a step.
        grid.step({ ...nothing, absorptionPx: 0.5 });
        expect(rockBefore - grid.depthAt(3, 0)).toBeLessThan(earthBefore - grid.depthAt(-3, 0));
    });
});

describe("walking on the soils", () => {
    it("slows one down on sand, and in the mud of a clay the water lies on", () => {
        expect(soilPace(0, 0)).toBe(1);
        expect(soilPace(soilCode("earth"), 5)).toBe(1);
        expect(soilPace(soilCode("rock"), 5)).toBe(1);
        expect(soilPace(soilCode("sand"), 0)).toBe(SAND_PACE);
        expect(soilPace(soilCode("clay"), 0)).toBe(1);
        expect(soilPace(soilCode("clay"), 0.4)).toBe(1);
        expect(soilPace(soilCode("clay"), 2)).toBe(MUD_PACE);
        // A clay wet through by the rain is mud too, without any water lying on it.
        expect(soilPace(soilCode("clay"), 0, 0.5)).toBe(1);
        expect(soilPace(soilCode("clay"), 0, 0.7)).toBe(MUD_PACE);
        expect(MUD_PACE).toBeLessThan(SAND_PACE);
        expect(SAND_PACE).toBeLessThan(1);
    });
});
