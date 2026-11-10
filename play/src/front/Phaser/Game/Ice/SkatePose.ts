import { PlayerAnimationTypes } from "../../Player/Animation";

/** How far a skater leans towards the foot it glides on, in radians (4°). */
export const ICE_SKATE_LEAN = (4 * Math.PI) / 180;
/** How long the lean takes to get most of the way to the foot it glides on (63%, a time constant). */
const LEAN_TIME_MS = 90;

/** The animation of a character: on the ice, a moving character skates instead of walking. */
export function moveAnimationType(moving: boolean, onIce: boolean): PlayerAnimationTypes {
    if (!moving) return PlayerAnimationTypes.Idle;
    return onIce ? PlayerAnimationTypes.IceSkate : PlayerAnimationTypes.Walk;
}

/**
 * The lean of a skater showing this frame of its sheet: each direction has three frames, one foot forward, standing,
 * the other foot forward. It leans towards the first foot, the other way on the second, and stands straight between.
 */
export function skateLean(frame: number): number {
    const column = frame % 3;
    if (column === 0) return ICE_SKATE_LEAN;
    if (column === 2) return -ICE_SKATE_LEAN;
    return 0;
}

/** The lean after `dtMs`, easing towards `target` whatever the frame rate. */
export function stepLean(current: number, target: number, dtMs: number): number {
    return target + (current - target) * Math.exp(-Math.max(dtMs, 0) / LEAN_TIME_MS);
}
