import { describe, expect, it } from "vitest";
import { RELIEF_TILES_DEPTH } from "../../../../../src/front/Phaser/Game/Terrain/ReliefTiles";
import { FOAM_DEPTH } from "../../../../../src/front/Phaser/Game/Terrain/WaterFlowView";
import { AQUATIC_DEPTH } from "../../../../../src/front/Phaser/Game/Life/AquaticLifeView";

describe("the depths of what is drawn on the ground", () => {
    it("draws the foam and the life of the water over the ground of the terrain, never under it", () => {
        // At the same depth Phaser keeps the order the objects were added in: the foam, added first, went under.
        expect(RELIEF_TILES_DEPTH).toBeLessThan(FOAM_DEPTH);
        expect(RELIEF_TILES_DEPTH).toBeLessThan(AQUATIC_DEPTH);
    });
});
