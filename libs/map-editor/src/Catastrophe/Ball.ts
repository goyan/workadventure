import { TILE_PX } from "../types";
import type { WaterBall } from "../Terrain/WaterBall";

/** The diameter of a ball, in tiles: what a player chooses, from a buoy to a dome wider than a lake. */
export const BALL_MIN_TILES = 1;
export const BALL_MAX_TILES = 16;
export const BALL_DEFAULT_TILES = 4;
/** How long a ball is held after the last message of its player, in milliseconds: it follows a held click. */
export const BALL_LASTS_MS = 600;
/** How many balls can stand at once in a room. */
export const BALLS_PER_ROOM = 8;
/**
 * A ball is a solid: it never jumps. It goes after the pointer of its player no faster than this (two tiles a
 * second, about 2.2 m/s: a brisk walk), in map pixels a second.
 */
export const BALL_SPEED_PX_PER_SECOND = 64;
/**
 * And it swells from nothing, and shrinks back to nothing, no faster than this: pixels of radius a second. The
 * water it takes the place of is pushed away as fast as that, never all at once.
 */
export const BALL_GROWTH_PX_PER_SECOND = 64;
/** The longest a ball moves in one go, in seconds: a server that stalled does not make it leap. */
const LONGEST_MOVE_SECONDS = 0.25;
/** A radius smaller than this is none, in pixels. */
const NOTHING_PX = 1e-6;

/** The diameter of a ball of that size: one out of range is the nearest; a size that is none is the usual one. */
export function ballTiles(diameterTiles: number): number {
    if (!Number.isFinite(diameterTiles) || diameterTiles === 0) return BALL_DEFAULT_TILES;
    return Math.min(BALL_MAX_TILES, Math.max(BALL_MIN_TILES, Math.round(diameterTiles)));
}

/** The radius of a ball of that diameter (tiles), in pixels. */
export function ballRadiusPx(diameterTiles: number): number {
    return (ballTiles(diameterTiles) * TILE_PX) / 2;
}

/** A ball of a room: the solid as it is now, which goes after what its player asks for. */
export interface Ball extends WaterBall {
    id: number;
}

/**
 * Where a ball is `seconds` later: it went towards the point its player holds it at, and towards the radius they
 * chose, no faster than a ball goes. A ball nobody holds any more (`held` undefined) stays where it is and shrinks
 * to nothing. The same rule on the server, which decides, and in the browsers, which draw the ball between two
 * messages.
 */
export function advanceBall(ball: WaterBall, held: WaterBall | undefined, seconds: number): WaterBall {
    const time = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, LONGEST_MOVE_SECONDS) : 0;
    const grows = BALL_GROWTH_PX_PER_SECOND * time;
    if (!held) {
        // What rounding leaves of a ball that shrank to nothing is nothing.
        const left = ball.radiusPx - grows;
        return { x: ball.x, y: ball.y, radiusPx: left > NOTHING_PX ? left : 0 };
    }
    const reach = BALL_SPEED_PX_PER_SECOND * time;
    const dx = held.x - ball.x;
    const dy = held.y - ball.y;
    const away = Math.hypot(dx, dy);
    const share = away > reach ? reach / away : 1;
    const wanted = held.radiusPx - ball.radiusPx;
    return {
        x: ball.x + dx * share,
        y: ball.y + dy * share,
        radiusPx: ball.radiusPx + Math.max(-grows, Math.min(grows, wanted)),
    };
}
