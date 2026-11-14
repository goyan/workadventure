import { describe, expect, it } from "vitest";
import {
    TORCH_COLOUR_BRIGHT,
    TORCH_COLOUR_DIM,
    torchColour,
    torchGlow,
    torchIgnition,
} from "../../../../../src/front/Phaser/Game/Torch/TorchGlow";
import {
    TORCH_FLICKER_STEPS_PER_SECOND,
    TORCH_MARKED_VARIATION,
    startTorchFade,
    torchFadeTowards,
    torchFlicker,
    torchFlickerSeed,
} from "../../../../../src/front/Phaser/Game/Torch/TorchFlicker";
import { torchGust } from "../../../../../src/front/Phaser/Game/Torch/TorchGust";
import { markedVariations, worstSecond } from "./MarkedVariations";

const stepMs = 1000 / TORCH_FLICKER_STEPS_PER_SECOND;
const EPOCH = Date.UTC(2026, 10, 14, 18, 0, 0);
const seeds = ["1", "42", "1337", "7", "99"].map(torchFlickerSeed);

describe("torchIgnition", () => {
    it("lights the torch from nothing to its full light in half a second", () => {
        expect(torchIgnition(0, false)).toBe(0);
        expect(torchIgnition(250, false)).toBeCloseTo(0.5);
        expect(torchIgnition(500, false)).toBe(1);
        expect(torchIgnition(5000, false)).toBe(1);
        // A torch already lit when it was first seen.
        expect(torchIgnition(Number.POSITIVE_INFINITY, false)).toBe(1);
    });

    it("is lit at once when the system asks for less motion", () => {
        expect(torchIgnition(0, true)).toBe(1);
    });
});

describe("torchColour", () => {
    it("goes from an orange red when dim to a yellow at full light", () => {
        expect(torchColour(1)).toBe(TORCH_COLOUR_BRIGHT);
        expect(torchColour(0.4)).toBe(TORCH_COLOUR_DIM);
        expect(torchColour(0.1)).toBe(TORCH_COLOUR_DIM);
        expect(TORCH_COLOUR_DIM).toBe(0xff4a14);
        expect(TORCH_COLOUR_BRIGHT).toBe(0xffa83a);
        // In between, the green rises with the light (red stays full): more yellow when brighter.
        const green = (colour: number) => (colour >> 8) & 0xff;
        expect(green(torchColour(0.6))).toBeLessThan(green(torchColour(0.8)));
        expect(torchColour(0.7) >> 16).toBe(0xff);
    });
});

describe("torchGlow", () => {
    it("multiplies the flicker, the gust and the ignition", () => {
        const now = EPOCH + 12_345;
        expect(torchGlow({ epochMs: now, seed: seeds[0], wind: 1, litForMs: 250, reducedMotion: false })).toBeCloseTo(
            torchFlicker(now, seeds[0], false) * torchGust(now, seeds[0], 1, false) * 0.5,
        );
    });

    it("is a steady full light when the system asks for less motion", () => {
        for (let step = 0; step < 300; step++) {
            expect(
                torchGlow({
                    epochMs: EPOCH + step * stepMs,
                    seed: seeds[1],
                    wind: 1,
                    litForMs: 0,
                    reducedMotion: true,
                }),
            ).toBe(1);
        }
    });

    /**
     * What is drawn, over a minute: the glow within the intensity (from the night veil's fade), through the fade of the
     * glow, as TorchManager does. `wildIntensity`: the intensity changed from 10 % to 100 % and back at every step.
     */
    function drawn(seed: number, wind: number, wildIntensity: boolean, seconds = 60): number[] {
        let veil = startTorchFade(1, EPOCH);
        let glow = startTorchFade(0, EPOCH);
        let litAt = EPOCH;
        const values: number[] = [];
        for (let step = 0; step <= seconds * TORCH_FLICKER_STEPS_PER_SECOND; step++) {
            const now = EPOCH + step * stepMs;
            // Lit again every 10 s: the ignition is in the minute too.
            if (step % 150 === 0) litAt = now;
            const strength = wildIntensity ? (step % 2 === 0 ? 1 : 0.1) : 1;
            // As TorchManager: the intensity through the fade of the veil, then the glow through its own.
            veil = torchFadeTowards(veil, strength, now);
            const target =
                veil.value * torchGlow({ epochMs: now, seed, wind, litForMs: now - litAt, reducedMotion: false });
            glow = torchFadeTowards(glow, target, now, 3, TORCH_MARKED_VARIATION);
            values.push(glow.value);
        }
        return values;
    }

    it("has at most three marked variations in any second, in a storm, the intensity changed at every step", () => {
        for (const seed of seeds) {
            for (const wind of [0, 0.25, 1]) {
                expect(worstSecond(drawn(seed, wind, true), TORCH_FLICKER_STEPS_PER_SECOND)).toBeLessThanOrEqual(3);
                expect(worstSecond(drawn(seed, wind, false), TORCH_FLICKER_STEPS_PER_SECOND)).toBeLessThanOrEqual(3);
            }
        }
    });

    it("lets a storm gust be seen: the light drops by a marked variation", () => {
        let seen = 0;
        for (const seed of seeds) {
            const values = drawn(seed, 1, false);
            for (let index = 3; index < values.length; index++) {
                if (values[index - 3] - values[index] > 0.2) seen++;
            }
            expect(markedVariations(values)).toBeGreaterThan(0);
        }
        expect(seen).toBeGreaterThan(0);
        expect(TORCH_MARKED_VARIATION).toBe(0.1);
    });
});
