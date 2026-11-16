import type { Point, WanderDirection, WanderPose } from "../Wander/WanderSchedule";

/** How far behind its master a companion walks, along the way they went: two tiles. */
export const COMPANION_FOLLOW_PX = 64;
/** Further than ten tiles from its master (a teleport, a long run in a vehicle), a companion jumps next to them. */
export const COMPANION_TELEPORT_PX = 320;
/** The slowest a companion walks: the speed of the wandering animals, a bit more. */
const MIN_SPEED_PX_PER_S = 96;
/** It walks faster the further behind it is, to keep up with a running master. */
const CATCH_UP_PER_S = 4;
const MAX_SPEED_PX_PER_S = 640;
/** The positions of the master are kept this far apart. */
const TRAIL_SPACING_PX = 4;
const MAX_TRAIL_POINTS = 256;
/** A frame longer than that (a hidden tab) moves it as much as that. */
const MAX_FRAME_MS = 250;

/**
 * A companion walking behind its master: it goes through the positions its master went through, so it goes around
 * the walls they went around, and stops two tiles behind them (measured along that way). Every client computes it
 * from the position of the master it sees.
 */
export class JungleCompanionFollower {
    private position: Point;
    private direction: WanderDirection = "down";
    /** The positions of the master the companion has not reached yet, oldest first. */
    private trail: Point[] = [];
    private lastMs: number;
    private stoppedAt: number;

    constructor(start: Point, nowMs: number) {
        this.position = { x: start.x, y: start.y };
        this.lastMs = nowMs;
        this.stoppedAt = nowMs;
    }

    /**
     * The pose at `nowMs`, its master's feet at `master`. A position where the master should not be followed (in the
     * water) is not recorded (`record` false): the companion waits at the last one.
     */
    public poseAt(nowMs: number, master: Point, record: boolean): WanderPose {
        const elapsedMs = Math.min(MAX_FRAME_MS, Math.max(0, nowMs - this.lastMs));
        this.lastMs = nowMs;
        if (Math.hypot(master.x - this.position.x, master.y - this.position.y) > COMPANION_TELEPORT_PX) {
            this.position = { x: master.x, y: master.y };
            this.trail = [];
            return this.still(nowMs);
        }
        if (record) this.record(master);
        const remaining = this.remaining();
        const step = Math.min(
            remaining - COMPANION_FOLLOW_PX,
            (Math.min(
                MAX_SPEED_PX_PER_S,
                Math.max(MIN_SPEED_PX_PER_S, (remaining - COMPANION_FOLLOW_PX) * CATCH_UP_PER_S),
            ) *
                elapsedMs) /
                1000,
        );
        if (step <= 0.01) return this.still(nowMs);
        const from = this.position;
        this.advance(step);
        const dx = this.position.x - from.x;
        const dy = this.position.y - from.y;
        if (Math.abs(dx) >= Math.abs(dy)) this.direction = dx < 0 ? "left" : "right";
        else this.direction = dy < 0 ? "up" : "down";
        this.stoppedAt = nowMs;
        return { x: this.position.x, y: this.position.y, direction: this.direction, moving: true, pausedMs: 0 };
    }

    private still(nowMs: number): WanderPose {
        return {
            x: this.position.x,
            y: this.position.y,
            direction: this.direction,
            moving: false,
            pausedMs: nowMs - this.stoppedAt,
        };
    }

    private record(master: Point): void {
        const last = this.trail.at(-1) ?? this.position;
        if (Math.hypot(master.x - last.x, master.y - last.y) < TRAIL_SPACING_PX) return;
        this.trail.push({ x: master.x, y: master.y });
        // A very long way (bounded by the teleport anyway): its oldest part is cut, straight to the next point.
        if (this.trail.length > MAX_TRAIL_POINTS) this.trail.shift();
    }

    /** The length of the way left, from the companion to the last position of its master. */
    private remaining(): number {
        let length = 0;
        let from = this.position;
        for (const point of this.trail) {
            length += Math.hypot(point.x - from.x, point.y - from.y);
            from = point;
        }
        return length;
    }

    private advance(distance: number): void {
        let left = distance;
        while (left > 0 && this.trail.length > 0) {
            const next = this.trail[0];
            const length = Math.hypot(next.x - this.position.x, next.y - this.position.y);
            if (length <= left) {
                this.position = { x: next.x, y: next.y };
                this.trail.shift();
                left -= length;
                continue;
            }
            this.position = {
                x: this.position.x + ((next.x - this.position.x) * left) / length,
                y: this.position.y + ((next.y - this.position.y) * left) / length,
            };
            left = 0;
        }
    }
}
