import type { WanderDirection } from "./WanderSchedule";

/** One drink: the head goes down, laps, comes back up, and the animal looks around before the next one. */
export const DRINK_CYCLE_MS = 2_400;
/** The stance changes by steps, like the frames of a sprite. */
const STEP_MS = 100;
/** The share of a cycle spent head down. */
const HEAD_DOWN_SHARE = 0.75;
const LAP_MS = 200;
/** How far an animal seen from the side bows to the water, in degrees. */
const BOW_DEGREES = 16;
/** How much an animal seen from the front or the back crouches. */
const CROUCH_SCALE = 0.88;

/** How a drinking animal is drawn, from its standing frame: moved by `dx`, `dy` pixels, turned, squeezed. */
export interface DrinkStance {
    dx: number;
    dy: number;
    angle: number;
    scaleY: number;
}

const STANDING: DrinkStance = { dx: 0, dy: 0, angle: 0, scaleY: 1 };

/**
 * The stance of an animal that has been drinking for `elapsedMs`, turned to the water (`direction`). No sheet has a
 * drinking frame: the standing frame bows to the water on its side, or crouches when the water is above or under
 * it, and its head moves a pixel to and fro while it laps. With `reducedMotion`, one still stance, head down.
 */
export function drinkStance(direction: WanderDirection, elapsedMs: number, reducedMotion: boolean): DrinkStance {
    const step = Math.floor(Math.max(0, elapsedMs) / STEP_MS) * STEP_MS;
    const inCycle = step % DRINK_CYCLE_MS;
    if (!reducedMotion && inCycle >= DRINK_CYCLE_MS * HEAD_DOWN_SHARE) {
        return STANDING;
    }
    const lap = reducedMotion ? 0 : Math.floor(inCycle / LAP_MS) % 2;
    switch (direction) {
        case "right":
            return { dx: lap, dy: 0, angle: BOW_DEGREES, scaleY: 1 };
        case "left":
            return { dx: lap === 0 ? 0 : -lap, dy: 0, angle: -BOW_DEGREES, scaleY: 1 };
        case "down":
            // The feet stay where they are (the sprite is held by its feet): the head comes down to the water.
            return { dx: 0, dy: 1 + lap, angle: 0, scaleY: CROUCH_SCALE };
        case "up":
            return { dx: lap, dy: 0, angle: 0, scaleY: CROUCH_SCALE };
    }
}
