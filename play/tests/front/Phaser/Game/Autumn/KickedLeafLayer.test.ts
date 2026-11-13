import { describe, expect, it, vi } from "vitest";
import { KickedLeafLayer } from "../../../../../src/front/Phaser/Game/Autumn/KickedLeafLayer";
import { KICK_FADE_MS, KICK_FALL_MS } from "../../../../../src/front/Phaser/Game/Autumn/KickedLeafTrail";

function fakeShape() {
    const shape = {
        alpha: 1,
        setDepth: vi.fn(() => shape),
        setRotation: vi.fn(() => shape),
        setPosition: vi.fn(() => shape),
        setVisible: vi.fn(() => shape),
        setAlpha: vi.fn((alpha: number) => {
            shape.alpha = alpha;
            return shape;
        }),
        destroy: vi.fn(),
    };
    return shape;
}

function setup() {
    const shapes: ReturnType<typeof fakeShape>[] = [];
    const scene = {
        add: {
            rectangle: vi.fn(() => {
                const shape = fakeShape();
                shapes.push(shape);
                return shape;
            }),
        },
    } as unknown as Phaser.Scene;
    return { shapes, layer: new KickedLeafLayer(scene) };
}

const leaf = { x: 0, y: 0, dx: 10, dy: 0, color: 0xaa5500 };

describe("KickedLeafLayer", () => {
    it("multiplies the fade of each leaf by the layer alpha", () => {
        const { shapes, layer } = setup();
        layer.add([leaf], 0);
        layer.setAlpha(0.5);
        expect(shapes[0].alpha).toBeCloseTo(0.5);
        layer.update(KICK_FALL_MS + KICK_FADE_MS / 2);
        expect(shapes[0].alpha).toBeCloseTo(0.25);
    });

    it("gives new leaves the current layer alpha", () => {
        const { shapes, layer } = setup();
        layer.setAlpha(0.3);
        layer.add([leaf], 0);
        expect(shapes[0].alpha).toBeCloseTo(0.3);
    });
});
