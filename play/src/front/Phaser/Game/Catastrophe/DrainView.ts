import * as Phaser from "phaser";
import type { CatastropheMessage } from "@workadventure/messages";
import { drainCalms, drainTiles, TILE_PX } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { drawLower } from "../Terrain/GroundDrop";
import { downpourAlpha } from "./DownpourFall";
import { drainRings, drainStrands } from "./DrainSwirl";

const HOLE_COLOR = 0x06122b;
const EYE_COLOR = 0x01040c;
/** The tones of the water of the whirl, from the deep blue under it to the white of its foam. */
const TONES = [0x1f4fe0, 0x2f8cff, 0x7fd0ff, 0xeaf7ff];
/** How many wisps of water turn in the disc for each tile of its radius, and never fewer nor more than these. */
const STRANDS_PER_TILE = 9;
const MIN_STRANDS = 36;
const MAX_STRANDS = 120;
/** A wisp is drawn three times, each over a shorter middle part of it: bright in its middle, fading at its ends. */
const STRAND_PASSES: { from: number; to: number; alpha: number; width: number }[] = [
    { from: 0, to: 1, alpha: 0.3, width: 1 },
    { from: 0.15, to: 0.85, alpha: 0.35, width: 0.7 },
    { from: 0.3, to: 0.7, alpha: 0.35, width: 0.4 },
];

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
 * The drains the server announces, seen from above like a whirlpool: a funnel of dark water with no edge, deeper
 * and deeper down to a black eye, and over it glowing wisps of blue water and white foam that curl around the eye,
 * faster the nearer they are to it. A drain follows the messages of its player and ends when they stop. Drawn in
 * code, in two layers above everything: the dark water, and the wisps that light it. The server alone decides what
 * the water does.
 */
export class DrainView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    /** The wisps of water add their light to what is under them: they glow where they cross. */
    private readonly glow: Phaser.GameObjects.Graphics;
    private readonly shown = new Map<number, Shown>();

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly reducedMotion: () => boolean,
        /**
         * How much lower what lies at a point is drawn, the relief seen in 3/4: the ground or the water over it
         * (GameScene.surfaceDropAt).
         */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
        this.glow = scene.add
            .graphics()
            .setDepth(DEPTH_NIGHT_INDEX + 2)
            .setBlendMode(Phaser.BlendModes.ADD);
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
        this.glow.clear();
        const reduced = this.reducedMotion();
        for (const [id, drain] of this.shown) {
            if (now >= drain.until) {
                this.shown.delete(id);
                continue;
            }
            // Where the water under it is drawn: lower at the bottom of a hollow.
            drawLower([this.graphics, this.glow], Math.round(this.dropAt(drain.x, drain.y)), () =>
                this.draw(
                    drain,
                    now - drain.beganAt,
                    downpourAlpha(now - drain.beganAt, drain.until - now, drain.lasts),
                    reduced,
                ),
            );
        }
        this.scene.markDirty();
    }

    private draw(drain: Shown, elapsed: number, alpha: number, reduced: boolean): void {
        const radius = drain.radiusTiles * TILE_PX;
        const { x, y } = drain;
        // The funnel: no edge, and the water looks deeper towards the eye.
        for (const ring of drainRings()) {
            this.graphics.fillStyle(HOLE_COLOR, ring.alpha * alpha);
            this.graphics.fillCircle(x, y, ring.radius * radius);
        }
        // The wisps of water and foam that curl around the eye.
        const glow = this.glow;
        const count = Math.min(MAX_STRANDS, Math.max(MIN_STRANDS, drain.radiusTiles * STRANDS_PER_TILE));
        for (const strand of drainStrands(elapsed, count, reduced)) {
            const last = strand.points.length - 1;
            for (const pass of STRAND_PASSES) {
                glow.lineStyle(
                    Math.max(1.5, strand.width * radius * pass.width),
                    TONES[strand.tone],
                    strand.alpha * pass.alpha * alpha,
                );
                glow.beginPath();
                const from = Math.round(pass.from * last);
                const to = Math.round(pass.to * last);
                glow.moveTo(x + strand.points[from].x * radius, y + strand.points[from].y * radius);
                for (let step = from + 1; step <= to; step++) {
                    glow.lineTo(x + strand.points[step].x * radius, y + strand.points[step].y * radius);
                }
                glow.strokePath();
            }
        }
        // The eye, where it all goes: drawn last, over the dark water.
        this.graphics.fillStyle(EYE_COLOR, 0.9 * alpha);
        this.graphics.fillCircle(x, y, Math.max(3, radius * 0.09));
    }

    public destroy(): void {
        this.shown.clear();
        this.graphics.destroy();
        this.glow.destroy();
    }
}
