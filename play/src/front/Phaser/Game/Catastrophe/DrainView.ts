import type { CatastropheMessage } from "@workadventure/messages";
import { drainCalms, drainTiles, TILE_PX } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { downpourAlpha } from "./DownpourFall";
import { drainRim, drainRings, drainStreaks, drainSwirl } from "./DrainSwirl";

const HOLE_COLOR = 0x0b1b33;
const EYE_COLOR = 0x030912;
const FOAM_COLOR = 0xe6f4ff;
const STREAK_COLOR = 0xbfe3ff;
/** The rim is drawn with this many points, and the water turning in the disc with this many streaks a tile of radius. */
const RIM_POINTS = 48;
const STREAKS_PER_TILE = 6;
const MIN_STREAKS = 14;
const MAX_STREAKS = 80;

interface Shown {
    x: number;
    y: number;
    radiusTiles: number;
    /** In ms of the game. */
    beganAt: number;
    until: number;
    lasts: number;
}

/**
 * The drains the server announces, seen from above like a whirlpool: a funnel darker and darker down to a black
 * eye, a ragged rim of foam, arms of foam turning around the eye, and streaks of water that turn ever faster as
 * they fall into it. A drain follows the messages of its player and ends when they stop. Drawn in code, in one
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
            radiusTiles: drainTiles(message.radiusTiles),
            beganAt: known?.beganAt ?? receivedAt,
            until: receivedAt + message.impactInMs,
            lasts: message.impactInMs,
        });
    }

    /** Whether a point of the map (pixels) is where an open drain keeps the current from carrying an avatar. */
    public calms(x: number, y: number): boolean {
        return this.shown.size > 0 && drainCalms(this.shown.values(), x, y);
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
            this.draw(
                drain,
                now - drain.beganAt,
                downpourAlpha(now - drain.beganAt, drain.until - now, drain.lasts),
                reduced,
            );
        }
        this.scene.markDirty();
    }

    private draw(drain: Shown, elapsed: number, alpha: number, reduced: boolean): void {
        const graphics = this.graphics;
        const radius = drain.radiusTiles * TILE_PX;
        const { x, y } = drain;
        // The funnel: the water looks deeper towards the eye.
        for (const ring of drainRings()) {
            graphics.fillStyle(HOLE_COLOR, ring.alpha * alpha);
            graphics.fillCircle(x, y, ring.radius * radius);
        }
        // The rim of foam, ragged and rippling.
        const rim = drainRim(elapsed, RIM_POINTS, reduced);
        graphics.lineStyle(Math.max(2, radius / 40), FOAM_COLOR, 0.7 * alpha);
        graphics.beginPath();
        rim.forEach((far, point) => {
            const around = (point / RIM_POINTS) * Math.PI * 2;
            const atX = x + Math.cos(around) * far * radius;
            const atY = y + Math.sin(around) * far * radius;
            if (point === 0) graphics.moveTo(atX, atY);
            else graphics.lineTo(atX, atY);
        });
        graphics.closePath();
        graphics.strokePath();
        // The arms of foam, thinner and fainter as they near the eye.
        const widest = Math.max(3, radius / 24);
        for (const arm of drainSwirl(elapsed, reduced)) {
            for (let step = 1; step < arm.length; step++) {
                const along = step / (arm.length - 1);
                graphics.lineStyle(Math.max(1, widest * (1 - along * 0.7)), FOAM_COLOR, (0.6 - 0.3 * along) * alpha);
                graphics.lineBetween(
                    x + arm[step - 1].x * radius,
                    y + arm[step - 1].y * radius,
                    x + arm[step].x * radius,
                    y + arm[step].y * radius,
                );
            }
        }
        // The water that turns and falls in.
        const count = Math.min(MAX_STREAKS, Math.max(MIN_STREAKS, drain.radiusTiles * STREAKS_PER_TILE));
        const width = Math.max(2, radius / 48);
        for (const streak of drainStreaks(elapsed, count, reduced)) {
            if (streak.alpha <= 0) continue;
            graphics.lineStyle(width, STREAK_COLOR, 0.9 * streak.alpha * alpha);
            graphics.lineBetween(
                x + streak.tailX * radius,
                y + streak.tailY * radius,
                x + streak.x * radius,
                y + streak.y * radius,
            );
        }
        // The eye, where it all goes.
        graphics.fillStyle(EYE_COLOR, 0.85 * alpha);
        graphics.fillCircle(x, y, Math.max(3, radius * 0.07));
    }

    public destroy(): void {
        this.shown.clear();
        this.graphics.destroy();
    }
}
