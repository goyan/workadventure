import {
    advanceBall,
    ballColumn,
    ballHalfHeight,
    ballRadiusPx,
    BALL_MAX_TILES,
    TERRAIN_CELL,
} from "@workadventure/map-editor";
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
/** The server tells the solid further than this from where a browser shows it (pixels): the browser takes its word. */
const FAR_OFF_PX = 24;
const FAR_OFF_RADIUS_PX = 12;
/** A ball is moved by slices of this long, in milliseconds, as on the server. */
const SLICE_MS = 100;

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

/** A ball as a browser shows it: the solid, what its player asks for, and until when (ms of the game). */
export interface ShownBall extends WaterBall {
    held: WaterBall;
    until: number;
    /** When the solid was last moved, in ms of the game. */
    movedAt: number;
}

type BallReport = Pick<CatastropheMessage, "x" | "y" | "radiusTiles" | "impactInMs" | "ballX" | "ballY" | "ballRadius">;

/**
 * The ball of a message of the server: held where its player asks, `message.impactInMs` more. A ball not seen yet
 * is where the server says the solid is; one already shown stays where the browser moved it, by the rule of the
 * server, unless the server tells it far from there.
 */
export function followBall(known: ShownBall | undefined, message: BallReport, receivedAt: number): ShownBall {
    const most = ballRadiusPx(BALL_MAX_TILES);
    // A message that does not say where the solid is: where it is held.
    const figure = (value: number | undefined, fallback: number): number =>
        value !== undefined && Number.isFinite(value) ? value : fallback;
    const told = {
        x: figure(message.ballX, message.x),
        y: figure(message.ballY, message.y),
        radiusPx: Math.min(most, Math.max(0, figure(message.ballRadius, 0))),
    };
    const far =
        !known ||
        Math.hypot(known.x - told.x, known.y - told.y) > FAR_OFF_PX ||
        Math.abs(known.radiusPx - told.radiusPx) > FAR_OFF_RADIUS_PX;
    return {
        ...(far || !known ? told : { x: known.x, y: known.y, radiusPx: known.radiusPx }),
        held: { x: message.x, y: message.y, radiusPx: ballRadiusPx(message.radiusTiles) },
        until: receivedAt + message.impactInMs,
        movedAt: far || !known ? receivedAt : known.movedAt,
    };
}

/** The ball at `now` (ms of the game): it went after what is asked while it is held, and shrank since. */
export function moveShownBall(ball: ShownBall, now: number): ShownBall {
    let solid: WaterBall = { x: ball.x, y: ball.y, radiusPx: ball.radiusPx };
    let at = ball.movedAt;
    while (at < now) {
        let end = Math.min(now, at + SLICE_MS);
        if (at < ball.until && end > ball.until) end = ball.until;
        solid = advanceBall(solid, at < ball.until ? ball.held : undefined, (end - at) / 1000);
        at = end;
        // Nothing more happens to a ball that is gone.
        if (at >= ball.until && solid.radiusPx <= 0) break;
    }
    return { ...ball, ...solid, movedAt: Math.max(now, ball.movedAt) };
}
