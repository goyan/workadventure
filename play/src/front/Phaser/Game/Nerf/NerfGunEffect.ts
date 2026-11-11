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
        // A toy blaster about 11 × 6 px held by its grip (the origin), barrel towards +x: small next to a 32 px avatar.
        this.gun.fillStyle(0x25354a).fillRect(-2, -3, 13, 5).fillRect(-1, 1, 4, 4);
        this.gun.fillStyle(0x198bd1).fillRect(-1, -2, 8, 3).fillRect(0, 1, 2, 3);
        this.gun.fillStyle(0xff8d24).fillRect(7, -2, 3, 3).fillRect(1, -4, 3, 1);
        this.gun.fillStyle(0xb9e8f4).fillRect(0, -2, 4, 1);
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
