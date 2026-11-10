import type * as Phaser from "phaser";
import type { PositionMessage_Direction } from "@workadventure/messages";
import { nerfGunPose } from "./NerfProtocol";

/** An original pixel-art foam blaster; no external texture or avatar-specific asset. */
export class NerfGunEffect {
    private readonly gun: Phaser.GameObjects.Graphics;

    constructor(
        scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
    ) {
        this.gun = scene.add.graphics();
        this.gun.fillStyle(0x25354a).fillRect(-3, -4, 17, 8).fillRect(-1, 3, 5, 6);
        this.gun.fillStyle(0x198bd1).fillRect(-2, -3, 10, 6).fillRect(0, 3, 3, 5);
        this.gun.fillStyle(0xff8d24).fillRect(8, -3, 5, 6).fillRect(1, -5, 5, 2);
        this.gun.fillStyle(0xb9e8f4).fillRect(-1, -2, 6, 1);
        this.gun.setVisible(false);
        container.add(this.gun);
    }

    public update(active: boolean, direction: PositionMessage_Direction, seated: boolean, heading?: number): void {
        if (active) this.container.bringToTop(this.gun);
        const pose = nerfGunPose(direction, heading);
        this.gun
            .setPosition(pose.x, pose.y + (seated ? -4 : 0))
            .setRotation(pose.dx < 0 ? pose.angle - Math.PI : pose.angle)
            .setScale(pose.dx < 0 ? -1 : 1, 1)
            .setVisible(active);
    }

    public destroy(): void {
        this.gun.destroy();
    }
}
