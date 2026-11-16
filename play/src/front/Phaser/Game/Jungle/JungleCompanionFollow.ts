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
 * The places of the group behind a master, in the order the companions were tamed: `back` further behind the place on
 * the way (two tiles behind the master), `side` to the right of the way (negative: to the left), in pixels. Each one is
 * a tile away from the others at least: the animals (32 px wide) never stand on each other.
 */
export const COMPANION_SLOTS: readonly { back: number; side: number }[] = [
    { back: 0, side: 0 },
    { back: 12, side: -32 },
    { back: 12, side: 32 },
    { back: 40, side: -16 },
    { back: 40, side: 16 },
];
/** A companion moves to its new place in the group (the master turned) in about that long. */
const PLACE_EASE_MS = 250;
/** Shown slower than that, a companion stands still (its walk would barely move). */
const STILL_BELOW_PX_PER_S = 8;
/** The way is read that far ahead of the companion, so that a small wobble of the master does not turn the group. */
const HEADING_LOOKAHEAD_PX = 16;

/**
 * A companion walking behind its master: its place on the way goes through the positions its master went through, so
 * it goes around the walls they went around, and stops two tiles behind them (measured along that way). The companion
 * stands at its place of the group around that point (see COMPANION_SLOTS), turned with the way. Every client computes
 * it from the position of the master it sees.
 */
export class JungleCompanionFollower {
    /** Its place on the way of the master. */
    private position: Point;
    /** Where it stands: its place on the way, and the place of the group around it. */
    private shown: Point;
    /** From its place on the group to its place on the way, eased. */
    private offset: Point = { x: 0, y: 0 };
    /** Where the way goes, a unit vector: the group stands behind. */
    private heading: Point = { x: 0, y: 1 };
    private direction: WanderDirection = "down";
    /** The positions of the master the companion has not reached yet, oldest first. */
    private trail: Point[] = [];
    private lastMs: number;
    private stoppedAt: number;

    constructor(start: Point, nowMs: number) {
        this.position = { x: start.x, y: start.y };
        this.shown = { x: start.x, y: start.y };
        this.lastMs = nowMs;
        this.stoppedAt = nowMs;
    }

    /**
     * The pose at `nowMs`, its master's feet at `master`, at the place `slot` of the group (see COMPANION_SLOTS). A
     * position where the master should not be followed (in the water) is not recorded (`record` false): the companion
     * waits at the last one.
     */
    public poseAt(nowMs: number, master: Point, record: boolean, slot = 0): WanderPose {
        const elapsedMs = Math.min(MAX_FRAME_MS, Math.max(0, nowMs - this.lastMs));
        this.lastMs = nowMs;
        const place = COMPANION_SLOTS[slot] ?? COMPANION_SLOTS[0];
        if (Math.hypot(master.x - this.position.x, master.y - this.position.y) > COMPANION_TELEPORT_PX) {
            this.position = { x: master.x, y: master.y };
            this.trail = [];
            this.offset = this.placeOffset(place);
            this.shown = { x: this.position.x + this.offset.x, y: this.position.y + this.offset.y };
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
        if (step > 0.01) this.advance(step);
        this.updateHeading(master);
        const target = this.placeOffset(place);
        const ease = 1 - Math.exp(-elapsedMs / PLACE_EASE_MS);
        this.offset = {
            x: this.offset.x + (target.x - this.offset.x) * ease,
            y: this.offset.y + (target.y - this.offset.y) * ease,
        };
        const from = this.shown;
        this.shown = { x: this.position.x + this.offset.x, y: this.position.y + this.offset.y };
        const dx = this.shown.x - from.x;
        const dy = this.shown.y - from.y;
        if (elapsedMs === 0 || (Math.hypot(dx, dy) * 1000) / elapsedMs < STILL_BELOW_PX_PER_S) {
            return this.still(nowMs);
        }
        if (Math.abs(dx) >= Math.abs(dy)) this.direction = dx < 0 ? "left" : "right";
        else this.direction = dy < 0 ? "up" : "down";
        this.stoppedAt = nowMs;
        return { x: this.shown.x, y: this.shown.y, direction: this.direction, moving: true, pausedMs: 0 };
    }

    private still(nowMs: number): WanderPose {
        return {
            x: this.shown.x,
            y: this.shown.y,
            direction: this.direction,
            moving: false,
            pausedMs: nowMs - this.stoppedAt,
        };
    }

    /** From the place on the way to the place in the group, turned with the way. */
    private placeOffset(place: { back: number; side: number }): Point {
        const { x: hx, y: hy } = this.heading;
        // The right of the way is the heading turned a quarter clockwise (y goes down on the screen).
        return { x: -hx * place.back - hy * place.side, y: -hy * place.back + hx * place.side };
    }

    /** The way goes from its place on it to the first position of the master far enough, or to the master. */
    private updateHeading(master: Point): void {
        const ahead =
            this.trail.find(
                (point) => Math.hypot(point.x - this.position.x, point.y - this.position.y) >= HEADING_LOOKAHEAD_PX,
            ) ?? master;
        const dx = ahead.x - this.position.x;
        const dy = ahead.y - this.position.y;
        const length = Math.hypot(dx, dy);
        if (length < 1) return;
        this.heading = { x: dx / length, y: dy / length };
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
