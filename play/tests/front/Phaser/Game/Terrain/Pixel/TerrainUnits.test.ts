import { describe, expect, it } from "vitest";
import { Season, TERRAIN_CELL, TERRAIN_CHUNK, TILE_PX } from "@workadventure/map-editor";
import * as units from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/TerrainUnits";
import { SWIM_DEPTH_PX } from "../../../../../../src/front/Phaser/Game/Water/WaterZones";

describe("the units the terrain is drawn with, copied so that its worker loads nothing heavy", () => {
    it("are those of the map editor", () => {
        expect(units.TERRAIN_CELL).toBe(TERRAIN_CELL);
        expect(units.TERRAIN_CHUNK).toBe(TERRAIN_CHUNK);
        expect(units.TILE_PX).toBe(TILE_PX);
        expect(units.SPRING).toBe(Season.Spring);
        expect(units.SUMMER).toBe(Season.Summer);
        expect(units.AUTUMN).toBe(Season.Autumn);
        expect(units.WINTER).toBe(Season.Winter);
    });

    it("are those of the swim", () => {
        expect(units.SWIM_DEPTH_PX).toBe(16);
        expect(SWIM_DEPTH_PX).toBe(units.SWIM_DEPTH_PX);
    });
});
