/** The dimmest the flame gets, as a share of its full light. */
export const TORCH_FLICKER_MIN = 0.8;

/**
 * Three slow waves (all under 1 Hz), weighted so that together they span exactly from TORCH_FLICKER_MIN to 1. Slow
 * waves keep the flicker soft for photosensitivity (WCAG 2.3.1): no abrupt change from light to dark, and well under
 * three marked variations a second.
 */
const WAVES: readonly { hertz: number; weight: number }[] = [
    { hertz: 0.37, weight: 0.45 },
    { hertz: 0.61, weight: 0.33 },
    { hertz: 0.89, weight: 0.22 },
];

/**
 * How bright a torch is at a time, from TORCH_FLICKER_MIN to 1. `phase` (0 to 1) shifts the waves, so that two torches
 * lit together do not flicker as one. A steady full light when the system asks for less motion.
 */
export function torchFlicker(timeMs: number, phase: number, reducedMotion: boolean): number {
    if (reducedMotion) {
        return 1;
    }
    const seconds = timeMs / 1000;
    let wave = 0;
    WAVES.forEach(({ hertz, weight }, index) => {
        wave += weight * Math.sin(2 * Math.PI * (hertz * seconds + phase * (index + 1)));
    });
    // `wave` is between -1 and 1 (the weights add up to 1).
    return TORCH_FLICKER_MIN + ((1 - TORCH_FLICKER_MIN) * (wave + 1)) / 2;
}

/** A phase from 0 to 1 that stays the same for an id: each bearer's torch flickers in its own way. */
export function torchFlickerPhase(id: string): number {
    let hash = 0;
    for (let index = 0; index < id.length; index++) {
        hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return (hash % 1000) / 1000;
}
