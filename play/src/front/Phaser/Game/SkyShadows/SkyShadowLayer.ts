import * as Phaser from "phaser";
import type { WeatherView } from "../Weather/WeatherFrame";
import type { Point } from "./SkyShadowGeometry";

/**
 * Depth of the shadows: on the ground, over the map tiles (0), the floors of the map layer (0.5) and the grass of the
 * map (SnowGround, 0.6), under everything sorted by its y (walls, objects, trees, avatars and their names): what throws
 * a shadow is drawn over it.
 */
const SKY_SHADOW_DEPTH = 0.7;
/** The texture is never wider nor higher than this, in texels: zoomed out, the shadows are drawn coarser. */
const MAX_TEXELS = 2048;

/**
 * The shadows of the sky on the map: one texture over the part of the map around the screen, the polygons filled in
 * one colour (overlapping shadows do not darken each other), the indoor cells cleared, shown with the opacity of the
 * light. Only drawn again when asked (shadowRedraw); a fading light only changes the opacity of the image.
 */
export class SkyShadowLayer {
    private readonly image: Phaser.GameObjects.Image;
    private texture: Phaser.Textures.CanvasTexture | undefined;
    private textureKey = "";
    private size = { width: 0, height: 0 };
    private generation = 0;

    constructor(private readonly scene: Phaser.Scene) {
        this.image = scene.add.image(0, 0, "__DEFAULT").setOrigin(0).setDepth(SKY_SHADOW_DEPTH).setVisible(false);
    }

    /**
     * Draws the shadows over `area` (map pixels) at `zoom`: the polygons in `color`, without the indoor rectangles,
     * the whole image at `alpha`.
     */
    public draw(
        area: WeatherView,
        zoom: number,
        polygons: readonly (readonly Point[])[],
        indoor: readonly WeatherView[],
        color: number,
        alpha: number,
    ): void {
        const scale = Math.min(1, zoom, MAX_TEXELS / area.width, MAX_TEXELS / area.height);
        const width = Math.max(1, Math.ceil(area.width * scale));
        const height = Math.max(1, Math.ceil(area.height * scale));
        if (!this.texture || width !== this.size.width || height !== this.size.height) {
            this.resize(width, height);
        }
        const texture = this.texture;
        if (!texture) return;
        const context = texture.getContext();
        context.clearRect(0, 0, width, height);
        context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
        // Each polygon filled on its own, opaque: overlapping ones make one shadow, whatever their winding.
        for (const polygon of polygons) {
            context.beginPath();
            polygon.forEach((point, index) => {
                const x = (point.x - area.x) * scale;
                const y = (point.y - area.y) * scale;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.closePath();
            context.fill();
        }
        for (const rect of indoor) {
            context.clearRect(
                Math.floor((rect.x - area.x) * scale),
                Math.floor((rect.y - area.y) * scale),
                Math.ceil(rect.width * scale),
                Math.ceil(rect.height * scale),
            );
        }
        texture.refresh();
        this.image
            .setPosition(area.x, area.y)
            .setDisplaySize(width / scale, height / scale)
            .setAlpha(alpha)
            .setVisible(true);
    }

    public setAlpha(alpha: number): void {
        this.image.setAlpha(alpha);
    }

    public hide(): void {
        this.image.setVisible(false);
    }

    public destroy(): void {
        this.image.destroy();
        this.texture?.destroy();
        this.texture = undefined;
    }

    private resize(width: number, height: number): void {
        const previous = this.texture;
        this.size = { width, height };
        this.textureKey = `sky-shadows:${this.generation++}`;
        this.texture = this.scene.textures.createCanvas(this.textureKey, width, height) ?? undefined;
        if (this.texture) {
            // The game runs without antialiasing (nearest filtering): a shadow drawn coarser when zoomed out is
            // smoothed all the same.
            this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
            this.image.setTexture(this.textureKey);
        }
        previous?.destroy();
    }
}
