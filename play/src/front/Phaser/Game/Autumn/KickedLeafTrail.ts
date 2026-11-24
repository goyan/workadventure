import { FOOTPRINT_JUMP_PX, FOOTPRINT_MAX_SPEED_PX_PER_MS, type WalkerSample } from "../Christmas/FootprintTrail";
import { hash01, leafColor } from "./LeafPalette";

export const KICK_WALK_STEP_PX = 24;
export const KICK_RUN_STEP_PX = 16;
export const KICK_FALL_MS = 700;
export const KICK_FADE_MS = 2000;
export const KICK_MAX = 120;
const KICK_MIN_PX = 8;
const KICK_MAX_PX = 14;
/** The two wheels of a skateboard roll this far either side of its middle (as their tracks in the snow). */
const WHEEL_SIDE_OFFSET_PX = 2;
/** How far a wheel pushes a leaf aside. */
const WHEEL_PUSH_MIN_PX = 3;
const WHEEL_PUSH_MAX_PX = 6;

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
            const step = sample.running || sample.wheels ? KICK_RUN_STEP_PX : KICK_WALK_STEP_PX;
            if (state.distance < step) continue;
            state.distance -= step;
            const kick = state.kicks++;
            if (!this.isOutdoor(sample.x, sample.y)) continue;
            if (sample.wheels) {
                leaves.push(...wheelSpray(sample.x, sample.y, Math.atan2(dy, dx), sample.wheels, kick));
                continue;
            }
            const count = (sample.running ? 5 : 3) + (kick % 2);
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

/**
 * The leaves a wheel rolling through pushes aside: a leaf each side of its track, thrown across the way and a little
 * back, so that one track (an electric unicycle) or two close ones (a skateboard) open in the leaves as it passes.
 */
function wheelSpray(x: number, y: number, heading: number, wheels: 1 | 2, kick: number): KickedLeaf[] {
    const acrossX = -Math.sin(heading);
    const acrossY = Math.cos(heading);
    const offsets = wheels === 2 ? [-WHEEL_SIDE_OFFSET_PX, WHEEL_SIDE_OFFSET_PX] : [0];
    return offsets.flatMap((offset, wheel) =>
        ([-1, 1] as const).map((side, i) => {
            const push = WHEEL_PUSH_MIN_PX + hash01(kick, wheel * 2 + i, 3) * (WHEEL_PUSH_MAX_PX - WHEEL_PUSH_MIN_PX);
            const back = hash01(kick, wheel * 2 + i, 4) * 2;
            return {
                x: x + acrossX * offset,
                y: y + acrossY * offset,
                dx: acrossX * side * push - Math.cos(heading) * back,
                dy: acrossY * side * push - Math.sin(heading) * back,
                color: leafColor(hash01(kick, wheel * 2 + i, 5)),
            };
        }),
    );
}
