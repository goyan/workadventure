import { FadingPool } from "./FadingPool";
import { FOOTPRINT_FADE_MS, FOOTPRINT_MAX, type FootprintMark } from "./FootprintTrail";

const STEP_TEXTURE = "xmas-step";
const TRAIL_TEXTURE = "xmas-trail";
const PRINT_COLOR = "#b4bedb";
const START_ALPHA = 0.5;
const TRAIL_WIDTH_PX = 4;
/** Prints sit just below the avatar walking on them (its depth is its y, its feet are 8 px lower). */
const DEPTH_BELOW_FEET = 16;

/** Draws the footprints and fades them out. At most 400 at once, the oldest goes first. */
export class FootprintLayer {
    private readonly pool = new FadingPool<Phaser.GameObjects.Image>(FOOTPRINT_MAX, FOOTPRINT_FADE_MS);
    private visible = true;
    /** The whole layer fades in and out with the snow; each print fades on its own on top of that. */
    private alpha = 1;
    /** The time of the last fade, used when the layer alpha changes between two updates. */
    private now = 0;

    constructor(private readonly scene: Phaser.Scene) {
        this.createTexture(STEP_TEXTURE, 6, 4, (context) => {
            context.beginPath();
            context.ellipse(3, 2, 3, 2, 0, 0, Math.PI * 2);
            context.fill();
        });
        this.createTexture(TRAIL_TEXTURE, 1, TRAIL_WIDTH_PX, (context) => context.fillRect(0, 0, 1, TRAIL_WIDTH_PX));
    }

    /** Number of footprints on the map. */
    get count(): number {
        return this.pool.size;
    }

    add(marks: FootprintMark[], now: number): void {
        this.now = Math.max(this.now, now);
        for (const mark of marks) {
            const image =
                mark.kind === "step"
                    ? this.scene.add.image(mark.x, mark.y, STEP_TEXTURE).setRotation(mark.angle)
                    : this.scene.add
                          .image(mark.x1, mark.y1, TRAIL_TEXTURE)
                          .setOrigin(0, 0.5)
                          .setDisplaySize(Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1), TRAIL_WIDTH_PX)
                          .setRotation(Math.atan2(mark.y2 - mark.y1, mark.x2 - mark.x1));
            const feetY = mark.kind === "step" ? mark.y : Math.max(mark.y1, mark.y2);
            image.setDepth(feetY - DEPTH_BELOW_FEET);
            image.setAlpha(START_ALPHA * this.alpha);
            image.setVisible(this.visible);
            this.pool.add(image, now)?.destroy();
        }
    }

    update(now: number): void {
        for (const image of this.pool.expire(now)) image.destroy();
        this.now = Math.max(this.now, now);
        this.applyAlpha();
    }

    setAlpha(alpha: number): void {
        this.alpha = alpha;
        this.applyAlpha();
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        for (const entry of this.pool.items) entry.item.setVisible(visible);
    }

    destroy(): void {
        for (const image of this.pool.clear()) image.destroy();
    }

    private applyAlpha(): void {
        for (const entry of this.pool.items) {
            entry.item.setAlpha(this.pool.alphaAt(entry.addedAt, this.now, START_ALPHA) * this.alpha);
        }
    }

    private createTexture(
        key: string,
        width: number,
        height: number,
        paint: (context: CanvasRenderingContext2D) => void,
    ): void {
        if (this.scene.textures.exists(key)) return;
        const canvas = this.scene.textures.createCanvas(key, width, height);
        const context = canvas?.getContext();
        if (!canvas || !context) return;
        context.fillStyle = PRINT_COLOR;
        paint(context);
        canvas.refresh();
    }
}
