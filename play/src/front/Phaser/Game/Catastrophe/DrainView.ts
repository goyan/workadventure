import type { CatastropheMessage } from "@workadventure/messages";
import { drainSquare } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { downpourAlpha } from "./DownpourFall";
import { drainSwirl } from "./DrainSwirl";

const HOLE_COLOR = 0x0b1b33;
const EDGE_COLOR = 0xbfe3ff;
const ARM_COLOR = 0xe6f4ff;

interface Shown {
    x: number;
    y: number;
    /** In ms of the game. */
    beganAt: number;
    until: number;
    lasts: number;
}

/**
 * The drains the server announces: a dark square of five tiles where the water goes, its edge, and a whirl turning
 * over it. A drain follows the messages of its player, tile by tile, and ends when they stop. Drawn in code, in one
 * layer above everything. The server alone decides what the water does.
 */
export class DrainView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly shown = new Map<number, Shown>();

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly reducedMotion: () => boolean,
    ) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
    }

    /** `receivedAt` in ms of the game: the drain goes on `message.impactInMs` more. */
    public report(message: CatastropheMessage, receivedAt: number): void {
        const known = this.shown.get(message.id);
        this.shown.set(message.id, {
            x: message.x,
            y: message.y,
            beganAt: known?.beganAt ?? receivedAt,
            until: receivedAt + message.impactInMs,
            lasts: message.impactInMs,
        });
    }

    public update(now: number): void {
        if (this.shown.size === 0) return;
        const graphics = this.graphics;
        graphics.clear();
        const reduced = this.reducedMotion();
        for (const [id, drain] of this.shown) {
            if (now >= drain.until) {
                this.shown.delete(id);
                continue;
            }
            const alpha = downpourAlpha(now - drain.beganAt, drain.until - now, drain.lasts);
            const { left, top, side } = drainSquare(drain.x, drain.y);
            graphics.fillStyle(HOLE_COLOR, 0.35 * alpha);
            graphics.fillRect(left, top, side, side);
            graphics.lineStyle(2, EDGE_COLOR, 0.8 * alpha);
            graphics.strokeRect(left, top, side, side);
            const half = side / 2;
            graphics.lineStyle(3, ARM_COLOR, 0.75 * alpha);
            for (const arm of drainSwirl(now - drain.beganAt, reduced)) {
                graphics.beginPath();
                graphics.moveTo(left + half + arm[0].x * half, top + half + arm[0].y * half);
                for (const point of arm.slice(1)) {
                    graphics.lineTo(left + half + point.x * half, top + half + point.y * half);
                }
                graphics.strokePath();
            }
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        this.shown.clear();
        this.graphics.destroy();
    }
}
