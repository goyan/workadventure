import { FadingPool } from "../Christmas/FadingPool";
import { KICK_FADE_MS, KICK_FALL_MS, KICK_MAX, type KickedLeaf } from "./KickedLeafTrail";

/** Leaves sit just below the avatar that kicked them (its depth is its y, its feet are 8 px lower). */
const DEPTH_BELOW_FEET = 16;
/** How high a leaf hops on its way down. */
const HOP_PX = 8;
/** Bigger than the leaves on the ground: they must be seen around a walking avatar. */
const LEAF_WIDTH_PX = 5;
const LEAF_HEIGHT_PX = 3;

interface Flying {
    leaf: KickedLeaf;
    shape: Phaser.GameObjects.Rectangle;
    /** How much lower than its place it is drawn (the ground where it was kicked, on a relief seen in 3/4). */
    drop: number;
}

/** Draws the kicked leaves: a short hop, then a fade. At most 120 at once, the oldest goes first. */
export class KickedLeafLayer {
    private readonly pool = new FadingPool<Flying>(KICK_MAX, KICK_FALL_MS + KICK_FADE_MS);
    private visible = true;
    /** The whole layer fades with the decor; each leaf fades on its own on top of that. */
    private alpha = 1;
    /** The time of the last update, used when the layer alpha changes between two updates. */
    private now = 0;

    /** `dropAt`: how much lower the ground at a point is drawn, the relief seen in 3/4 (GameScene.groundDropAt). */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {}

    get count(): number {
        return this.pool.size;
    }

    add(leaves: KickedLeaf[], now: number): void {
        this.now = Math.max(this.now, now);
        for (const leaf of leaves) {
            const drop = Math.round(this.dropAt(leaf.x, leaf.y));
            const shape = this.scene.add
                .rectangle(leaf.x, leaf.y + drop, LEAF_WIDTH_PX, LEAF_HEIGHT_PX, leaf.color)
                .setDepth(leaf.y - DEPTH_BELOW_FEET);
            // Tilted along its flight, so the leaves do not all look like the same little brick.
            shape.setRotation(Math.atan2(leaf.dy, leaf.dx));
            shape.setVisible(this.visible);
            shape.setAlpha(this.alpha);
            this.pool.add({ leaf, shape, drop }, now)?.shape.destroy();
        }
    }

    /** Moves and fades the leaves; returns true while some are still showing. */
    update(now: number): boolean {
        for (const flying of this.pool.expire(now)) flying.shape.destroy();
        this.now = Math.max(this.now, now);
        for (const { item, addedAt } of this.pool.items) {
            const t = Math.min(1, (this.now - addedAt) / KICK_FALL_MS);
            item.shape.setPosition(
                item.leaf.x + item.leaf.dx * t,
                item.leaf.y + item.drop + item.leaf.dy * t - HOP_PX * Math.sin(Math.PI * t),
            );
        }
        this.applyAlpha();
        return this.pool.size > 0;
    }

    setAlpha(alpha: number): void {
        this.alpha = alpha;
        this.applyAlpha();
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        for (const { item } of this.pool.items) item.shape.setVisible(visible);
    }

    destroy(): void {
        for (const flying of this.pool.clear()) flying.shape.destroy();
    }

    private applyAlpha(): void {
        for (const { item, addedAt } of this.pool.items) {
            const age = this.now - addedAt;
            const fade = age < KICK_FALL_MS ? 1 : Math.max(0, 1 - (age - KICK_FALL_MS) / KICK_FADE_MS);
            item.shape.setAlpha(fade * this.alpha);
        }
    }
}
