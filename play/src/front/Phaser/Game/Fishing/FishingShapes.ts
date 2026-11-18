import { FISHING_CAST_MAX_TILES, FISHING_CAST_MIN_TILES } from "@workadventure/map-editor";
import type { PositionMessage_Direction } from "@workadventure/messages";
import { nerfGunPose } from "../Nerf/NerfProtocol";
import { FISHING_LINE } from "./FishingProtocol";

/** The rod goes this far forward and up from the hand. */
const ROD_FORWARD_PX = 9;
const ROD_UP_PX = 15;
/** A seated avatar holds things 4 px higher (see NerfGunEffect). */
const SEATED_LIFT_PX = 4;
/** A biting fish pulls the float this far down. */
const BITE_PLUNGE_PX = 4;
const LINE_POINTS = 13;

export interface Point {
    x: number;
    y: number;
}

/** The hand that holds the rod, from the position of the avatar. */
export function rodHand(x: number, y: number, direction: PositionMessage_Direction, seated: boolean): Point {
    const hand = nerfGunPose(direction);
    return { x: x + hand.x, y: y + hand.y - (seated ? SEATED_LIFT_PX : 0) };
}

/** The tip of the rod: above the avatar, towards where it faces. */
export function rodTip(x: number, y: number, direction: PositionMessage_Direction, seated: boolean): Point {
    const pose = nerfGunPose(direction);
    const hand = rodHand(x, y, direction, seated);
    return { x: hand.x + Math.round(pose.dx * ROD_FORWARD_PX), y: hand.y - ROD_UP_PX };
}

/** How full the gauge of the cast is, from 0 (one tile) to 1 (eight). */
export function gaugeFill(tiles: number): number {
    const share = (tiles - FISHING_CAST_MIN_TILES) / (FISHING_CAST_MAX_TILES - FISHING_CAST_MIN_TILES);
    return Math.max(0, Math.min(1, share));
}

/**
 * How far under its place the float is drawn: it bobs while it waits, plunges when a fish bites, shakes while the
 * fish is brought in. Still (but for the plunge, which is the signal) for who asked for less motion.
 */
export function bobOffset(state: number, timeMs: number, reducedMotion: boolean): number {
    if (state === FISHING_LINE.bite) return BITE_PLUNGE_PX;
    if (reducedMotion) return 0;
    if (state === FISHING_LINE.reeling) return Math.sin(timeMs / 60);
    return Math.sin(timeMs / 400);
}

/** The line from the tip of the rod to the float: a curve that hangs `sag` pixels in its middle. */
export function lineCurve(from: Point, to: Point, sag: number): Point[] {
    const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 2 * sag };
    const points: Point[] = [];
    for (let index = 0; index < LINE_POINTS; index++) {
        const t = index / (LINE_POINTS - 1);
        const u = 1 - t;
        points.push({
            x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
            y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
        });
    }
    return points;
}
