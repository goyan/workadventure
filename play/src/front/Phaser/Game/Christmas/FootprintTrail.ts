/** Where a player's feet are, and whether they run. */
export interface WalkerSample {
    id: string;
    x: number;
    y: number;
    running: boolean;
}

export type FootprintMark =
    | { kind: "step"; x: number; y: number; angle: number; side: -1 | 1 }
    | { kind: "trail"; x1: number; y1: number; x2: number; y2: number };

export const FOOTPRINT_STEP_PX = 16;
export const FOOTPRINT_JUMP_PX = 64;
export const FOOTPRINT_FADE_MS = 45_000;
export const FOOTPRINT_MAX = 400;
/** A running trail is cut in segments of at least this length. */
const TRAIL_SEGMENT_PX = 8;
/** Steps sit left and right of the path. */
const STEP_SIDE_OFFSET_PX = 3;

interface WalkerState {
    x: number;
    y: number;
    /** Distance walked since the last step. */
    distance: number;
    side: -1 | 1;
    /** Where the running trail continues from. */
    trailX: number;
    trailY: number;
}

/** Turns the positions of the players into footprints in the snow. Nothing is sent over the network. */
export class FootprintTrail {
    private readonly walkers = new Map<string, WalkerState>();

    constructor(private readonly isOutdoor: (x: number, y: number) => boolean) {}

    update(samples: WalkerSample[]): FootprintMark[] {
        const marks: FootprintMark[] = [];
        const seen = new Set<string>();
        for (const sample of samples) {
            seen.add(sample.id);
            const state = this.walkers.get(sample.id);
            const dx = state ? sample.x - state.x : 0;
            const dy = state ? sample.y - state.y : 0;
            const moved = Math.hypot(dx, dy);
            // A new player, a teleport or an appearance: start over from here, without a line across the map.
            if (!state || moved > FOOTPRINT_JUMP_PX) {
                this.walkers.set(sample.id, {
                    x: sample.x,
                    y: sample.y,
                    distance: 0,
                    side: 1,
                    trailX: sample.x,
                    trailY: sample.y,
                });
                continue;
            }
            if (moved === 0) continue;
            state.x = sample.x;
            state.y = sample.y;
            if (sample.running) {
                if (Math.hypot(sample.x - state.trailX, sample.y - state.trailY) >= TRAIL_SEGMENT_PX) {
                    if (this.isOutdoor(state.trailX, state.trailY) && this.isOutdoor(sample.x, sample.y)) {
                        marks.push({ kind: "trail", x1: state.trailX, y1: state.trailY, x2: sample.x, y2: sample.y });
                    }
                    state.trailX = sample.x;
                    state.trailY = sample.y;
                }
                continue;
            }
            state.trailX = sample.x;
            state.trailY = sample.y;
            state.distance += moved;
            if (state.distance < FOOTPRINT_STEP_PX) continue;
            state.distance -= FOOTPRINT_STEP_PX;
            if (this.isOutdoor(sample.x, sample.y)) {
                const angle = Math.atan2(dy, dx);
                const offset = STEP_SIDE_OFFSET_PX * state.side;
                marks.push({
                    kind: "step",
                    x: sample.x - Math.sin(angle) * offset,
                    y: sample.y + Math.cos(angle) * offset,
                    angle,
                    side: state.side,
                });
            }
            state.side = state.side === 1 ? -1 : 1;
        }
        for (const id of this.walkers.keys()) {
            if (!seen.has(id)) this.walkers.delete(id);
        }
        return marks;
    }
}
