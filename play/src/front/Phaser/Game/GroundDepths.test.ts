import { describe, expect, it } from "vitest";
import { DEPTH_SEASONAL_GROUND_INDEX, DEPTH_SNOW_GROUND_INDEX, DEPTH_TILE_INDEX } from "./DepthIndexes";
import { MAP_LAYER_FLOOR_DEPTH } from "./MapEditor/MapLayer/MapLayerCatalog";

describe("outside ground depths", () => {
    it("draws the snow over the grass, both between the map tiles and the floor tiles", () => {
        expect(DEPTH_TILE_INDEX).toBeLessThan(DEPTH_SEASONAL_GROUND_INDEX);
        expect(DEPTH_SEASONAL_GROUND_INDEX).toBeLessThan(DEPTH_SNOW_GROUND_INDEX);
        expect(DEPTH_SNOW_GROUND_INDEX).toBeLessThan(MAP_LAYER_FLOOR_DEPTH);
    });
});
