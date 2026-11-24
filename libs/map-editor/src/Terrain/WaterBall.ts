import { TERRAIN_CELL } from "../types";

/**
 * A solid ball standing on a map: a sphere whose centre is at a point of the map (pixels) and at the altitude
 * `levelPx` of its relief, `radiusPx` wide and high (a pixel of altitude is as high as a pixel of the map is wide).
 * Half of it stands over that level, half of it goes under: into the ground, or into the water. Held at the level
 * of the water under it, it is half in the water. The altitude 0 when it says none.
 */
export interface WaterBall {
    x: number;
    y: number;
    radiusPx: number;
    levelPx?: number;
}

/** A cell is sampled this many times a side: the ball is as round as that for the water. */
const SAMPLES = 4;

/**
 * How high the ball stands over its own level in a cell of the relief, and as deep under it, in pixels: the mean
 * over the cell of the half height of the sphere (0 where it does not reach). So the cells of a ball hold exactly
 * its volume, and a cell at its rim is taken little by little as the ball moves.
 */
export function ballHalfHeight(ball: WaterBall, cellX: number, cellY: number): number {
    const radius = ball.radiusPx;
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return 0;
    const square = radius * radius;
    const step = TERRAIN_CELL / SAMPLES;
    let sum = 0;
    for (let row = 0; row < SAMPLES; row++) {
        const dy = cellY * TERRAIN_CELL + (row + 0.5) * step - ball.y;
        for (let column = 0; column < SAMPLES; column++) {
            const dx = cellX * TERRAIN_CELL + (column + 0.5) * step - ball.x;
            const left = square - dx * dx - dy * dy;
            if (left > 0) sum += Math.sqrt(left);
        }
    }
    return sum / (SAMPLES * SAMPLES);
}

/**
 * What a ball takes of a column of the map whose ground is at `groundPx`, where it stands `halfHeightPx` over its
 * level `levelPx` and as deep under it: the solid fills the heights from `levelPx - halfHeightPx` to
 * `levelPx + halfHeightPx`, but for what of it is in the ground. `underPx` is the room left for the water between
 * the ground and the underside of the ball; `topPx` is the altitude of its top, where the water it leaves no room
 * for has to stand. Undefined where the ball is not, or is all in the ground.
 */
export function ballColumn(
    groundPx: number,
    halfHeightPx: number,
    levelPx = 0,
): { underPx: number; topPx: number } | undefined {
    if (!(halfHeightPx > 0) || !Number.isFinite(halfHeightPx) || !Number.isFinite(levelPx)) return undefined;
    const topPx = levelPx + halfHeightPx;
    if (!(topPx > groundPx)) return undefined;
    return { underPx: Math.max(0, levelPx - halfHeightPx - groundPx), topPx };
}

/**
 * The water a ball held at `levelPx` pushes away where the water stands at `waterPx` over a ground at `groundPx`:
 * the height of the solid that is under the water and over the ground (Archimedes), in pixels of water over the
 * column.
 */
export function ballDisplaces(groundPx: number, halfHeightPx: number, waterPx: number, levelPx = 0): number {
    const column = ballColumn(groundPx, halfHeightPx, levelPx);
    if (!column) return 0;
    const underside = groundPx + column.underPx;
    return Math.max(0, Math.min(waterPx, column.topPx) - underside);
}
