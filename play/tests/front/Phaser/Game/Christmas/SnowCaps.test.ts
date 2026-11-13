import { describe, expect, it, vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import { SnowCaps, type SnowEntity } from "../../../../../src/front/Phaser/Game/Christmas/SnowCaps";

const grid = OutdoorGrid.fromWalls(320, 320, 32, [
    { x: 64, y: 64, width: 160, height: 32 },
    { x: 64, y: 192, width: 160, height: 32 },
    { x: 64, y: 96, width: 32, height: 96 },
    { x: 192, y: 96, width: 32, height: 96 },
]);

function entity(x: number, y: number, collectionName = "Infogène Mobilier", texture = "bench"): SnowEntity {
    return {
        x,
        y,
        displayWidth: 32,
        displayHeight: 32,
        depth: 100,
        visible: true,
        texture: { key: texture },
        frame: { name: "0", width: 32, height: 32 },
        getPrefab: () => ({ collectionName, id: `${collectionName}:${texture}` }),
    };
}

const opaque = () => ({ width: 32, height: 32, alpha: new Uint8ClampedArray(32 * 32).fill(255) });

function setup(readPixels = vi.fn(opaque)) {
    const scene = mockDeep<Phaser.Scene>();
    scene.add.image.mockImplementation(() => mockDeep<Phaser.GameObjects.Image>());
    scene.add.rectangle.mockImplementation(() => mockDeep<Phaser.GameObjects.Rectangle>());
    scene.textures.createCanvas.mockImplementation((_key, width = 0, height = 0) => {
        const canvas = mockDeep<Phaser.Textures.CanvasTexture>();
        const context = mockDeep<CanvasRenderingContext2D>();
        context.createImageData.mockReturnValue({ data: new Uint8ClampedArray(width * height * 4) } as ImageData);
        canvas.getContext.mockReturnValue(context);
        return canvas;
    });
    return { scene, readPixels, caps: new SnowCaps(scene, readPixels) };
}

describe("SnowCaps", () => {
    it("leaves seasonal objects alone: their winter image already carries the snow", () => {
        const { scene, caps } = setup();
        const tree = {
            ...entity(0, 0, "Nature", "oak"),
            getPrefab: () => ({ collectionName: "Nature", id: "oak", seasonal: {} }),
        };
        caps.rebuild([tree, entity(32, 0)], grid);
        expect(scene.add.image.mock.calls).toHaveLength(1);
    });

    it("caps outdoor objects only", () => {
        const { scene, caps } = setup();
        caps.rebuild([entity(0, 0), entity(128, 128)], grid);
        expect(scene.add.image.mock.calls).toHaveLength(1);
        expect(scene.add.image.mock.calls[0].slice(0, 2)).toEqual([0, 0]);
    });

    it("skips walls and doors", () => {
        const { scene, caps } = setup();
        caps.rebuild(
            [entity(0, 0, "Carte Murs"), entity(0, 0, "Carte Portes"), entity(0, 0, "Infogène Murs fins")],
            grid,
        );
        expect(scene.add.image.mock.calls).toHaveLength(0);
        expect(scene.add.rectangle.mock.calls).toHaveLength(0);
    });

    it("frosts outdoor floors", () => {
        const { scene, caps } = setup();
        caps.rebuild([entity(0, 0, "Carte Sols"), entity(32, 0, "Infogène Sols")], grid);
        expect(scene.add.image.mock.calls).toHaveLength(0);
        expect(scene.add.rectangle.mock.calls).toEqual([
            [0, 0, 32, 32, 0xeef1fb, 0.35],
            [32, 0, 32, 32, 0xeef1fb, 0.35],
        ]);
    });

    it("skips unreadable textures", () => {
        const { scene, caps } = setup(
            vi.fn(() => {
                throw new Error("tainted canvas");
            }),
        );
        expect(() => caps.rebuild([entity(0, 0)], grid)).not.toThrow();
        expect(scene.add.image.mock.calls).toHaveLength(0);
    });

    it("caches one cap per texture", () => {
        const { scene, readPixels, caps } = setup();
        caps.rebuild([entity(0, 0), entity(32, 0)], grid);
        expect(readPixels).toHaveBeenCalledTimes(1);
        expect(scene.add.image.mock.calls).toHaveLength(2);
    });

    it("rebuild destroys the previous sprites", () => {
        const { scene, caps } = setup();
        caps.rebuild([entity(0, 0)], grid);
        const first = scene.add.image.mock.results[0].value as ReturnType<typeof mockDeep<Phaser.GameObjects.Image>>;
        caps.rebuild([entity(0, 0)], grid);
        expect(first.destroy.mock.calls).toHaveLength(1);
    });

    it("skips objects whose image is not loaded yet", () => {
        const { scene, readPixels, caps } = setup();
        caps.rebuild(
            [
                { ...entity(0, 0), visible: false },
                { ...entity(32, 0), texture: { key: "__MISSING" } },
            ],
            grid,
        );
        expect(scene.add.image.mock.calls).toHaveLength(0);
        expect(readPixels).not.toHaveBeenCalled();
    });

    it("fades its caps and frost, and gives new ones the current alpha", () => {
        const { scene, caps } = setup();
        caps.rebuild([entity(0, 0)], grid);
        const first = scene.add.image.mock.results[0].value as DeepMockProxy<Phaser.GameObjects.Image>;
        caps.setAlpha(0.4);
        expect(first.setAlpha.mock.lastCall).toEqual([0.4]);
        caps.rebuild([entity(32, 0), entity(0, 0, "Carte Sols")], grid);
        const cap = scene.add.image.mock.results[1].value as DeepMockProxy<Phaser.GameObjects.Image>;
        const frost = scene.add.rectangle.mock.results[0].value as DeepMockProxy<Phaser.GameObjects.Rectangle>;
        expect(cap.setAlpha.mock.lastCall).toEqual([0.4]);
        expect(frost.setAlpha.mock.lastCall).toEqual([0.4]);
    });
});
