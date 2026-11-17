import type { FloorWalkState } from "../MapEditor/MapLayer/FloorWalk";

/**
 * Altitude of the floor a player stands on, in pixels above the ground: a player variable, public and not saved, like
 * the torch's (no change to the protocol nor the back). The position of a player is the one on the screen; without
 * this the others would draw an avatar of a raised floor as standing on the ground, under the slabs.
 */
export const FLOOR_Z_VARIABLE = "_floorZ";
/** No floor is that high: a bigger value is not an altitude. */
const FLOOR_Z_MAX = 2000;
/** On a stair the altitude is shared by steps of this many pixels... */
const STAIR_STEP_PX = 4;
/** ...and at most this often. */
const STAIR_SHARE_MS = 150;

/** The altitude of another player, from their player variable: the ground for an older client or a broken value. */
export function decodeFloorZ(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= FLOOR_Z_MAX ? value : 0;
}

/**
 * The altitude to share now, undefined when there is nothing new to tell: `shared` is the last one sent, `elapsedMs`
 * the time since then. Standing on a floor, the exact altitude as soon as it changed; on a stair, where it changes at
 * every frame, a rounded one and not too often.
 */
export function floorZToShare(state: FloorWalkState, shared: number, elapsedMs: number): number | undefined {
    if (state.stair === undefined) {
        return state.elevation === shared ? undefined : state.elevation;
    }
    if (elapsedMs < STAIR_SHARE_MS) return undefined;
    const rounded = Math.round(state.elevation / STAIR_STEP_PX) * STAIR_STEP_PX;
    return rounded === shared ? undefined : rounded;
}
