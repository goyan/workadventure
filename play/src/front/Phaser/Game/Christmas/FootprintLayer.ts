import { FadingPool } from "./FadingPool";
import { FOOTPRINT_FADE_MS, FOOTPRINT_MAX, type FootprintMark } from "./FootprintTrail";

const STEP_TEXTURE = "ground-step";
const TRAIL_TEXTURE = "ground-trail";
/** The prints are drawn white and tinted with the colour of their ground (snow by default). */
const SNOW_TINT = 0xb4bedb;
const START_ALPHA = 0.5;
const TRAIL_WIDTH_PX = 4;
/** Prints sit just below the avatar walking on them (its depth is its y, its feet are 8 px lower). */
const DEPTH_BELOW_FEET = 16;

/** How a print is laid where it falls: its tint, its strength, and how much lower it is drawn (a hollow seen in 3/4). */
export interface PrintStyle {
    tint: number;
    alpha: number;
    drop: number;
}

/** Draws the footprints and fades them out. At most 400 at once, the oldest goes first. */
export class FootprintLayer {
    private readonly pool = new FadingPool<Phaser.GameObjects.Image>(FOOTPRINT_MAX, FOOTPRINT_FADE_MS);
    private visible = true;
    /** The whole layer fades in and out with the snow; each print fades on its own on top of that. */
    private alpha = 1;
    /** The time of the last fade, used when the layer alpha changes between two updates. */
    private now = 0;
    /** The strength each print was laid with (its ground). */
    private readonly strength = new WeakMap<Phaser.GameObjects.Image, number>();

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

    add(marks: FootprintMark[], now: number, styleAt?: (x: number, y: number) => PrintStyle): void {
        this.now = Math.max(this.now, now);
        for (const mark of marks) {
            const at = mark.kind === "step" ? { x: mark.x, y: mark.y } : { x: mark.x1, y: mark.y1 };
            const style = styleAt?.(at.x, at.y) ?? { tint: SNOW_TINT, alpha: START_ALPHA, drop: 0 };
            const image =
                mark.kind === "step"
                    ? this.scene.add.image(mark.x, mark.y + style.drop, STEP_TEXTURE).setRotation(mark.angle)
                    : this.scene.add
                          .image(mark.x1, mark.y1 + style.drop, TRAIL_TEXTURE)
                          .setOrigin(0, 0.5)
                          .setDisplaySize(Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1), TRAIL_WIDTH_PX)
                          .setRotation(Math.atan2(mark.y2 - mark.y1, mark.x2 - mark.x1));
            const feetY = mark.kind === "step" ? mark.y : Math.max(mark.y1, mark.y2);
            image.setDepth(feetY + style.drop - DEPTH_BELOW_FEET);
            image.setTint(style.tint);
            this.strength.set(image, style.alpha);
            image.setAlpha(style.alpha * this.alpha);
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
            const strength = this.strength.get(entry.item) ?? START_ALPHA;
            entry.item.setAlpha(this.pool.alphaAt(entry.addedAt, this.now, strength) * this.alpha);
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
        context.fillStyle = "#ffffff";
        paint(context);
        canvas.refresh();
    }
}
