import { describe, expect, it } from "vitest";
import {
    TORCH_FLICKER_MIN,
    TORCH_FLICKER_STEPS_PER_SECOND,
    TORCH_MARKED_VARIATION,
    startTorchFade,
    torchBreath,
    torchCrackle,
    torchFadeTowards,
    torchFlicker,
    torchFlickerSeed,
    torchFlickerStep,
} from "../../../../../src/front/Phaser/Game/Torch/TorchFlicker";
import { markedVariations, worstSecond } from "./MarkedVariations";

const stepMs = 1000 / TORCH_FLICKER_STEPS_PER_SECOND;
/** A server time of today: the flicker is read from the shared clock, not from the start of a page. */
const EPOCH = Date.UTC(2026, 10, 14, 18, 0, 0);
/** `seconds` of the flicker, at its 15 steps a second, as the game samples it. */
const samples = (seed: number, seconds: number, reducedMotion = false): number[] =>
    Array.from({ length: seconds * TORCH_FLICKER_STEPS_PER_SECOND + 1 }, (_, step) =>
        torchFlicker(EPOCH + step * stepMs, seed, reducedMotion),
    );
const seeds = [torchFlickerSeed("1"), torchFlickerSeed("42"), torchFlickerSeed("1337")];

describe("torchFlicker", () => {
    it("is the same flame for the same bearer at the same server time, on every browser", () => {
        for (const seed of seeds) {
            expect(samples(seed, 5)).toEqual(samples(seed, 5));
        }
        expect(torchFlickerSeed("42")).toBe(torchFlickerSeed("42"));
    });

    it("gives each bearer a flame of their own", () => {
        const [a, b] = [samples(seeds[0], 5), samples(seeds[1], 5)];
        expect(a.filter((value, index) => Math.abs(value - b[index]) > 0.01).length).toBeGreaterThan(a.length / 2);
    });

    it("stays between the dimmest flame and the full light, and uses that range", () => {
        expect(TORCH_FLICKER_MIN).toBeCloseTo(0.74);
        for (const seed of seeds) {
            const values = samples(seed, 60);
            for (const value of values) {
                expect(value).toBeGreaterThanOrEqual(TORCH_FLICKER_MIN);
                expect(value).toBeLessThanOrEqual(1);
            }
            expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.12);
        }
    });

    it("breathes slowly, ±10 %: a smoothed noise of under 1 Hz", () => {
        for (const seed of seeds) {
            const breath = Array.from({ length: 60 * 30 }, (_, index) =>
                torchBreath(EPOCH + (index * 1000) / 30, seed),
            );
            for (const value of breath) {
                expect(Math.abs(value)).toBeLessThanOrEqual(1);
            }
            // Smoothed: from one thirtieth of a second to the next, it barely moves.
            for (let index = 1; index < breath.length; index++) {
                expect(Math.abs(breath[index] - breath[index - 1])).toBeLessThan(0.25);
            }
            // At most about one turn a second (a noise of 0.35 and 0.9 Hz).
            expect(markedVariations(breath, 0.2) / 60).toBeLessThanOrEqual(2);
            expect(Math.max(...breath) - Math.min(...breath)).toBeGreaterThan(0.8);
        }
    });

    it("crackles faster, ±3 %, without a marked variation of its own", () => {
        for (const seed of seeds) {
            const crackle = Array.from({ length: 60 * TORCH_FLICKER_STEPS_PER_SECOND }, (_, step) =>
                torchCrackle(EPOCH + step * stepMs, seed),
            );
            for (const value of crackle) expect(Math.abs(value)).toBeLessThanOrEqual(1);
            // Its share of the light (3 %) moves from one step to the next, never by a marked variation.
            const share = crackle.map((value) => 0.03 * value);
            const jumps = share.slice(1).map((value, index) => Math.abs(value - share[index]));
            expect(Math.max(...jumps)).toBeLessThan(TORCH_MARKED_VARIATION);
            expect(jumps.reduce((sum, jump) => sum + jump, 0) / jumps.length).toBeGreaterThan(0.005);
            expect(markedVariations(share)).toBe(0);
        }
    });

    it("moves by steps 15 times a second", () => {
        expect(torchFlickerStep(0)).toBe(0);
        expect(torchFlickerStep(1010)).toBe(1000);
        expect(torchFlickerStep(1060)).toBe(1000);
        expect(torchFlickerStep(1070)).toBeCloseTo(1000 + 1000 / 15);
    });

    it("never changes by a marked variation from one step to the next", () => {
        for (const seed of seeds) {
            const values = samples(seed, 60);
            for (let index = 1; index < values.length; index++) {
                expect(Math.abs(values[index] - values[index - 1])).toBeLessThan(TORCH_MARKED_VARIATION);
            }
        }
    });

    it("has at most three marked variations in any second (photosensitivity), over a minute", () => {
        for (const seed of seeds) {
            expect(worstSecond(samples(seed, 60), TORCH_FLICKER_STEPS_PER_SECOND)).toBeLessThanOrEqual(3);
        }
    });

    it("is a steady full light when the system asks for less motion", () => {
        expect(new Set(samples(seeds[0], 10, true))).toEqual(new Set([1]));
    });
});

describe("torchFadeTowards", () => {
    it("follows the flicker unchanged while the intensity stays the same", () => {
        for (const [seed, strength] of [
            [seeds[0], 1],
            [seeds[1], 0.5],
            [seeds[2], 0.1],
        ]) {
            let state = startTorchFade(strength * torchFlicker(EPOCH, seed, false), EPOCH);
            for (let step = 1; step <= 30 * TORCH_FLICKER_STEPS_PER_SECOND; step++) {
                const now = EPOCH + step * stepMs;
                const flicker = strength * torchFlicker(now, seed, false);
                state = torchFadeTowards(state, flicker, now, 3);
                expect(state.value).toBeCloseTo(flicker, 9);
            }
        }
    });

    it("keeps the light drawn, the flicker within the intensity, to three marked variations a second at worst", () => {
        for (const seed of seeds) {
            let state = startTorchFade(torchFlicker(EPOCH, seed, false), EPOCH);
            const drawn: number[] = [state.value];
            for (let step = 1; step <= 30 * TORCH_FLICKER_STEPS_PER_SECOND; step++) {
                const now = EPOCH + step * stepMs;
                // The intensity changed from 10 % to 100 % and back at every step, as fast as it can be.
                state = torchFadeTowards(state, (step % 2 === 0 ? 1 : 0.1) * torchFlicker(now, seed, false), now, 3);
                drawn.push(state.value);
            }
            expect(worstSecond(drawn, TORCH_FLICKER_STEPS_PER_SECOND)).toBeLessThanOrEqual(3);
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

    it("moves faster when asked: a gust or the ignition of the torch", () => {
        const state = torchFadeTowards(startTorchFade(1, 0), 0.65, 150, 3);
        expect(state.value).toBeCloseTo(0.65);
    });

    it("has at most three marked variations per second, however fast the strength is changed (photosensitivity)", () => {
        // The worst a held key or a colleague's clicks can do: from 10 % to 100 % and back at every step, for 10 s.
        let state = startTorchFade(1, 0);
        const values: number[] = [state.value];
        for (let step = 1; step <= 10 * TORCH_FLICKER_STEPS_PER_SECOND; step++) {
            state = torchFadeTowards(state, step % 2 === 0 ? 1 : 0.1, step * stepMs);
            values.push(state.value);
        }
        expect(worstSecond(values, TORCH_FLICKER_STEPS_PER_SECOND)).toBeLessThanOrEqual(3);
        for (let index = 1; index < values.length; index++) {
            expect(Math.abs(values[index] - values[index - 1])).toBeLessThanOrEqual(
                0.9 / TORCH_FLICKER_STEPS_PER_SECOND + 1e-9,
            );
        }
    });
});
