import type * as Phaser from "phaser";
import { DEPTH_OVERLAY_INDEX } from "../DepthIndexes";

/** A small foam burst that fades once, without shaking or recoloring the target. */
export class NerfImpactEffect {
    private readonly sprite: Phaser.GameObjects.Graphics;
    private readonly reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        private readonly bornAt: number,
    ) {
        this.sprite = scene.add
            .graphics()
            .setPosition(x, y)
            .setDepth(DEPTH_OVERLAY_INDEX + 1);
        this.update(bornAt);
    }

    public update(time: number): boolean {
        const progress = Math.min(1, Math.max(0, (time - this.bornAt) / 260));
        if (progress === 1) return false;
        const radius = this.reducedMotion ? 7 : 4 + 14 * (1 - (1 - progress) ** 2);
        this.sprite.clear().setAlpha(1 - progress);
        this.sprite.lineStyle(1, 0x8bddff, 0.8).strokeCircle(0, 0, radius * 0.65);
        for (let index = 0; index < 8; index++) {
            const angle = (index * Math.PI) / 4;
            this.sprite
                .fillStyle(index % 2 === 0 ? 0xff8d24 : 0x8bddff)
                .fillRect(Math.round(Math.cos(angle) * radius) - 1, Math.round(Math.sin(angle) * radius) - 1, 3, 3);
        }
        this.sprite.fillStyle(0xffe7b6).fillRect(-3, -1, 6, 2).fillRect(-1, -3, 2, 6);
        return true;
    }

    public destroy(): void {
        this.sprite.destroy();
    }
}
