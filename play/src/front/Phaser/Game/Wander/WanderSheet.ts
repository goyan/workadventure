import type { WanderDirection } from "./WanderSchedule";

/**
 * Width and height of a frame of a wandering sheet: one row per direction. The 3 first columns are the walk cycle
 * (step, still, step); a sheet of 5 columns or more also has rest poses: sitting (column 3) and lying (column 4).
 */
export const WANDER_FRAME_SIZE = 32;
export const WANDER_WALK_COLUMNS = 3;
const REST_COLUMNS = 5;
const SIT_COLUMN = 3;
const LIE_COLUMN = 4;
/** A character with rest poses sits as soon as it stops, and lies down once paused that long. */
export const WANDER_LIE_DOWN_AFTER_MS = 5_000;

const ROWS: Record<WanderDirection, number> = {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
};

/** The walk cycle of a direction: the three first frames of its row, back and forth. */
export function wanderWalkFrames(direction: WanderDirection, columns = WANDER_WALK_COLUMNS): number[] {
    const first = ROWS[direction] * columns;
    return [first, first + 1, first + 2, first + 1];
}

/** The frame shown when standing still: the middle one of the walk cycle. */
export function wanderIdleFrame(direction: WanderDirection, columns = WANDER_WALK_COLUMNS): number {
    return ROWS[direction] * columns + 1;
}

/** The frame shown after `pausedMs` standing still: the rest poses when the sheet has them, the idle frame otherwise. */
export function wanderStillFrame(direction: WanderDirection, pausedMs: number, columns: number): number {
    if (columns < REST_COLUMNS) {
        return wanderIdleFrame(direction, columns);
    }
    return ROWS[direction] * columns + (pausedMs < WANDER_LIE_DOWN_AFTER_MS ? SIT_COLUMN : LIE_COLUMN);
}
