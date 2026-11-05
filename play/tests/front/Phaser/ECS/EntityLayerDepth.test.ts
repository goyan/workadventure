import { describe, expect, it } from "vitest";
import {
    FLOOR_OBJECT_DEPTH,
    OVERHEAD_OBJECT_DEPTH,
    getLayerDepth,
} from "../../../../src/front/Phaser/ECS/EntityLayerDepth";
import { MAP_LAYER_FLOOR_DEPTH } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { DEPTH_OVERLAY_INDEX } from "../../../../src/front/Phaser/Game/DepthIndexes";

describe("getLayerDepth", () => {
    it("keeps floor objects over the map floors and under any character, wherever they are", () => {
        // A character's depth is the y of its feet: at least 16 on a map.
        for (const footY of [0, 500, 50_000]) {
            const depth = getLayerDepth("floor", footY);
            expect(depth).toBeGreaterThan(MAP_LAYER_FLOOR_DEPTH);
            expect(depth).toBeLessThan(16);
        }
    });

    it("keeps overhead objects over any character and under the overlay layers", () => {
        for (const footY of [0, 500, 50_000]) {
            const depth = getLayerDepth("overhead", footY);
            expect(depth).toBeGreaterThan(100_000);
            expect(depth).toBeLessThan(DEPTH_OVERLAY_INDEX);
        }
    });

    it("still orders the objects of a level by their foot", () => {
        expect(getLayerDepth("floor", 200)).toBeGreaterThan(getLayerDepth("floor", 100));
        expect(getLayerDepth("floor", 0)).toBe(FLOOR_OBJECT_DEPTH);
        expect(getLayerDepth("overhead", 0)).toBe(OVERHEAD_OBJECT_DEPTH);
    });
});
