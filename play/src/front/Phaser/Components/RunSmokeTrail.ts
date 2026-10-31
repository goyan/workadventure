import * as Phaser from "phaser";
import type { GameScene } from "../Game/GameScene";
import { TexturesHelper } from "../Helpers/TexturesHelper";

const SMOKE_TEXTURE_KEY = "run-smoke-puff";
const SMOKE_RADIUS = 10;
const SMOKE_COLOR = 0xe8e8e8;
/** Time between two puffs while running, in ms. */
const PUFF_INTERVAL = 45;
const PUFF_DURATION = 320;
/** How far behind the avatar a puff appears, in pixels. */
const PUFF_BEHIND_DISTANCE = 8;
/** Puffs left at each emission, for a denser cloud. */
const PUFFS_PER_EMISSION = 2;

/**
 * Puffs of smoke left on the ground behind an avatar that runs, to show it goes fast.
 */
export class RunSmokeTrail {
    private lastPuffTime = 0;

    constructor(private readonly scene: GameScene) {
        if (!scene.textures.exists(SMOKE_TEXTURE_KEY)) {
            TexturesHelper.createCircleTexture(scene, SMOKE_TEXTURE_KEY, SMOKE_RADIUS, SMOKE_COLOR);
        }
    }

    /**
     * Leaves a puff at the feet position, pushed away from the movement direction (dirX, dirY).
     * Does nothing if the last puff is too recent.
     */
    public emit(feetX: number, feetY: number, dirX: number, dirY: number, depth: number): void {
        const now = this.scene.time.now;
        if (now - this.lastPuffTime < PUFF_INTERVAL) {
            return;
        }
        this.lastPuffTime = now;

        const length = Math.hypot(dirX, dirY);
        if (length === 0) {
            return;
        }
        const jitter = () => Phaser.Math.FloatBetween(-5, 5);
        for (let i = 0; i < PUFFS_PER_EMISSION; i++) {
            const puff = this.scene.add
                .image(
                    feetX - (dirX / length) * PUFF_BEHIND_DISTANCE + jitter(),
                    feetY - (dirY / length) * PUFF_BEHIND_DISTANCE + jitter(),
                    SMOKE_TEXTURE_KEY,
                )
                .setDepth(depth)
                .setAlpha(0.75)
                .setScale(Phaser.Math.FloatBetween(0.9, 1.3));

            // The puff swells while it fades out.
            this.scene.tweens.add({
                targets: puff,
                alpha: 0,
                scale: puff.scale * 2.6,
                y: puff.y - 8,
                duration: PUFF_DURATION,
                ease: Phaser.Math.Easing.Quadratic.Out,
                onUpdate: () => this.scene.markDirty(),
                onComplete: () => puff.destroy(),
            });
        }
    }
}
