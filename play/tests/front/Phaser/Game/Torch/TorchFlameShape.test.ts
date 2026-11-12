import { describe, expect, it } from "vitest";
import {
    TORCH_FLAME_FRAMES_PER_SECOND,
    torchFlameShape,
    torchFlameStep,
} from "../../../../../src/front/Phaser/Game/Torch/TorchFlameShape";

/** Ten seconds at 60 images per second. */
const times = Array.from({ length: 600 }, (_, frame) => (frame * 1000) / 60);

describe("torchFlameShape", () => {
    it("gives the same flame for the same time and bearer", () => {
        expect(torchFlameShape(1234, 0.4, false)).toEqual(torchFlameShape(1234, 0.4, false));
    });

    it("stays within a small flame: the tip sways a couple of pixels, height and width change by about 15 %", () => {
        for (const phase of [0, 0.3, 0.8]) {
            for (const time of times) {
                const shape = torchFlameShape(time, phase, false);
                expect(Math.abs(shape.sway)).toBeLessThanOrEqual(2);
                expect(shape.height).toBeGreaterThanOrEqual(0.85);
                expect(shape.height).toBeLessThanOrEqual(1.15);
                expect(shape.width).toBeGreaterThanOrEqual(0.88);
                expect(shape.width).toBeLessThanOrEqual(1.12);
            }
        }
    });

    it("moves like a flame: the tip sways both ways and the flame stretches and shrinks", () => {
        const shapes = times.map((time) => torchFlameShape(time, 0.2, false));
        expect(Math.min(...shapes.map(({ sway }) => sway))).toBeLessThan(-0.8);
        expect(Math.max(...shapes.map(({ sway }) => sway))).toBeGreaterThan(0.8);
        expect(Math.max(...shapes.map(({ height }) => height))).toBeGreaterThan(1.08);
        expect(Math.min(...shapes.map(({ height }) => height))).toBeLessThan(0.92);
        // Not a loop of a few frames: the waves never line up again within ten seconds.
        const first = shapes.slice(0, 60).map(({ sway }) => sway.toFixed(3));
        for (let start = 6; start < 540; start++) {
            expect(shapes.slice(start, start + 60).map(({ sway }) => sway.toFixed(3))).not.toEqual(first);
        }
    });

    it("does not beat in step with another bearer's flame", () => {
        const a = times.map((time) => torchFlameShape(time, 0.1, false).sway);
        const b = times.map((time) => torchFlameShape(time, 0.65, false).sway);
        const different = a.filter((value, index) => Math.abs(value - b[index]) > 0.3).length;
        expect(different).toBeGreaterThan(times.length / 3);
    });

    it("sends up an ember now and then, at most one a second, fading in and out smoothly", () => {
        for (const phase of [0, 0.45]) {
            const embers = times.map((time) => torchFlameShape(time, phase, false).ember);
            let births = 0;
            for (let index = 1; index < embers.length; index++) {
                const previous = embers[index - 1];
                const ember = embers[index];
                if (ember && !previous) births++;
                // Never a flash: its brightness changes little from one image to the next.
                expect(Math.abs((ember?.alpha ?? 0) - (previous?.alpha ?? 0))).toBeLessThan(0.15);
                if (ember) {
                    expect(ember.alpha).toBeGreaterThanOrEqual(0);
                    expect(ember.alpha).toBeLessThanOrEqual(1);
                    // It rises from the flame, above the hand.
                    expect(ember.y).toBeLessThan(0);
                }
            }
            expect(births).toBeGreaterThanOrEqual(3);
            expect(births / 10).toBeLessThanOrEqual(1);
        }
    });

    it("is a steady flame with no ember when the system asks for less motion", () => {
        for (const time of times) {
            expect(torchFlameShape(time, 0.3, true)).toEqual({ sway: 0, height: 1, width: 1, ember: undefined });
        }
    });

    it("is drawn 30 times a second, apart from the 15 steps of the light", () => {
        expect(TORCH_FLAME_FRAMES_PER_SECOND).toBeGreaterThanOrEqual(24);
        expect(torchFlameStep(0)).toBe(0);
        expect(torchFlameStep(1000)).toBe(30);
        expect(torchFlameStep(1030)).toBe(30);
        expect(torchFlameStep(1034)).toBe(31);
    });
});
