import type { WaterBall } from "@workadventure/map-editor";
import type { CatastropheMessage } from "@workadventure/messages";
import { DEPTH_NIGHT_INDEX } from "@wa/front/Phaser/Game/DepthIndexes";
import { BALL_TONES, ballBlockPx, ballBlocks, ballWaterline, glideBall, tellBall } from "./BallShape";
import type { BallCover, ToldBall } from "./BallShape";

/** The tones of the ball, from its shade to its glint: a red buoy, read against the water as against the grass. */
const TONE_COLORS = [0x4a1620, 0x7a2028, 0xad3030, 0xd9503a, 0xf08a5a, 0xfff0dc];
/** What the water stands over is drawn towards the blue of the water, and lets the water show through. */
const WATER_COLOR = 0x2f6fb0;
const WET_BLEND = 0.6;
const WET_ALPHA = 0.7;
const SHADOW_ALPHA = 0.22;
/** Where the water meets the ball: a dark band of water against it, and a thin line of foam. */
const WATERLINE_SHADE_COLOR = 0x06122b;
const WATERLINE_SHADE_ALPHA = 0.3;
const FOAM_COLOR = 0xeaf7ff;
const FOAM_ALPHA = 0.85;
/** Over the night veil: a ring and a glint, so that a ball is found in the dark, and under the ground. */
const RING_COLOR = 0xfff0dc;
const RING_ALPHA = 0.3;
const GLINT_ALPHA = 0.5;

interface Shown {
    /** What the server told of it; none for the ball this player holds, which is where their pointer is. */
    told: ToldBall | undefined;
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
 * The balls of the room: each a solid sphere held under the pointer of its player, its centre at the altitude 0 of
 * the map. A ball is whole at once and gone at once. The one this player holds is drawn under their own pointer,
 * without waiting for the server; those of the others are drawn where the server tells them. Drawn in code, in
 * blocks lit from the top left: plainly what stands out of the ground and of the water, under the tint of the water
 * what the water stands over, not at all what is in the ground; where the water meets the ball, a dark band and a
 * line of foam say that it stands in it. A ball is drawn at the depth of its middle, as an avatar standing there,
 * and again only when it moved or the water around it changed. The server alone decides what the water does.
 */
export class BallView {
    private readonly shown = new Map<number, Shown>();
    /** The ball this player holds, while they hold one. */
    private own: Shown | undefined;
    private readonly ring: Phaser.GameObjects.Graphics;
    private ringDrawn = "";

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        /** The ground and the water of the map under a point. */
        private readonly cover: BallCover,
        /** Changes whenever the ground or the water does. */
        private readonly coverVersion: () => number,
        /** Who this player is for the server: their own ball is not drawn from its messages. */
        private readonly ownUserId: () => number | undefined,
        /** The ball this player holds under their pointer now. */
        private readonly held: () => WaterBall | undefined,
    ) {
        this.ring = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
    }

    /** `receivedAt` in ms of the game: the ball stands `message.impactInMs` more, none when its player let it go. */
    public report(message: CatastropheMessage, receivedAt: number): void {
        // One's own ball is under one's own pointer: what the server says of it comes a round trip late.
        if (message.userId !== undefined && message.userId === this.ownUserId()) return;
        const known = this.shown.get(message.id);
        if (message.impactInMs <= 0) {
            if (known) known.told = { ...tellBall(known.told, message, receivedAt), until: receivedAt };
            return;
        }
        if (known) {
            known.told = tellBall(known.told, message, receivedAt);
            return;
        }
        this.shown.set(message.id, {
            told: tellBall(undefined, message, receivedAt),
            body: this.scene.add.graphics(),
            drawn: "",
        });
    }

    public update(now: number): void {
        const held = this.held();
        let dirty = false;
        if (held && !this.own) this.own = { told: undefined, body: this.scene.add.graphics(), drawn: "" };
        else if (!held && this.own) {
            this.own.body.destroy();
            this.own = undefined;
            dirty = true;
        }
        if (this.shown.size === 0 && !this.own && !dirty) return;
        const version = this.coverVersion();
        let rings = "";
        const places: { x: number; y: number; radiusPx: number }[] = [];
        const show = (shown: Shown, ball: WaterBall): void => {
            // To the pixel: a ball that barely moved is not drawn again.
            const place = { x: Math.round(ball.x), y: Math.round(ball.y), radiusPx: Math.round(ball.radiusPx * 2) / 2 };
            const key = `${place.x},${place.y},${place.radiusPx}`;
            rings += `${key};`;
            places.push(place);
            if (shown.drawn === `${key},${version}`) return;
            shown.drawn = `${key},${version}`;
            this.draw(shown.body, place);
            dirty = true;
        };
        if (this.own && held) show(this.own, held);
        for (const [id, shown] of this.shown) {
            if (!shown.told || now >= shown.told.until) {
                shown.body.destroy();
                this.shown.delete(id);
                dirty = true;
                continue;
            }
            show(shown, glideBall(shown.told, now));
        }
        if (rings !== this.ringDrawn) {
            this.ringDrawn = rings;
            this.drawRings(places);
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
        const line = ballWaterline(ball, this.cover);
        // On the ground it lays a shade, a little to the bottom right. In the water it lays none: a shade on a
        // lake would say a ball that hangs over it.
        if (!line.afloat) {
            body.fillStyle(0x000000, SHADOW_ALPHA);
            body.fillEllipse(
                ball.x + ball.radiusPx * 0.08,
                ball.y + ball.radiusPx * 0.1,
                ball.radiusPx * 2.04,
                ball.radiusPx * 2.04,
            );
        }
        // The water against the ball is darker: it is deep there, and the ball stands in it.
        this.strokeArcs(body, line, size * 2.5, WATERLINE_SHADE_COLOR, WATERLINE_SHADE_ALPHA);
        for (let tone = 0; tone < BALL_TONES; tone++) {
            for (const wet of [false, true]) {
                body.fillStyle(wet ? WET_COLORS[tone] : TONE_COLORS[tone], wet ? WET_ALPHA : 1);
                for (const block of blocks) {
                    if (block.tone === tone && block.wet === wet) body.fillRect(block.x, block.y, size, size);
                }
            }
        }
        // The line of foam where the water meets it, over the ball.
        this.strokeArcs(body, line, Math.max(1.5, size * 0.6), FOAM_COLOR, FOAM_ALPHA);
    }

    private strokeArcs(
        body: Phaser.GameObjects.Graphics,
        line: ReturnType<typeof ballWaterline>,
        width: number,
        color: number,
        alpha: number,
    ): void {
        for (const arc of line.arcs) {
            if (arc.points.length < 2) continue;
            body.lineStyle(width, color, alpha);
            body.beginPath();
            body.moveTo(arc.points[0].x, arc.points[0].y);
            for (let at = 1; at < arc.points.length; at++) body.lineTo(arc.points[at].x, arc.points[at].y);
            if (arc.closed) body.closePath();
            body.strokePath();
        }
    }

    private drawRings(places: readonly { x: number; y: number; radiusPx: number }[]): void {
        this.ring.clear();
        for (const { x, y, radiusPx } of places) {
            if (radiusPx <= 0) continue;
            this.ring.lineStyle(1.5, RING_COLOR, RING_ALPHA);
            this.ring.strokeCircle(x, y, radiusPx);
            this.ring.fillStyle(RING_COLOR, GLINT_ALPHA);
            this.ring.fillCircle(x - radiusPx * 0.38, y - radiusPx * 0.46, Math.max(1.5, radiusPx * 0.06));
        }
    }

    public destroy(): void {
        for (const shown of this.shown.values()) shown.body.destroy();
        this.shown.clear();
        this.own?.body.destroy();
        this.own = undefined;
        this.ring.destroy();
    }
}
