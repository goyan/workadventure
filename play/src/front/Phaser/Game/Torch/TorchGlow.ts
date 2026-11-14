import { torchFlicker } from "./TorchFlicker";
import { torchGust } from "./TorchGust";

/** A torch lights up from nothing in half a second when it is equipped. */
const IGNITION_MS = 500;
/** The colour of a dim light, an orange red, and that of a full one, a warm yellow. */
export const TORCH_COLOUR_DIM = 0xff4a14;
export const TORCH_COLOUR_BRIGHT = 0xffa83a;
/** Below this brightness, the light is all orange red; it turns to yellow as it reaches the full light. */
const COLOUR_DIM_BELOW = 0.4;

/** How far lit a torch is, `litForMs` after it was seen equipped (Infinity: it was already lit when first seen). */
export function torchIgnition(litForMs: number, reducedMotion: boolean): number {
    if (reducedMotion) return 1;
    return Math.min(1, Math.max(0, litForMs / IGNITION_MS));
}

/** The colour of the light at a brightness (0 to 1): dimmer is more orange red, brighter more yellow. */
export function torchColour(brightness: number): number {
    const t = Math.min(1, Math.max(0, (brightness - COLOUR_DIM_BELOW) / (1 - COLOUR_DIM_BELOW)));
    const channel = (shift: number): number => {
        const from = (TORCH_COLOUR_DIM >> shift) & 0xff;
        const to = (TORCH_COLOUR_BRIGHT >> shift) & 0xff;
        return Math.round(from + (to - from) * t);
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The brightness of a torch at a server time, as a share of the intensity its bearer set: its flame (breathing and
 * crackle), the gusts of the wind and its ignition, multiplied. Each layer is the same on every browser, and steady in
 * reduced motion. What is drawn still goes through torchFadeTowards, which keeps it safe for photosensitivity.
 */
export function torchGlow(options: {
    epochMs: number;
    seed: number;
    wind: number;
    litForMs: number;
    reducedMotion: boolean;
}): number {
    const { epochMs, seed, wind, litForMs, reducedMotion } = options;
    return (
        torchFlicker(epochMs, seed, reducedMotion) *
        torchGust(epochMs, seed, wind, reducedMotion) *
        torchIgnition(litForMs, reducedMotion)
    );
}
