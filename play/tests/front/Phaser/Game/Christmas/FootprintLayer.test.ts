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
        setAlpha: vi.fn((alpha: number) => {
            image.alpha = alpha;
            return image;
        }),
        destroy: vi.fn(),
    };
    return image;
}

function setup() {
    const images: ReturnType<typeof fakeImage>[] = [];
    const scene = {
        add: {
            image: vi.fn(() => {
                const image = fakeImage();
                images.push(image);
                return image;
            }),
        },
        textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    return { images, layer: new FootprintLayer(scene) };
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

    it("gives new prints the current layer alpha", () => {
        const { images, layer } = setup();
        layer.setAlpha(0.4);
        layer.add([step], 0);
        expect(images[0].alpha).toBeCloseTo(0.2);
    });
});
