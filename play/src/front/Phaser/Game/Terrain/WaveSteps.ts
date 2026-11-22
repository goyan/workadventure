import { WAVE_BOUNDS } from "@workadventure/map-editor";

/**
 * The step of the friction of the ground (panel of the water, waves): a twentieth, finer than the other waves, so that
 * the friction can be set between the roughnesses the soils give. Nothing checks it when saved: a value saved at the
 * former step (a tenth) stays as it is.
 */
export const ROUGHNESS_STEP = 0.05;

/** A friction to the hundredth: what the slider moves by, without the noise of floats (0.1 + 0.2). */
function hundredths(value: number): number {
    return Math.round(value * 100) / 100;
}

/** The friction as the slider shows it: two decimals at most, none trailing ("0.25", "0.2", "1"). */
export function roughnessFigure(value: number): string {
    return String(hundredths(value));
}

/**
 * The friction one notch down (-1) or up (1), on the twentieth: from a value between two notches, the next one that
 * way. Within its bounds.
 */
export function nudgedRoughness(value: number, by: -1 | 1): number {
    const notches = value / ROUGHNESS_STEP;
    const next = by > 0 ? Math.floor(notches + 1e-9) + 1 : Math.ceil(notches - 1e-9) - 1;
    const [min, max] = WAVE_BOUNDS.roughness;
    return Math.min(max, Math.max(min, hundredths(next * ROUGHNESS_STEP)));
}
