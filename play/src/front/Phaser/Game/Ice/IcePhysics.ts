/** A velocity, in pixels per second. */
export interface Vector {
    x: number;
    y: number;
}

/** How long the avatar takes to get most of the way to the speed it is pushed to (63%, a time constant). */
export const ICE_ACCEL_TIME_MS = 500;
/** How long a released avatar takes to lose most of its speed: it glides about two tiles from walking speed. */
export const ICE_FRICTION_TIME_MS = 350;
/** Below this speed, a released avatar stops dead instead of creeping on. */
export const ICE_STOP_SPEED = 8;
/** A longer step (a tab back from the background) counts as this long, so that the avatar does not jump. */
export const ICE_MAX_STEP_MS = 100;

/**
 * The velocity of an avatar on the ice after `dtMs`: it eases towards the velocity the player asks for (`wanted`,
 * zero without input) instead of taking it at once, so that it glides, turns along arcs and slides on once released.
 * The exponential form gives the same glide whatever the frame rate.
 */
export function iceStep(velocity: Vector, wanted: Vector, dtMs: number): Vector {
    const dt = Math.min(Math.max(dtMs, 0), ICE_MAX_STEP_MS);
    if (wanted.x !== 0 || wanted.y !== 0) {
        const keep = Math.exp(-dt / ICE_ACCEL_TIME_MS);
        return { x: wanted.x + (velocity.x - wanted.x) * keep, y: wanted.y + (velocity.y - wanted.y) * keep };
    }
    const keep = Math.exp(-dt / ICE_FRICTION_TIME_MS);
    const next = { x: velocity.x * keep, y: velocity.y * keep };
    return Math.hypot(next.x, next.y) < ICE_STOP_SPEED ? { x: 0, y: 0 } : next;
}
