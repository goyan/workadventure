import { BALL_REPORT_MS, ballColumn, ballHalfHeight, ballRadiusPx, TERRAIN_CELL } from "@workadventure/map-editor";
import type { WaterBall } from "@workadventure/map-editor";
import type { CatastropheMessage } from "@workadventure/messages";

/** The tones of a ball, from its darkest shade (0) to its glint (the last one). */
export const BALL_TONES = 6;
/** A ball is drawn in about this many blocks across its radius, whatever its size: large pixels for a large ball. */
const BLOCKS_PER_RADIUS = 24;
const SMALLEST_BLOCK_PX = 2;
/** Where the light comes from: the top left, and above. */
const LIGHT = { x: -0.46, y: -0.56, z: 0.69 };
/** From this share of the full light on, a block is the glint of the ball. */
const GLINT_FROM = 0.975;
/** Water this thin over the ball is not drawn over it, in pixels. */
const FILM_PX = 0.5;
/** The line of the water around a ball is looked at in this many points, never fewer nor more. */
const FEWEST_LINE_POINTS = 16;
const MOST_LINE_POINTS = 96;
/** A ball with water along this share of its rim stands in the water. */
const AFLOAT_SHARE = 0.6;

/** A square of a ball: its top left corner (map pixels), its tone, and whether water stands over it. */
export interface BallBlock {
    x: number;
    y: number;
    tone: number;
    wet: boolean;
}

/** The ground and the water of the map under a point (map pixels): the altitude of the ground, the depth of the water. */
export type BallCover = (x: number, y: number) => { groundPx: number; waterPx: number };

/** How wide the blocks of a ball of that radius are, in pixels. */
export function ballBlockPx(radiusPx: number): number {
    return Math.max(SMALLEST_BLOCK_PX, Math.ceil(radiusPx / BLOCKS_PER_RADIUS));
}

/**
 * A ball seen from above, in blocks: a sphere lit from the top left, in a few flat tones. What of it is in the
 * ground is not drawn (on a mount higher than its radius, nothing); what the water stands over is told wet, so that
 * it is drawn under the tint of the water. The water lower than its underside does not wet it.
 */
export function ballBlocks(ball: WaterBall, coverAt: BallCover): BallBlock[] {
    const { x, y, radiusPx } = ball;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radiusPx) || radiusPx <= 0) return [];
    const size = ballBlockPx(radiusPx);
    const square = radiusPx * radiusPx;
    const blocks: BallBlock[] = [];
    // The ground, the water and the top of the ball of each cell of the relief, read once.
    const cells = new Map<number, { groundPx: number; overPx: number }>();
    const span = Math.ceil(radiusPx / size);
    for (let row = -span; row < span; row++) {
        for (let column = -span; column < span; column++) {
            const dx = (column + 0.5) * size;
            const dy = (row + 0.5) * size;
            const left = square - dx * dx - dy * dy;
            if (left <= 0) continue;
            const height = Math.sqrt(left);
            const cellX = Math.floor((x + dx) / TERRAIN_CELL);
            const cellY = Math.floor((y + dy) / TERRAIN_CELL);
            const key = cellY * 65536 + cellX;
            let cell = cells.get(key);
            if (!cell) {
                const cover = coverAt(x + dx, y + dy);
                const stands = ballHalfHeight(ball, cellX, cellY);
                const solid = ballColumn(cover.groundPx, stands);
                // The water stands over the ball when there is more of it than fits under: up to that altitude.
                const over = solid && cover.waterPx > solid.underPx + FILM_PX ? solid.topPx + cover.waterPx : -Infinity;
                cell = { groundPx: cover.groundPx, overPx: over };
                cells.set(key, cell);
            }
            if (height <= cell.groundPx) continue;
            const light = (dx * LIGHT.x + dy * LIGHT.y + height * LIGHT.z) / radiusPx;
            const tone =
                light >= GLINT_FROM
                    ? BALL_TONES - 1
                    : Math.min(BALL_TONES - 2, Math.floor(Math.max(0, light) * (BALL_TONES - 1)));
            blocks.push({ x: x + column * size, y: y + row * size, tone, wet: height <= cell.overPx });
        }
    }
    return blocks;
}

/** The line where the water meets a ball, seen from above: its arcs, and whether water is nearly all around. */
export interface BallWaterline {
    arcs: { points: { x: number; y: number }[]; closed: boolean }[];
    afloat: boolean;
}

/**
 * Where the water around a ball meets it: looked at all around, a cell past its rim. Where water stands there, the
 * line is where the sphere crosses its level: drawn in when the water is higher than the middle of the ball, at the
 * rim when it is lower (the ball then touches it under its widest part). None along dry ground, nor around a ball
 * the water stands over.
 */
export function ballWaterline(ball: WaterBall, coverAt: BallCover): BallWaterline {
    const { x, y, radiusPx } = ball;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radiusPx) || radiusPx <= 0) {
        return { arcs: [], afloat: false };
    }
    const count = Math.min(MOST_LINE_POINTS, Math.max(FEWEST_LINE_POINTS, Math.round((2 * Math.PI * radiusPx) / 6)));
    const points: ({ x: number; y: number } | undefined)[] = [];
    let wet = 0;
    for (let at = 0; at < count; at++) {
        const angle = (2 * Math.PI * (at + 0.5)) / count;
        const away = { x: Math.cos(angle), y: Math.sin(angle) };
        const cover = coverAt(x + away.x * (radiusPx + TERRAIN_CELL), y + away.y * (radiusPx + TERRAIN_CELL));
        const level = cover.groundPx + cover.waterPx;
        if (cover.waterPx <= FILM_PX || level >= radiusPx) {
            points.push(undefined);
            continue;
        }
        const reach = level > 0 ? Math.sqrt(radiusPx * radiusPx - level * level) : radiusPx;
        points.push({ x: x + away.x * reach, y: y + away.y * reach });
        wet++;
    }
    const afloat = wet >= count * AFLOAT_SHARE;
    if (wet === 0) return { arcs: [], afloat };
    if (wet === count) {
        return { arcs: [{ points: points.filter((point) => point !== undefined), closed: true }], afloat };
    }
    // The arcs, read from a dry spot on, so that none is cut in two where the turn begins.
    const start = points.findIndex((point) => point === undefined);
    const arcs: BallWaterline["arcs"] = [];
    let arc: { x: number; y: number }[] = [];
    for (let step = 1; step <= count; step++) {
        const point = points[(start + step) % count];
        if (point) arc.push(point);
        else if (arc.length > 0) {
            arcs.push({ points: arc, closed: false });
            arc = [];
        }
    }
    return { arcs, afloat };
}

/** A ball another player holds, as a browser shows it: where the server last told it, and where it was shown then. */
export interface ToldBall extends WaterBall {
    fromX: number;
    fromY: number;
    /** When the server told it, and until when it stands if nothing more is told (ms of the game). */
    toldAt: number;
    until: number;
}

type BallReport = Pick<CatastropheMessage, "x" | "y" | "radiusTiles" | "impactInMs">;

/**
 * The ball of a message of the server: whole, where its player holds it, `message.impactInMs` more. One already
 * shown goes there from where it is shown (see glideBall); a new one is there at once.
 */
export function tellBall(known: ToldBall | undefined, message: BallReport, receivedAt: number): ToldBall {
    const from = known ? glideBall(known, receivedAt) : message;
    return {
        x: message.x,
        y: message.y,
        radiusPx: ballRadiusPx(message.radiusTiles),
        fromX: from.x,
        fromY: from.y,
        toldAt: receivedAt,
        until: receivedAt + message.impactInMs,
    };
}

/**
 * Where a ball told by the server is shown at `now` (ms of the game): it is where the server told it once the time
 * between two messages has gone by, and on the straight way there meanwhile, so that it does not hop.
 */
export function glideBall(ball: ToldBall, now: number): WaterBall {
    const share = Math.min(1, Math.max(0, (now - ball.toldAt) / BALL_REPORT_MS));
    return {
        x: ball.fromX + (ball.x - ball.fromX) * share,
        y: ball.fromY + (ball.y - ball.fromY) * share,
        radiusPx: ball.radiusPx,
    };
}
