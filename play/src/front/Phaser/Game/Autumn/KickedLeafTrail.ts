import { FOOTPRINT_JUMP_PX, FOOTPRINT_MAX_SPEED_PX_PER_MS, type WalkerSample } from "../Christmas/FootprintTrail";
import { hash01, leafColor } from "./LeafPalette";

export const KICK_WALK_STEP_PX = 24;
export const KICK_RUN_STEP_PX = 16;
export const KICK_FALL_MS = 600;
export const KICK_FADE_MS = 2000;
export const KICK_MAX = 120;
const KICK_MIN_PX = 6;
const KICK_MAX_PX = 10;

/** A leaf kicked up at the feet: where it starts, and where it lands. */
export interface KickedLeaf {
    x: number;
    y: number;
    dx: number;
    dy: number;
    color: number;
}

interface WalkerState {
    x: number;
    y: number;
    /** Distance walked since the last kick. */
    distance: number;
    kicks: number;
    time: number | undefined;
}

/** Turns the positions of the players into leaves kicked up behind them. Nothing is sent over the network. */
export class KickedLeafTrail {
    private readonly walkers = new Map<string, WalkerState>();

    constructor(private readonly isOutdoor: (x: number, y: number) => boolean) {}

    update(samples: WalkerSample[], now?: number): KickedLeaf[] {
        const leaves: KickedLeaf[] = [];
        const seen = new Set<string>();
        for (const sample of samples) {
            seen.add(sample.id);
            const state = this.walkers.get(sample.id);
            const dx = state ? sample.x - state.x : 0;
            const dy = state ? sample.y - state.y : 0;
            const moved = Math.hypot(dx, dy);
            const elapsed = state?.time !== undefined && now !== undefined ? now - state.time : undefined;
            const tooFast = elapsed !== undefined && elapsed > 0 && moved / elapsed > FOOTPRINT_MAX_SPEED_PX_PER_MS;
            // A new player, a teleport or an appearance: start over from here, kicking nothing on the way.
            if (!state || moved > FOOTPRINT_JUMP_PX || tooFast) {
                this.walkers.set(sample.id, { x: sample.x, y: sample.y, distance: 0, kicks: 0, time: now });
                continue;
            }
            state.time = now;
            if (moved === 0) continue;
            state.x = sample.x;
            state.y = sample.y;
            state.distance += moved;
            const step = sample.running ? KICK_RUN_STEP_PX : KICK_WALK_STEP_PX;
            if (state.distance < step) continue;
            state.distance -= step;
            const kick = state.kicks++;
            if (!this.isOutdoor(sample.x, sample.y)) continue;
            const count = (sample.running ? 4 : 2) + (kick % 2);
            const heading = Math.atan2(dy, dx);
            for (let i = 0; i < count; i++) {
                // Sideways or backwards, never ahead of the walker.
                const angle = heading + Math.PI / 2 + hash01(kick, i) * Math.PI;
                const distance = KICK_MIN_PX + hash01(kick, i, 1) * (KICK_MAX_PX - KICK_MIN_PX);
                leaves.push({
                    x: sample.x,
                    y: sample.y,
                    dx: Math.cos(angle) * distance,
                    dy: Math.sin(angle) * distance,
                    color: leafColor(hash01(kick, i, 2)),
                });
            }
        }
        for (const id of this.walkers.keys()) {
            if (!seen.has(id)) this.walkers.delete(id);
        }
        return leaves;
    }
}
