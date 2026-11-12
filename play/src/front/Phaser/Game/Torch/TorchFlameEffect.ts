import type * as Phaser from "phaser";
import type { PositionMessage_Direction } from "@workadventure/messages";
import { TORCH_FLICKER_MIN } from "./TorchFlicker";
import { torchFlamePose } from "./TorchProtocol";

/** How much shorter the flame is at its dimmest: it breathes with the light, a little. */
const FLAME_SHRINK = 0.1;

/**
 * An original pixel-art torch held upright in the hand: a wooden handle and its flame. No external texture or
 * avatar-specific asset. The flame is drawn from its base (the origin) upwards, so that it grows from the handle.
 */
export class TorchFlameEffect {
    private readonly stick: Phaser.GameObjects.Graphics;
    private readonly flame: Phaser.GameObjects.Graphics;

    constructor(
        scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
    ) {
        this.stick = scene.add.graphics();
        // About 3 × 10 px from the flame down to the hand: small next to a 32 px avatar.
        this.stick.fillStyle(0x3b2414).fillRect(-2, 0, 4, 2);
        this.stick.fillStyle(0x7a4a26).fillRect(-1, 2, 2, 8);
        this.stick.setVisible(false);
        this.flame = scene.add.graphics();
        this.flame.fillStyle(0xd8401c).fillRect(-3, -4, 6, 4).fillRect(-2, -7, 4, 3).fillRect(-1, -9, 2, 2);
        this.flame.fillStyle(0xff8a2a).fillRect(-2, -3, 4, 3).fillRect(-1, -6, 2, 3);
        this.flame.fillStyle(0xffd36b).fillRect(-1, -2, 2, 2);
        this.flame.setVisible(false);
        container.add(this.stick);
        container.add(this.flame);
    }

    /** `intensity`: how bright the torch is now (see torchFlicker). */
    public update(active: boolean, direction: PositionMessage_Direction, seated: boolean, intensity: number): void {
        if (active) {
            this.container.bringToTop(this.stick);
            this.container.bringToTop(this.flame);
        }
        const pose = torchFlamePose(direction, seated);
        const dimmed = (1 - Math.min(1, Math.max(TORCH_FLICKER_MIN, intensity))) / (1 - TORCH_FLICKER_MIN);
        this.stick.setPosition(pose.x, pose.y).setVisible(active);
        this.flame
            .setPosition(pose.x, pose.y)
            .setScale(1, 1 - FLAME_SHRINK * dimmed)
            .setVisible(active);
    }

    public destroy(): void {
        this.stick.destroy();
        this.flame.destroy();
    }
}
