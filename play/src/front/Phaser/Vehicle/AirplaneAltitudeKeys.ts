/** What the space key does for a player in its airplane (see GameSceneUserInputHandler). */
export interface SpaceClimbContext {
    /** In its airplane, flying or standing on the ground. */
    inAirplane: boolean;
    /** Above the ground: nothing of the ground is in reach. */
    flying: boolean;
    /** A prompt other than the airplane's own is shown, or an object next to the avatar is selected. */
    spaceAskedFor: boolean;
    /** The Nerf or the fishing rod is in hand: they take the space key on the ground. */
    toolInHand: boolean;
}

/**
 * Whether a press of the space key climbs. In flight it always does: nothing of the ground is in reach. On the
 * ground, a prompt or a tool in hand keeps the key as before, and the plane takes off only when nothing else asks
 * for it.
 */
export function spaceClimbs(context: SpaceClimbContext): boolean {
    if (!context.inAirplane) return false;
    if (context.flying) return true;
    return !context.spaceAskedFor && !context.toolInHand;
}

/** Climb (1), come down (-1) or hold the altitude (0): both keys held cancel each other. */
export function altitudeCommand(climbHeld: boolean, descendHeld: boolean): -1 | 0 | 1 {
    if (climbHeld === descendHeld) return 0;
    return climbHeld ? 1 : -1;
}
