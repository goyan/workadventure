import { floorDepth } from "../MapEditor/MapLayer/FloorDepth";
import type { PlacedStair } from "../MapEditor/MapLayer/FloorModel";
import type { FloorWalkState } from "../MapEditor/MapLayer/FloorWalk";

/**
 * Where the avatar is, among the floors of the map: its own floor is drawn as it is, the floors under it are greyed by
 * one dark veil laid just under its floor (everything lower is drawn under it), the floors above it are a grey veil.
 */

/** The veil over the floors under the avatar: dark grey, about opaque to the eye over what it covers. */
export const VEIL_COLOR = 0x2b2f38;
export const VEIL_ALPHA = 0.45;
/** A floor above the avatar: this opaque, greyed by this tint. */
export const ABOVE_ALPHA = 0.3;
export const ABOVE_TINT = 0x9aa0aa;
/** Fade of the veil when the avatar changes floors. */
export const LEVEL_FADE_MS = 300;

export type LevelLook = "below" | "current" | "above";

/** The floors the avatar is on: its own, or both floors of the stair it is on (no blink while it climbs). */
export function currentLevels(state: FloorWalkState, stairs: readonly PlacedStair[]): ReadonlySet<number> {
    const stair = state.stair === undefined ? undefined : stairs[state.stair];
    return stair ? new Set([stair.base, stair.top]) : new Set([state.elevation]);
}

export function levelLook(elevation: number, current: ReadonlySet<number>): LevelLook {
    const levels = [...current];
    if (elevation < Math.min(...levels)) return "below";
    if (elevation > Math.max(...levels)) return "above";
    return "current";
}

/**
 * Depth of the veil: just under the slabs of the lowest current floor (drawn at `floorDepth(level, 0) - 1`), over
 * everything standing lower. None on the ground: nothing is under it.
 */
export function veilDepth(current: ReadonlySet<number>): number | undefined {
    const lowest = Math.min(...current);
    return lowest > 0 ? floorDepth(lowest, 0) - 2 : undefined;
}

/** One step of a fade from `value` to `target` over LEVEL_FADE_MS for the whole `span`; at once when motion is reduced. */
export function fadeToward(value: number, target: number, delta: number, span: number, reducedMotion: boolean): number {
    if (reducedMotion) return target;
    const change = (span * delta) / LEVEL_FADE_MS;
    return target > value ? Math.min(target, value + change) : Math.max(target, value - change);
}
