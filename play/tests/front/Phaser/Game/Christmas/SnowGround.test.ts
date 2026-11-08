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

    it("covers the edge of a wall that touches the outside, never the room behind it", () => {
        const scene = mockDeep<Phaser.Scene>();
        const canvas = mockDeep<Phaser.Textures.CanvasTexture>();
        const context = mockDeep<CanvasRenderingContext2D>();
        canvas.getContext.mockReturnValue(context);
        scene.textures.createCanvas.mockReturnValue(canvas);
        scene.add.image.mockReturnValue(mockDeep<Phaser.GameObjects.Image>());
        // 6x6 cells of 8 px: a ring of walls (cells 1..4) around a room (cells 2..3).
        const walls = [
            { x: 8, y: 8, width: 32, height: 8 },
            { x: 8, y: 32, width: 32, height: 8 },
            { x: 8, y: 8, width: 8, height: 32 },
            { x: 32, y: 8, width: 8, height: 32 },
        ];
        new SnowGround(scene).draw(OutdoorGrid.fromWalls(48, 48, 8, walls));
        const snowy = new Set<string>();
        for (const [x, y, w, h] of context.fillRect.mock.calls) {
            for (let px = x; px < x + w; px++) for (let py = y; py < y + h; py++) snowy.add(`${px},${py}`);
        }
        // Walls start mid-cell on the map: the wall cell next to the outside gets snow (the wall image covers it).
        expect(snowy.has("1,1")).toBe(true);
        expect(snowy.has("4,2")).toBe(true);
        expect(snowy.has("2,2")).toBe(false);
        expect(snowy.has("3,3")).toBe(false);
    });
});
