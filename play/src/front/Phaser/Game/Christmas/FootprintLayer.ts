import { FadingPool } from "./FadingPool";
import { FOOTPRINT_FADE_MS, FOOTPRINT_MAX, type FootprintMark } from "./FootprintTrail";

const STEP_TEXTURE = "xmas-step";
const TRAIL_TEXTURE = "xmas-trail";
const PRINT_COLOR = "#b4bedb";
/** The colour of a layer whose prints are tinted one by one with the colour of their ground (`styleAt`). */
export const TINTED_PRINTS = "#ffffff";
const START_ALPHA = 0.5;
const TRAIL_WIDTH_PX = 4;
/** Prints sit just below the avatar walking on them (its depth is its y, its feet are 16 px lower). */
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

    private readonly stepTexture: string;
    private readonly trailTexture: string;

    /**
     * `color`: the colour of the prints, blue grey in the snow by default. `dropAt`: how much lower the ground at a
     * point is drawn, the relief seen in 3/4 (GameScene.groundDropAt): a print lies where its ground is drawn.
     */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly color = PRINT_COLOR,
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {
        const suffix = color === PRINT_COLOR ? "" : `-${color}`;
        this.stepTexture = `${STEP_TEXTURE}${suffix}`;
        this.trailTexture = `${TRAIL_TEXTURE}${suffix}`;
        this.createTexture(this.stepTexture, 6, 4, (context) => {
            context.beginPath();
            context.ellipse(3, 2, 3, 2, 0, 0, Math.PI * 2);
            context.fill();
        });
        this.createTexture(this.trailTexture, 1, TRAIL_WIDTH_PX, (context) =>
            context.fillRect(0, 0, 1, TRAIL_WIDTH_PX),
        );
    }

    /** Number of footprints on the map. */
    get count(): number {
        return this.pool.size;
    }

    add(marks: FootprintMark[], now: number, styleAt?: (x: number, y: number) => PrintStyle): void {
        this.now = Math.max(this.now, now);
        for (const mark of marks) {
            const at = mark.kind === "step" ? { x: mark.x, y: mark.y } : { x: mark.x1, y: mark.y1 };
            // Without a style, the print has the colour of its layer, laid where it falls.
            const style = styleAt?.(at.x, at.y);
            const drop = style?.drop ?? Math.round(this.dropAt(at.x, at.y));
            const endDrop =
                mark.kind === "trail"
                    ? (styleAt?.(mark.x2, mark.y2)?.drop ?? Math.round(this.dropAt(mark.x2, mark.y2)))
                    : drop;
            const strength = style?.alpha ?? START_ALPHA;
            const image =
                mark.kind === "step"
                    ? this.scene.add.image(mark.x, mark.y + drop, this.stepTexture).setRotation(mark.angle)
                    : this.scene.add
                          .image(mark.x1, mark.y1 + drop, this.trailTexture)
                          .setOrigin(0, 0.5)
                          .setDisplaySize(
                              Math.hypot(mark.x2 - mark.x1, mark.y2 + endDrop - mark.y1 - drop),
                              mark.width ?? TRAIL_WIDTH_PX,
                          )
                          .setRotation(Math.atan2(mark.y2 + endDrop - mark.y1 - drop, mark.x2 - mark.x1));
            const feetY = mark.kind === "step" ? mark.y : Math.max(mark.y1, mark.y2);
            // Sorted by its place, as the avatar that left it (whose depth is its place, wherever it is drawn): a
            // print drawn lower in a hollow must not pass over the feet on it.
            image.setDepth(feetY - DEPTH_BELOW_FEET);
            if (style) image.setTint(style.tint);
            this.strength.set(image, strength);
            image.setAlpha(strength * this.alpha);
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
        context.fillStyle = this.color;
        paint(context);
        canvas.refresh();
    }
}
