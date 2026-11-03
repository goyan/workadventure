import type { WanderDirection } from "./WanderSchedule";

/** Width and height of a frame of a wandering sheet: 3 frames per row, one row per direction. */
export const WANDER_FRAME_SIZE = 32;
const FRAMES_PER_ROW = 3;

const ROWS: Record<WanderDirection, number> = {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
};

/** The walk cycle of a direction: the three frames of its row, back and forth. */
export function wanderWalkFrames(direction: WanderDirection): number[] {
    const first = ROWS[direction] * FRAMES_PER_ROW;
    return [first, first + 1, first + 2, first + 1];
}

/** The frame shown when standing still: the middle one of the row. */
export function wanderIdleFrame(direction: WanderDirection): number {
    return ROWS[direction] * FRAMES_PER_ROW + 1;
}
