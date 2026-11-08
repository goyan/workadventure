import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import { SnowGround } from "../../../../../src/front/Phaser/Game/Christmas/SnowGround";
import { MAP_LAYER_FLOOR_DEPTH } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";

describe("SnowGround", () => {
    it("draws the outdoor cells at 1/8 and stretches them over the map", () => {
        const scene = mockDeep<Phaser.Scene>();
        const canvas = mockDeep<Phaser.Textures.CanvasTexture>();
        const context = mockDeep<CanvasRenderingContext2D>();
        canvas.getContext.mockReturnValue(context);
        scene.textures.createCanvas.mockReturnValue(canvas);
        const image = mockDeep<Phaser.GameObjects.Image>();
        scene.add.image.mockReturnValue(image);
        new SnowGround(scene).draw(OutdoorGrid.fromWalls(320, 160, 32, []));
        expect(scene.textures.createCanvas.mock.calls[0].slice(1)).toEqual([40, 20]);
        expect(context.fillRect.mock.calls).toContainEqual([0, 0, 40, 4]);
        expect(canvas.setFilter.mock.calls).toHaveLength(1);
        expect(image.setDisplaySize.mock.calls[0]).toEqual([320, 160]);
        // Strictly below the floor tiles, so outdoor paving stays visible under its frost.
        expect(image.setDepth.mock.calls[0][0]).toBeLessThan(MAP_LAYER_FLOOR_DEPTH);
        expect(image.setDepth.mock.calls[0][0]).toBeGreaterThan(-2);
    });
});
