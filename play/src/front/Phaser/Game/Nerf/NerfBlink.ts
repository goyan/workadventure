/** A player hit by a Nerf dart blinks red and see-through for this long, for everyone. */
export const NERF_BLINK_MS = 600;
/** It switches between red and normal at this rhythm. */
export const NERF_BLINK_STEP_MS = 75;
/** With less motion asked for, a single red flash of this length instead. */
export const NERF_BLINK_REDUCED_MS = 150;
export const NERF_BLINK_TINT = 0xff4040;
export const NERF_BLINK_ALPHA = 0.55;

/** Whether the avatar is red `elapsed` ms after the hit; undefined once the blink is over. */
export function nerfBlinkTinted(elapsed: number, reducedMotion: boolean): boolean | undefined {
    if (reducedMotion) return elapsed < NERF_BLINK_REDUCED_MS ? true : undefined;
    if (elapsed >= NERF_BLINK_MS) return undefined;
    return Math.floor(elapsed / NERF_BLINK_STEP_MS) % 2 === 0;
}
