import { cellKey, heightOfMetres, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { levelReadingAt, pipetteLevelMetres } from "../../../../../src/front/Phaser/Game/Terrain/WaterLevelPipette";

const water = (basin: TerrainData | undefined, depths: Record<string, number> = {}) => ({
    basin: () => basin,
    settledDepthAt: (x: number, y: number) => depths[`${Math.floor(x / 16)},${Math.floor(y / 16)}`] ?? 0,
});

describe("pipetteLevelMetres", () => {
    it("takes the surface of the water where there is water, to hold a lake at its level", () => {
        expect(pipetteLevelMetres({ ground: -3.6, surface: -1.2, depth: 2.4 }, false)).toBe(-1.2);
    });

    it("takes the ground where it is dry, to fill a hollow up to that rim", () => {
        expect(pipetteLevelMetres({ ground: -3.6 }, false)).toBe(-3.6);
    });

    it("takes the ground under the water when asked (Alt)", () => {
        expect(pipetteLevelMetres({ ground: -3.6, surface: -1.2, depth: 2.4 }, true)).toBe(-3.6);
    });

    it("stays within the levels a source may hold, rounded inwards", () => {
        // -256 px is -8.76 m: -8.8 would be saved as -8.76 and shown as -8.8; -8.7 is within.
        expect(pipetteLevelMetres({ ground: -8.8 }, false)).toBe(-8.7);
        // 512 px is 17.53 m.
        expect(pipetteLevelMetres({ ground: 2, surface: 17.6, depth: 15.6 }, false)).toBe(17.5);
    });
});

describe("levelReadingAt", () => {
    it("reads the ground and the water as the floors badge does, on a map without relief too", () => {
        expect(levelReadingAt(undefined, { x: 8, y: 8 }, water(undefined, { "0,0": heightOfMetres(1.2) }))).toEqual({
            ground: 0,
            surface: 1.2,
            depth: 1.2,
            roughness: 0.03,
        });
        const relief = withHeights(undefined, new Map([[cellKey(2, 0), heightOfMetres(-3.6)]]));
        expect(levelReadingAt(relief, { x: 40, y: 8 }, water(relief))).toMatchObject({ ground: -3.6 });
        expect(levelReadingAt(relief, { x: 40, y: 8 }, water(relief))).not.toHaveProperty("surface");
    });
});
