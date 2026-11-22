import { describe, expect, it, vi } from "vitest";
import { FootprintLayer } from "../../../../../src/front/Phaser/Game/Christmas/FootprintLayer";
import { FOOTPRINT_FADE_MS } from "../../../../../src/front/Phaser/Game/Christmas/FootprintTrail";

function fakeImage() {
    const image = {
        alpha: 1,
        setRotation: vi.fn(() => image),
        setOrigin: vi.fn(() => image),
        setDisplaySize: vi.fn(() => image),
        setDepth: vi.fn(() => image),
        setVisible: vi.fn(() => image),
        setTint: vi.fn(() => image),
        setAlpha: vi.fn((alpha: number) => {
            image.alpha = alpha;
            return image;
        }),
        destroy: vi.fn(),
    };
    return image;
}

function setup(dropAt?: (x: number, y: number) => number) {
    const images: ReturnType<typeof fakeImage>[] = [];
    const made = vi.fn((_x: number, _y: number, _key: string) => {
        const image = fakeImage();
        images.push(image);
        return image;
    });
    const scene = {
        add: { image: made },
        textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    return { images, made, layer: new FootprintLayer(scene, undefined, dropAt) };
}

const step = { kind: "step" as const, x: 0, y: 0, angle: 0, side: 1 as const };

describe("FootprintLayer", () => {
    it("multiplies the fade of each print by the layer alpha", () => {
        const { images, layer } = setup();
        layer.add([step], 0);
        layer.setAlpha(0.5);
        expect(images[0].alpha).toBeCloseTo(0.25);
        layer.update(FOOTPRINT_FADE_MS / 2);
        expect(images[0].alpha).toBeCloseTo(0.125);
    });

    it("lays a print where its ground is drawn on a relief seen in 3/4, still under the feet that left it", () => {
        // A hollow drawn 60 px lower.
        const { images, made, layer } = setup(() => 60);
        layer.add([{ ...step, x: 100, y: 200 }], 0);
        expect(made.mock.calls[0].slice(0, 2)).toEqual([100, 260]);
        // Sorted by its place, as the avatar that walks on it (whose depth is its place): never drawn over it.
        expect(images[0].setDepth).toHaveBeenCalledWith(200 - 16);
        // Its own colour: nothing tints it.
        expect(images[0].setTint).not.toHaveBeenCalled();
    });

    it("gives new prints the current layer alpha", () => {
        const { images, layer } = setup();
        layer.setAlpha(0.4);
        layer.add([step], 0);
        expect(images[0].alpha).toBeCloseTo(0.2);
    });
});
