import { TERRAIN_CELL, TILE_PX } from "../types";
import type { WaterBall } from "../Terrain/WaterBall";

/** The diameter of a ball, in tiles: what a player chooses, from a buoy to a dome wider than a lake. */
export const BALL_MIN_TILES = 1;
export const BALL_MAX_TILES = 16;
export const BALL_DEFAULT_TILES = 4;
/**
 * How long a ball stands after the last message of its player, in milliseconds, when they do not say they let it
 * go: a player who left, or whose connection dropped.
 */
export const BALL_LASTS_MS = 600;
/**
 * A browser tells where its ball is this often while it is dragged, in milliseconds, so that everybody sees it
 * follow the pointer; and that often at least while it is held still.
 */
export const BALL_REPORT_MS = 50;
export const BALL_STILL_REPORT_MS = 200;
/** The server ignores the messages of a ball that come faster than this, in milliseconds. */
export const BALL_MIN_REPORT_MS = 20;
/** How many balls can stand at once in a room. */
export const BALLS_PER_ROOM = 8;
/**
 * A ball that moved between two steps of the water is taken along its way by strides of a cell, this many at most
 * in a step: further than that many cells in a step (32 tiles a second), the strides are longer.
 */
export const BALL_SWEEP_MOST_STRIDES = 32;

/**
 * A ball that moved keeps its level while the water it now stands in is within this of it, in pixels: it does not
 * bob on the swell it makes, it goes up or down when it comes onto another water, or onto the ground.
 */
export const BALL_LEVEL_SLACK_PX = 6;

/**
 * The water a ball stands in is looked for through the dry cells this near the point it is held at, in cells: a
 * ball dragged fast sweeps the bed dry under itself and behind, as far as it is wide.
 */
export const BALL_LEVEL_REACH_CELLS = 20;

/** A ball held still breaks the ice under it again this often, in milliseconds: the frost closes what it opened. */
export const BALL_ICE_AGAIN_MS = 1000;
/** The ice of the way of a ball between two of its messages is broken by this many discs at most. */
export const BALL_ICE_MOST_DISCS = 16;

/** Where the ice under a ball was last broken, and with what size of ball and when (ms). */
export interface BallIceMark {
    x: number;
    y: number;
    radiusPx: number;
    at: number;
}

/**
 * The points of the map (pixels) to break the ice around, with the disc of the ball (its radius, the sphere being cut
 * by the surface at its middle), for a ball now at `ball` that was last broken at `last`; none when the ice under it
 * is broken already: it moved less than half its radius (a tile at least) since, is of the same size, and was broken
 * less than BALL_ICE_AGAIN_MS ago. A ball that moved breaks the ice of its way, a disc every radius.
 */
export function ballIceDiscs(
    last: BallIceMark | undefined,
    ball: { x: number; y: number; radiusPx: number },
    now: number,
): { x: number; y: number }[] {
    if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return [];
    if (!last) return [{ x: ball.x, y: ball.y }];
    const away = Math.hypot(ball.x - last.x, ball.y - last.y);
    if (
        last.radiusPx === ball.radiusPx &&
        now - last.at < BALL_ICE_AGAIN_MS &&
        away < Math.max(TILE_PX, ball.radiusPx / 2)
    ) {
        return [];
    }
    const discs = Math.min(BALL_ICE_MOST_DISCS, Math.max(1, Math.ceil(away / Math.max(TILE_PX, ball.radiusPx))));
    const way: { x: number; y: number }[] = [];
    for (let disc = 1; disc <= discs; disc++) {
        way.push({ x: last.x + ((ball.x - last.x) * disc) / discs, y: last.y + ((ball.y - last.y) * disc) / discs });
    }
    return way;
}

/** The diameter of a ball of that size: one out of range is the nearest; a size that is none is the usual one. */
export function ballTiles(diameterTiles: number): number {
    if (!Number.isFinite(diameterTiles) || diameterTiles === 0) return BALL_DEFAULT_TILES;
    return Math.min(BALL_MAX_TILES, Math.max(BALL_MIN_TILES, Math.round(diameterTiles)));
}

/** The radius of a ball of that diameter (tiles), in pixels. */
export function ballRadiusPx(diameterTiles: number): number {
    return (ballTiles(diameterTiles) * TILE_PX) / 2;
}

/** A ball of a room: the solid sphere a player holds under their pointer. */
export interface Ball extends WaterBall {
    id: number;
}

/**
 * The balls of a room between two steps of its water: where they were (`before`), where they are (`now`). A ball is
 * under the pointer of its player at once, so it may have gone several cells since the last step, and up or down
 * to the level of another water: it did not leap there, it went along the way, and pushed the water of the whole
 * way. Returns where the balls stand stride after stride, the last one being `now`: a ball that moved goes a cell
 * at a time, of the map as of altitude, along the straight way from where it was; one that came is there at once,
 * whole; one that went is gone at once.
 */
export function sweepBalls(before: readonly Ball[], now: readonly Ball[]): Ball[][] {
    const from = new Map<number, Ball>();
    for (const ball of before) from.set(ball.id, ball);
    let furthest = 0;
    for (const ball of now) {
        const was = from.get(ball.id);
        if (!was) continue;
        const away = Math.max(
            Math.hypot(ball.x - was.x, ball.y - was.y),
            Math.abs((ball.levelPx ?? 0) - (was.levelPx ?? 0)),
        );
        if (Number.isFinite(away) && away > furthest) furthest = away;
    }
    const strides = Math.min(BALL_SWEEP_MOST_STRIDES, Math.max(1, Math.ceil(furthest / TERRAIN_CELL)));
    const way: Ball[][] = [];
    for (let stride = 1; stride <= strides; stride++) {
        const share = stride / strides;
        way.push(
            now.map((ball) => {
                const was = from.get(ball.id);
                if (!was || stride === strides || !Number.isFinite(was.x) || !Number.isFinite(was.y)) {
                    return { ...ball };
                }
                const level = was.levelPx ?? 0;
                return {
                    ...ball,
                    x: was.x + (ball.x - was.x) * share,
                    y: was.y + (ball.y - was.y) * share,
                    ...(ball.levelPx === undefined && was.levelPx === undefined
                        ? {}
                        : { levelPx: level + ((ball.levelPx ?? 0) - level) * share }),
                };
            }),
        );
    }
    return way;
}
