import { describe, expect, it } from "vitest";
import { TORCH_FLICKER_MIN, torchFlicker } from "../../../../../src/front/Phaser/Game/Torch/TorchFlicker";

/** Ten seconds sampled at 60 images per second. */
const samples = (phase: number, reducedMotion = false): number[] =>
    Array.from({ length: 600 }, (_, frame) => torchFlicker((frame * 1000) / 60, phase, reducedMotion));

describe("torchFlicker", () => {
    it("stays between the dimmest flame and the full light", () => {
        for (const phase of [0, 0.3, 0.77]) {
            for (const value of samples(phase)) {
                expect(value).toBeGreaterThanOrEqual(TORCH_FLICKER_MIN);
                expect(value).toBeLessThanOrEqual(1);
            }
        }
        expect(TORCH_FLICKER_MIN).toBeGreaterThanOrEqual(0.75);
    });

    it("does move: the flame is alive", () => {
        const values = samples(0);
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.05);
    });

    it("never changes abruptly from one image to the next", () => {
        const values = samples(0.5);
        for (let index = 1; index < values.length; index++) {
            expect(Math.abs(values[index] - values[index - 1])).toBeLessThan(0.02);
        }
    });

    it("has at most three marked variations per second (photosensitivity)", () => {
        for (const phase of [0, 0.25, 0.6]) {
            const values = samples(phase);
            // A marked variation: a turn of the curve that follows a change of at least 0.02 since the previous turn.
            let turns = 0;
            let lastTurn = values[0];
            let rising = values[1] > values[0];
            for (let index = 1; index < values.length - 1; index++) {
                const nowRising = values[index + 1] > values[index];
                if (nowRising !== rising) {
                    rising = nowRising;
                    if (Math.abs(values[index] - lastTurn) >= 0.02) turns++;
                    lastTurn = values[index];
                }
            }
            expect(turns / 10).toBeLessThanOrEqual(3);
        }
    });

    it("gives two torches lit together a different flicker", () => {
        expect(torchFlicker(1234, 0.1, false)).not.toBeCloseTo(torchFlicker(1234, 0.6, false), 3);
    });

    it("is a steady full light when the system asks for less motion", () => {
        expect(new Set(samples(0.4, true))).toEqual(new Set([1]));
    });
});
