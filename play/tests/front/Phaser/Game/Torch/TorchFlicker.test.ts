import { describe, expect, it } from "vitest";
import {
    TORCH_FLICKER_MIN,
    TORCH_FLICKER_STEPS_PER_SECOND,
    startTorchFade,
    torchFlicker,
    torchFlickerStep,
    torchFadeTowards,
} from "../../../../../src/front/Phaser/Game/Torch/TorchFlicker";

/** Ten seconds at 60 images per second, the flicker moving by steps as in the game (see TorchManager). */
const samples = (phase: number, reducedMotion = false): number[] =>
    Array.from({ length: 600 }, (_, frame) =>
        torchFlicker(torchFlickerStep((frame * 1000) / 60), phase, reducedMotion),
    );

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

    it("moves by steps 15 times a second", () => {
        expect(torchFlickerStep(0)).toBe(0);
        expect(torchFlickerStep(1010)).toBe(1000);
        expect(torchFlickerStep(1060)).toBe(1000);
        expect(torchFlickerStep(1070)).toBeCloseTo(1000 + 1000 / 15);
    });

    it("never changes abruptly from one image to the next: under 3 % of the light", () => {
        for (const phase of [0, 0.5]) {
            const values = samples(phase);
            for (let index = 1; index < values.length; index++) {
                expect(Math.abs(values[index] - values[index - 1])).toBeLessThan(0.03);
            }
        }
    });

    it("has at most three marked variations per second (photosensitivity)", () => {
        for (const phase of [0, 0.25, 0.6]) {
            // The steps hold a value for a few images: only the changes are looked at.
            const values = samples(phase).filter((value, index, all) => index === 0 || value !== all[index - 1]);
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

/** The marked variations of a curve: its turns after a change of at least 0.02 since the previous turn. */
function markedVariations(values: readonly number[]): number {
    const changes = values.filter((value, index, all) => index === 0 || value !== all[index - 1]);
    let turns = 0;
    let lastTurn = changes[0];
    let rising = changes[1] > changes[0];
    for (let index = 1; index < changes.length - 1; index++) {
        const nowRising = changes[index + 1] > changes[index];
        if (nowRising !== rising) {
            rising = nowRising;
            if (Math.abs(changes[index] - lastTurn) >= 0.02) turns++;
            lastTurn = changes[index];
        }
    }
    return turns;
}

describe("torchFadeTowards", () => {
    const stepMs = 1000 / TORCH_FLICKER_STEPS_PER_SECOND;

    it("follows the flicker unchanged while the intensity stays the same", () => {
        for (const [phase, strength] of [
            [0, 1],
            [0.25, 0.5],
            [0.6, 0.1],
        ]) {
            let state = startTorchFade(strength * torchFlicker(0, phase, false), 0);
            for (let step = 1; step <= 10 * TORCH_FLICKER_STEPS_PER_SECOND; step++) {
                const now = step * stepMs;
                const flicker = strength * torchFlicker(now, phase, false);
                state = torchFadeTowards(state, flicker, now);
                expect(state.value).toBeCloseTo(flicker, 9);
            }
        }
    });

    it("keeps the light drawn, the flicker within the intensity, to three marked variations a second at worst", () => {
        for (const phase of [0, 0.25, 0.6]) {
            let state = startTorchFade(torchFlicker(0, phase, false), 0);
            const drawn: number[] = [state.value];
            for (let step = 1; step <= 10 * TORCH_FLICKER_STEPS_PER_SECOND; step++) {
                const now = step * stepMs;
                // The intensity changed from 10 % to 100 % and back at every step, as fast as it can be.
                state = torchFadeTowards(state, (step % 2 === 0 ? 1 : 0.1) * torchFlicker(now, phase, false), now);
                drawn.push(state.value);
            }
            expect(markedVariations(drawn) / 10).toBeLessThanOrEqual(3);
        }
    });

    it("starts at the strength set, and stays there while it is not changed", () => {
        let state = startTorchFade(0.4, 0);
        expect(state.value).toBe(0.4);
        for (let step = 1; step <= 30; step++) state = torchFadeTowards(state, 0.4, step * stepMs);
        expect(state.value).toBe(0.4);
    });

    it("goes from the dimmest to the full light, and back, in one second", () => {
        let state = startTorchFade(0.1, 0);
        state = torchFadeTowards(state, 1, 500);
        expect(state.value).toBeCloseTo(0.55);
        state = torchFadeTowards(state, 1, 1000);
        expect(state.value).toBe(1);
        // Never beyond the strength asked.
        state = torchFadeTowards(state, 1, 3000);
        expect(state.value).toBe(1);
        state = torchFadeTowards(state, 1, 6000);
        state = torchFadeTowards(state, 0.1, 6500);
        expect(state.value).toBeCloseTo(0.55);
        state = torchFadeTowards(state, 0.1, 7000);
        expect(state.value).toBeCloseTo(0.1);
    });

    it("has at most three marked variations per second, however fast the strength is changed (photosensitivity)", () => {
        // The worst a held key or a colleague's clicks can do: from 10 % to 100 % and back at every step, for 10 s.
        let state = startTorchFade(1, 0);
        const values: number[] = [state.value];
        for (let step = 1; step <= 10 * TORCH_FLICKER_STEPS_PER_SECOND; step++) {
            state = torchFadeTowards(state, step % 2 === 0 ? 1 : 0.1, step * stepMs);
            values.push(state.value);
        }
        expect(markedVariations(values) / 10).toBeLessThanOrEqual(3);
        for (let index = 1; index < values.length; index++) {
            expect(Math.abs(values[index] - values[index - 1])).toBeLessThanOrEqual(
                0.9 / TORCH_FLICKER_STEPS_PER_SECOND + 1e-9,
            );
        }
    });
});
