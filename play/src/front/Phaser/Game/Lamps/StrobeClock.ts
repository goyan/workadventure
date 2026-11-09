import { STROBE_DEFAULT_HZ, STROBE_MAX_HZ, STROBE_MIN_HZ } from "@workadventure/map-editor";

/**
 * Photosensitivity: at most three flashes a second passes WCAG 2.3.1 whatever the content. Above it, only a player who
 * turned fast strobes on in their settings sees the rate a lamp asks for.
 */
export const SAFE_STROBE_HZ = 3;

/** Shortest and longest a flash lasts: one image at 60 per second, and a little under the time to notice it. */
const MIN_FLASH_MS = 16;
const MAX_FLASH_MS = 60;
/** A flash is this part of the period: a strobe is mostly dark, with short bursts. */
const FLASH_SHARE_OF_PERIOD = 0.2;

/**
 * Flashes a second this player sees for a lamp that asks for `requested`: the rate of the lamp, within what a strobe
 * does (half a flash to 12 a second), and no more than 3 unless they turned fast strobes on.
 */
export function effectiveStrobeHz(requested: number | undefined, options: { fastStrobes: boolean }): number {
    const asked = requested === undefined || !Number.isFinite(requested) ? STROBE_DEFAULT_HZ : requested;
    const ceiling = options.fastStrobes ? STROBE_MAX_HZ : SAFE_STROBE_HZ;
    return Math.min(ceiling, Math.max(STROBE_MIN_HZ, asked));
}

export function strobeFlashDurationMs(hz: number): number {
    const period = 1000 / hz;
    return Math.min(MAX_FLASH_MS, Math.max(MIN_FLASH_MS, period * FLASH_SHARE_OF_PERIOD));
}

/**
 * How bright the flash of a strobe is at `timeMs`: full when a period starts, fading to nothing by the end of the
 * flash, then dark until the next period. A clock: the music has no part in it, only the rate does.
 */
export function strobeFlashAlpha(timeMs: number, hz: number): number {
    const period = 1000 / hz;
    const sincePeriodStart = ((timeMs % period) + period) % period;
    const duration = strobeFlashDurationMs(hz);
    return sincePeriodStart >= duration ? 0 : 1 - sincePeriodStart / duration;
}
