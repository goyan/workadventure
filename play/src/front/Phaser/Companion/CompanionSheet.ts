import type { WanderDirection } from "../Game/Wander/WanderSchedule";
import { WANDER_FRAME_SIZE, WANDER_WALK_COLUMNS, wanderStillFrame } from "../Game/Wander/WanderSheet";

/**
 * A companion sheet has the layout of a wandering sheet (see WanderSheet): one row per direction, a walk cycle on the 3
 * first columns, and with 5 columns or more, sitting and lying poses shown while the player stands still.
 */
export function companionColumns(sheetWidth: number): number {
    return Math.max(WANDER_WALK_COLUMNS, Math.floor(sheetWidth / WANDER_FRAME_SIZE));
}

const ROWS: Record<WanderDirection, number> = { down: 0, left: 1, right: 2, up: 3 };

/** The walk cycle of a companion: the three first frames of the row, in a loop. */
export function companionWalkFrames(direction: WanderDirection, columns: number): number[] {
    const first = ROWS[direction] * columns;
    return [first, first + 1, first + 2];
}

/** The frame shown after the player stood still for `idleMs`: sitting, then lying, when the sheet has them. */
export function companionStillFrame(direction: WanderDirection, idleMs: number, columns: number): number {
    return wanderStillFrame(direction, idleMs, columns);
}
