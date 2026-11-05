import type * as Phaser from "phaser";

/** Rows of the 32px woka frame left above the water: head and shoulders. */
const VISIBLE_ROWS = 20;
/** How far the woka sinks, so that the water line is at its chest. */
const SINK = 5;
/** Local y of the water line, in the character container (the 32px frame is centered on it). */
const WATER_LINE_Y = -16 + VISIBLE_ROWS + SINK;
const BOB_AMPLITUDE = 1.5;
const BOB_PERIOD_MS = 1800;
const RIPPLE_PERIOD_MS = 1400;
const FOAM_COLOR = 0xffffff;

/**
 * Swimming drawn in code, so that it fits every woka whatever its layers: the body is cut at the water line, the
 * woka bobs, rings spread on the water around it and a wake follows it while it moves. A splash marks the dive and
 * the way out. Wokas have no swimming frames: their walking animation keeps playing under the water line.
 */
export class SwimEffect {
    private ripples: Phaser.GameObjects.Graphics | undefined;
    private lastX = 0;
    private lastY = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
    ) {}

    public get isActive(): boolean {
        return this.ripples !== undefined;
    }

    public start(): void {
        if (this.ripples) return;
        this.ripples = this.scene.add.graphics();
        this.container.add(this.ripples);
        this.lastX = this.container.x;
        this.lastY = this.container.y;
        this.splash(10);
    }

    public stop(sprites: Iterable<Phaser.GameObjects.Sprite>): void {
        if (!this.ripples) return;
        this.ripples.destroy();
        this.ripples = undefined;
        for (const sprite of sprites) {
            sprite.setCrop();
            sprite.setY(0);
        }
        this.splash(5);
    }

    /** Called every frame while swimming. Sprites may be replaced at any time (new texture): all are set again. */
    public update(time: number, sprites: Iterable<Phaser.GameObjects.Sprite>): void {
        const ripples = this.ripples;
        if (!ripples) return;
        const bob = Math.sin((time / BOB_PERIOD_MS) * Math.PI * 2) * BOB_AMPLITUDE;
        for (const sprite of sprites) {
            sprite.setCrop(0, 0, sprite.frame.width, VISIBLE_ROWS);
            sprite.setY(SINK + bob);
        }

        const moved = Math.hypot(this.container.x - this.lastX, this.container.y - this.lastY);
        const dx = this.container.x - this.lastX;
        const dy = this.container.y - this.lastY;
        this.lastX = this.container.x;
        this.lastY = this.container.y;

        const waterLine = WATER_LINE_Y + bob;
        ripples.clear();
        // The ring around the body, at the water line.
        ripples.lineStyle(1, FOAM_COLOR, 0.8);
        ripples.strokeEllipse(0, waterLine, 22, 6);
        // A ring spreading out and fading, again and again.
        const spread = (time % RIPPLE_PERIOD_MS) / RIPPLE_PERIOD_MS;
        ripples.lineStyle(1, FOAM_COLOR, 0.5 * (1 - spread));
        ripples.strokeEllipse(0, waterLine, 22 + spread * 20, 6 + spread * 6);
        if (moved > 0.1) {
            // The wake: two lines opening behind the swimmer.
            const length = Math.hypot(dx, dy);
            const backX = -dx / length;
            const backY = -dy / length;
            ripples.lineStyle(1, FOAM_COLOR, 0.6);
            for (const side of [-1, 1]) {
                ripples.lineBetween(
                    backX * 8 - backY * 5 * side,
                    waterLine + backY * 3 + backX * 2 * side,
                    backX * 20 - backY * 11 * side,
                    waterLine + backY * 8 + backX * 5 * side,
                );
            }
        }
    }

    public destroy(): void {
        this.ripples?.destroy();
        this.ripples = undefined;
    }

    /** Drops thrown up around the water line, falling back and fading. */
    private splash(drops: number): void {
        const x = this.container.x;
        const y = this.container.y + WATER_LINE_Y;
        for (let i = 0; i < drops; i++) {
            const angle = Math.PI + (Math.PI * (i + 0.5)) / drops;
            const drop = this.scene.add.circle(x, y, 1.5, FOAM_COLOR, 0.9).setDepth(this.container.depth + 1);
            this.scene.tweens.add({
                targets: drop,
                x: x + Math.cos(angle) * 14,
                y: y + Math.sin(angle) * 12 + 6,
                alpha: 0,
                duration: 450,
                ease: "Quad.easeOut",
                onComplete: () => drop.destroy(),
            });
        }
    }
}
