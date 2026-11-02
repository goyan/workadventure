import { describe, expect, it } from "vitest";
import type { ImagePixels } from "./EntityAnimationDetection";
import { detectEntityAnimationFrameCount } from "./EntityAnimationDetection";

type Color = [number, number, number];

function createImage(width: number, height: number): ImagePixels {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function fillRect(image: ImagePixels, x: number, y: number, width: number, height: number, color: Color): void {
    for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) {
            const index = (row * image.width + column) * 4;
            image.data.set([...color, 255], index);
        }
    }
}

/** A flame flickering in a strip of 32px frames: the same blob, a bit taller on every frame, with a margin. */
function createFlameStrip(frameCount: number): ImagePixels {
    const image = createImage(32 * frameCount, 32);
    for (let frame = 0; frame < frameCount; frame++) {
        const flameHeight = 18 + (frame % 3) * 3;
        fillRect(image, frame * 32 + 8, 30 - flameHeight, 16, flameHeight, [255, 120 + frame * 10, 0]);
    }
    return image;
}

describe("detectEntityAnimationFrameCount", () => {
    it("should detect the frames of a strip of square frames", () => {
        expect(detectEntityAnimationFrameCount(createFlameStrip(4))).toBe(4);
        expect(detectEntityAnimationFrameCount(createFlameStrip(6))).toBe(6);
    });

    it("should detect a strip of frames drawn edge to edge when the frame borders differ", () => {
        const image = createImage(64, 32);
        fillRect(image, 0, 0, 32, 32, [0, 0, 255]);
        fillRect(image, 32, 0, 32, 32, [255, 255, 0]);
        expect(detectEntityAnimationFrameCount(image)).toBe(2);
    });

    it("should not cut a wide still image whose drawing goes on across the cuts", () => {
        const couch = createImage(96, 32);
        fillRect(couch, 2, 8, 92, 22, [120, 60, 30]);
        expect(detectEntityAnimationFrameCount(couch)).toBeUndefined();
    });

    it("should not take a repeated pattern for an animation", () => {
        const fence = createImage(96, 32);
        for (let post = 0; post < 3; post++) {
            fillRect(fence, post * 32 + 12, 4, 8, 26, [90, 60, 20]);
        }
        expect(detectEntityAnimationFrameCount(fence)).toBeUndefined();
    });

    it("should not take two different objects side by side for an animation", () => {
        const image = createImage(64, 32);
        fillRect(image, 4, 20, 24, 10, [80, 80, 80]);
        fillRect(image, 40, 2, 8, 28, [0, 160, 0]);
        expect(detectEntityAnimationFrameCount(image)).toBeUndefined();
    });

    it("should not cut a square or a tall image", () => {
        expect(detectEntityAnimationFrameCount(createImage(32, 32))).toBeUndefined();
        expect(detectEntityAnimationFrameCount(createImage(32, 96))).toBeUndefined();
    });
});
