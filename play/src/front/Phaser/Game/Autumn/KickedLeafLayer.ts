import { FadingPool } from "../Christmas/FadingPool";
import { KICK_FADE_MS, KICK_FALL_MS, KICK_MAX, type KickedLeaf } from "./KickedLeafTrail";

/** Leaves sit just below the avatar that kicked them (its depth is its y, its feet are 8 px lower). */
const DEPTH_BELOW_FEET = 16;
/** How high a leaf hops on its way down. */
const HOP_PX = 4;

interface Flying {
    leaf: KickedLeaf;
    shape: Phaser.GameObjects.Rectangle;
}

/** Draws the kicked leaves: a short hop, then a fade. At most 120 at once, the oldest goes first. */
export class KickedLeafLayer {
    private readonly pool = new FadingPool<Flying>(KICK_MAX, KICK_FALL_MS + KICK_FADE_MS);
    private visible = true;

    constructor(private readonly scene: Phaser.Scene) {}

    get count(): number {
        return this.pool.size;
    }

    add(leaves: KickedLeaf[], now: number): void {
        for (const leaf of leaves) {
            const shape = this.scene.add
                .rectangle(leaf.x, leaf.y, 3, 2, leaf.color)
                .setDepth(leaf.y - DEPTH_BELOW_FEET);
            shape.setVisible(this.visible);
            this.pool.add({ leaf, shape }, now)?.shape.destroy();
        }
    }

    /** Moves and fades the leaves; returns true while some are still showing. */
    update(now: number): boolean {
        for (const flying of this.pool.expire(now)) flying.shape.destroy();
        for (const { item, addedAt } of this.pool.items) {
            const age = now - addedAt;
            const t = Math.min(1, age / KICK_FALL_MS);
            item.shape.setPosition(
                item.leaf.x + item.leaf.dx * t,
                item.leaf.y + item.leaf.dy * t - HOP_PX * Math.sin(Math.PI * t),
            );
            item.shape.setAlpha(age < KICK_FALL_MS ? 1 : Math.max(0, 1 - (age - KICK_FALL_MS) / KICK_FADE_MS));
        }
        return this.pool.size > 0;
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        for (const { item } of this.pool.items) item.shape.setVisible(visible);
    }

    destroy(): void {
        for (const flying of this.pool.clear()) flying.shape.destroy();
    }
}
