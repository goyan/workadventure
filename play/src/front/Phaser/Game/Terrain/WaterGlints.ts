import { hash2 } from "./Pixel/PixelNoise";

/** The most glints on the screen. */
export const GLINTS_MAX = 300;
/** A glint may shine at one point of each square of this many pixels. */
const GRID_PX = 6;
/** Beyond this many squares in the view (far out), a glint of a pixel is not seen: none is drawn. */
const MOST_SQUARES = 60_000;
/** The share of the squares that ever shine, and how long each one shines in its cycle of 3 s. */
const SHINING_FROM = 0.985;
const CYCLE_S = 3;
const SHINE_S = 0.5;
/** Glints only on water this deep (px): not on a film nor on the foam of a shore. */
const DEEP_ENOUGH_PX = 2;
const GLINT_COLOR = 0xeaf6fd;
/** Over the ground of the terrain (0.655), with the foam (0.66), under the objects. */
export const GLINTS_DEPTH = 0.665;
/** The glints are drawn again this often at most (ms). */
const REDRAW_MS = 125;

export interface Glint {
    x: number;
    y: number;
    size: 1 | 2;
}

/**
 * The glints of the water in a view at a time (the mock-up of the water, choice 2): a few points of 1 or 2 px that
 * light up and go out, each on its own cycle, only where the water is deep enough, drawn as low as its surface
 * (`dropAt`, a lake at the bottom of a hollow seen in 3/4). The same at the same time for everyone.
 */
export function glintsIn(
    view: { x: number; y: number; width: number; height: number },
    time: number,
    waterAt: (x: number, y: number) => number,
    dropAt: (x: number, y: number) => number,
): Glint[] {
    const first = { x: Math.floor(view.x / GRID_PX), y: Math.floor(view.y / GRID_PX) };
    const last = { x: Math.floor((view.x + view.width) / GRID_PX), y: Math.floor((view.y + view.height) / GRID_PX) };
    if ((last.x - first.x + 1) * (last.y - first.y + 1) > MOST_SQUARES) return [];
    const glints: Glint[] = [];
    const seconds = time / 1000;
    for (let squareY = first.y; squareY <= last.y; squareY++) {
        for (let squareX = first.x; squareX <= last.x; squareX++) {
            const draw = hash2(squareX, squareY);
            if (draw <= SHINING_FROM) continue;
            // Each glint on its own cycle: a phase drawn apart from the draw that chose it.
            if ((seconds * 0.9 + hash2(squareX + 11, squareY + 7) * CYCLE_S) % CYCLE_S >= SHINE_S) continue;
            const x = squareX * GRID_PX + Math.floor(hash2(squareY, squareX + 3) * GRID_PX);
            const y = squareY * GRID_PX + Math.floor(hash2(squareX + 5, squareY) * GRID_PX);
            if (waterAt(x, y) < DEEP_ENOUGH_PX) continue;
            glints.push({ x, y: y + dropAt(x, y), size: draw > 0.995 ? 2 : 1 });
            if (glints.length >= GLINTS_MAX) return glints;
        }
    }
    return glints;
}

export interface WaterGlintsDeps {
    /** The depth of the water at a point (px). */
    waterAt(x: number, y: number): number;
    /** How much lower the surface of the water is drawn at a point (a hollow in 3/4). */
    dropAt(x: number, y: number): number;
    reducedMotion(): boolean;
    /** Whether the water is shown (not in the basic mode). */
    shown(): boolean;
}

/** Draws the glints of the water over the blocks of the terrain, without drawing the blocks again. */
export class WaterGlints {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private drawnAt = Number.NEGATIVE_INFINITY;
    private drawn = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly deps: WaterGlintsDeps,
    ) {
        this.graphics = scene.add.graphics().setDepth(GLINTS_DEPTH);
    }

    public update(time: number): void {
        if (!this.deps.shown() || this.deps.reducedMotion()) {
            if (this.drawn) {
                this.graphics.clear();
                this.drawn = false;
                this.scene.markDirty();
            }
            return;
        }
        if (time - this.drawnAt < REDRAW_MS) return;
        this.drawnAt = time;
        const glints = glintsIn(
            this.scene.cameras.main.worldView,
            time,
            (x, y) => this.deps.waterAt(x, y),
            (x, y) => this.deps.dropAt(x, y),
        );
        this.graphics.clear();
        this.graphics.fillStyle(GLINT_COLOR, 1);
        for (const glint of glints) this.graphics.fillRect(glint.x, glint.y, glint.size, 1);
        this.drawn = glints.length > 0;
        this.scene.markDirty();
    }

    public destroy(): void {
        this.graphics.destroy();
    }
}
