import type { CatastropheMessage } from "@workadventure/messages";
import { DEPTH_NIGHT_INDEX } from "@wa/front/Phaser/Game/DepthIndexes";
import { BALL_TONES, ballBlockPx, ballBlocks, followBall, moveShownBall } from "./BallShape";
import type { BallCover, ShownBall } from "./BallShape";

/** The tones of the ball, from its shade to its glint: a red buoy, read against the water as against the grass. */
const TONE_COLORS = [0x4a1620, 0x7a2028, 0xad3030, 0xd9503a, 0xf08a5a, 0xfff0dc];
/** What the water stands over is drawn towards the blue of the water, and lets the water show through. */
const WATER_COLOR = 0x2f6fb0;
const WET_BLEND = 0.6;
const WET_ALPHA = 0.7;
const SHADOW_ALPHA = 0.22;
/** Over the night veil: a ring and a glint, so that a ball is found in the dark, and under the ground. */
const RING_COLOR = 0xfff0dc;
const RING_ALPHA = 0.3;
const GLINT_ALPHA = 0.5;

interface Shown {
    ball: ShownBall;
    body: Phaser.GameObjects.Graphics;
    /** What the body was last drawn for: it is drawn again only when this changes. */
    drawn: string;
}

function blend(from: number, to: number, share: number): number {
    const part = (shift: number): number => {
        const a = (from >> shift) & 255;
        const b = (to >> shift) & 255;
        return Math.round(a + (b - a) * share) << shift;
    };
    return part(16) | part(8) | part(0);
}
const WET_COLORS = TONE_COLORS.map((color) => blend(color, WATER_COLOR, WET_BLEND));

/**
 * The balls the server announces: each a solid sphere held under the pointer of its player, its centre at the
 * altitude 0 of the map. Drawn in code, in blocks lit from the top left: plainly what stands out of the ground and
 * of the water, under the tint of the water what the water stands over, not at all what is in the ground. A ball is
 * drawn at the depth of its middle, as an avatar standing there. Between two messages it moves by the rule of the
 * server (advanceBall); it is drawn again only when it moved or the water around it changed. The server alone
 * decides what the water does.
 */
export class BallView {
    private readonly shown = new Map<number, Shown>();
    private readonly ring: Phaser.GameObjects.Graphics;
    private ringDrawn = "";

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        /** The ground and the water of the map under a point. */
        private readonly cover: BallCover,
        /** Changes whenever the ground or the water does. */
        private readonly coverVersion: () => number,
    ) {
        this.ring = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
    }

    /** `receivedAt` in ms of the game: the ball is held `message.impactInMs` more. */
    public report(message: CatastropheMessage, receivedAt: number): void {
        const known = this.shown.get(message.id);
        if (known) {
            known.ball = followBall(moveShownBall(known.ball, receivedAt), message, receivedAt);
            return;
        }
        this.shown.set(message.id, {
            ball: followBall(undefined, message, receivedAt),
            body: this.scene.add.graphics(),
            drawn: "",
        });
    }

    public update(now: number): void {
        if (this.shown.size === 0) return;
        const version = this.coverVersion();
        let rings = "";
        let dirty = false;
        for (const [id, shown] of this.shown) {
            shown.ball = moveShownBall(shown.ball, now);
            const { x, y, radiusPx, until } = shown.ball;
            if (now >= until && radiusPx <= 0) {
                shown.body.destroy();
                this.shown.delete(id);
                dirty = true;
                continue;
            }
            // To the pixel: a ball that barely moved is not drawn again.
            const place = { x: Math.round(x), y: Math.round(y), radiusPx: Math.round(radiusPx * 2) / 2 };
            const key = `${place.x},${place.y},${place.radiusPx}`;
            rings += `${key};`;
            if (shown.drawn === `${key},${version}`) continue;
            shown.drawn = `${key},${version}`;
            this.draw(shown.body, place);
            dirty = true;
        }
        if (rings !== this.ringDrawn) {
            this.ringDrawn = rings;
            this.drawRings();
            dirty = true;
        }
        if (dirty) this.scene.markDirty();
    }

    private draw(body: Phaser.GameObjects.Graphics, ball: { x: number; y: number; radiusPx: number }): void {
        body.clear();
        body.setDepth(ball.y);
        if (ball.radiusPx <= 0) return;
        const blocks = ballBlocks(ball, this.cover);
        if (blocks.length === 0) return;
        const size = ballBlockPx(ball.radiusPx);
        // The shade it lays on the ground, a little to the bottom right.
        body.fillStyle(0x000000, SHADOW_ALPHA);
        body.fillEllipse(
            ball.x + ball.radiusPx * 0.08,
            ball.y + ball.radiusPx * 0.1,
            ball.radiusPx * 2.04,
            ball.radiusPx * 2.04,
        );
        for (let tone = 0; tone < BALL_TONES; tone++) {
            for (const wet of [false, true]) {
                body.fillStyle(wet ? WET_COLORS[tone] : TONE_COLORS[tone], wet ? WET_ALPHA : 1);
                for (const block of blocks) {
                    if (block.tone === tone && block.wet === wet) body.fillRect(block.x, block.y, size, size);
                }
            }
        }
    }

    private drawRings(): void {
        this.ring.clear();
        for (const { ball } of this.shown.values()) {
            const radius = Math.round(ball.radiusPx * 2) / 2;
            if (radius <= 0) continue;
            const x = Math.round(ball.x);
            const y = Math.round(ball.y);
            this.ring.lineStyle(1.5, RING_COLOR, RING_ALPHA);
            this.ring.strokeCircle(x, y, radius);
            this.ring.fillStyle(RING_COLOR, GLINT_ALPHA);
            this.ring.fillCircle(x - radius * 0.38, y - radius * 0.46, Math.max(1.5, radius * 0.06));
        }
    }

    public destroy(): void {
        for (const shown of this.shown.values()) shown.body.destroy();
        this.shown.clear();
        this.ring.destroy();
    }
}
