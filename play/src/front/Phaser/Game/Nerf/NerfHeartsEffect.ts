import type * as Phaser from "phaser";
import { heartFill, NERF_HEARTS } from "./NerfHearts";
import { heartPixels, NERF_HEART_COLORS, NERF_HEART_HEIGHT, NERF_HEART_WIDTH } from "./NerfHeartShape";

/** Gap between two hearts. */
const HEART_GAP = 1;
/** Height of the row above the feet of the avatar: over its head, under its name. */
export const NERF_HEARTS_OFFSET_Y = -38;

/** The hearts of another player who carries a Nerf, in a row over their head. */
export class NerfHeartsEffect {
    private readonly row: Phaser.GameObjects.Graphics;
    private drawn: number | undefined;

    constructor(
        scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
    ) {
        this.row = scene.add.graphics();
        const width = NERF_HEARTS * NERF_HEART_WIDTH + (NERF_HEARTS - 1) * HEART_GAP;
        this.row.setPosition(-Math.floor(width / 2), NERF_HEARTS_OFFSET_Y - NERF_HEART_HEIGHT).setVisible(false);
        container.add(this.row);
    }

    /** `thirds` is what the player publishes, undefined while unknown or put away. */
    public update(thirds: number | undefined, visible: boolean): void {
        const shown = visible && thirds !== undefined;
        if (shown) this.container.bringToTop(this.row);
        this.row.setVisible(shown);
        if (!shown || thirds === this.drawn) return;
        this.drawn = thirds;
        this.row.clear();
        for (let index = 0; index < NERF_HEARTS; index++) {
            const left = index * (NERF_HEART_WIDTH + HEART_GAP);
            for (const pixel of heartPixels(heartFill(thirds, index))) {
                this.row
                    .fillStyle(pixel.filled ? NERF_HEART_COLORS.full : NERF_HEART_COLORS.empty)
                    .fillRect(left + pixel.x, pixel.y, 1, 1);
            }
        }
    }

    public destroy(): void {
        this.row.destroy();
    }
}
