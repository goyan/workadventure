import { describe, expect, it, vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import type { SnowEntity } from "../../../../../src/front/Phaser/Game/Christmas/SnowCaps";
import { LeafPiles } from "../../../../../src/front/Phaser/Game/Autumn/LeafPiles";

const grid = OutdoorGrid.fromWalls(320, 320, 32, [
    { x: 64, y: 64, width: 160, height: 32 },
    { x: 64, y: 192, width: 160, height: 32 },
    { x: 64, y: 96, width: 32, height: 96 },
    { x: 192, y: 96, width: 32, height: 96 },
]);

function entity(x: number, y: number, collectionName = "Infogène Mobilier", seasonal?: object): SnowEntity {
    return {
        x,
        y,
        displayWidth: 32,
        displayHeight: 32,
        depth: 100,
        visible: true,
        texture: { key: `${collectionName}-tex` },
        frame: { name: "0", width: 32, height: 32 },
        getPrefab: () => ({ collectionName, id: `${collectionName}:x`, seasonal }),
    };
}

const opaque = () => ({ width: 32, height: 32, alpha: new Uint8ClampedArray(32 * 32).fill(255) });

function setup(readPixels = vi.fn(opaque)) {
    const scene = mockDeep<Phaser.Scene>();
    scene.add.image.mockImplementation(() => mockDeep<Phaser.GameObjects.Image>());
    scene.textures.createCanvas.mockImplementation((_key, width = 0, height = 0) => {
        const canvas = mockDeep<Phaser.Textures.CanvasTexture>();
        const context = mockDeep<CanvasRenderingContext2D>();
        context.createImageData.mockReturnValue({ data: new Uint8ClampedArray(width * height * 4) } as ImageData);
        canvas.getContext.mockReturnValue(context);
        return canvas;
    });
    return { scene, piles: new LeafPiles(scene, readPixels) };
}

describe("LeafPiles", () => {
    it("piles outdoor objects, trees included, at their foot", () => {
        const { scene, piles } = setup();
        piles.rebuild([entity(0, 0), entity(32, 0, "Nature", {})], grid);
        expect(scene.add.image.mock.calls).toHaveLength(2);
        // Central 70 % of a 32 px base, 4 px high, its bottom 2 px under the object's.
        expect(scene.add.image.mock.calls[0].slice(0, 2)).toEqual([5, 30]);
    });

    it("skips walls, doors, floors and indoor objects", () => {
        const { scene, piles } = setup();
        piles.rebuild(
            [
                entity(0, 0, "Carte Murs"),
                entity(0, 0, "Carte Portes"),
                entity(0, 0, "Infogène Murs fins"),
                entity(0, 0, "Carte Sols"),
                entity(0, 0, "Infogène Sols"),
                entity(128, 128),
            ],
            grid,
        );
        expect(scene.add.image.mock.calls).toHaveLength(0);
    });

    it("skips unreadable images and objects still loading", () => {
        const { scene, piles } = setup(
            vi.fn(() => {
                throw new Error("tainted canvas");
            }),
        );
        expect(() => piles.rebuild([entity(0, 0)], grid)).not.toThrow();
        const loading = { ...entity(32, 0), visible: false };
        piles.rebuild([loading], grid);
        expect(scene.add.image.mock.calls).toHaveLength(0);
    });

    it("sits at the foot of the visible tree, above a transparent margin", () => {
        const alpha = new Uint8ClampedArray(32 * 32).fill(255);
        alpha.fill(0, 13 * 32);
        const { scene, piles } = setup(vi.fn(() => ({ width: 32, height: 32, alpha })));
        piles.rebuild([entity(0, 0, "Nature", {})], grid);
        // Trunk ends on row 12: the 4 px pile's bottom sits 2 px under it.
        expect(scene.add.image.mock.calls[0].slice(0, 2)).toEqual([5, 11]);
    });

    it("reads each image once", () => {
        const readPixels = vi.fn(opaque);
        const { piles } = setup(readPixels);
        piles.rebuild([entity(0, 0), entity(0, 32)], grid);
        piles.rebuild([entity(0, 0)], grid);
        expect(readPixels.mock.calls).toHaveLength(1);
    });

    it("fades its piles, and gives new ones the current alpha", () => {
        const { scene, piles } = setup();
        piles.rebuild([entity(0, 0)], grid);
        const first = scene.add.image.mock.results[0].value as DeepMockProxy<Phaser.GameObjects.Image>;
        piles.setAlpha(0.6);
        expect(first.setAlpha.mock.lastCall).toEqual([0.6]);
        piles.rebuild([entity(32, 0)], grid);
        const next = scene.add.image.mock.results[1].value as DeepMockProxy<Phaser.GameObjects.Image>;
        expect(next.setAlpha.mock.lastCall).toEqual([0.6]);
    });
});
