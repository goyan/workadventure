import * as Phaser from "phaser";
import { lightFalloff, type LightCone, type Point } from "./RgbLampGeometry";

/**
 * The light is drawn small and stretched: one texel for four map pixels. A light is a smooth gradient, which loses
 * nothing to it, and the smoothing of the stretched texture is what softens the edge of the shadows.
 */
const TEXELS_PER_PIXEL = 0.25;
/** How much of its colour a lamp adds to what it lights, at the lamp. */
const LIGHT_ALPHA = 0.55;
/** The fading of the light is drawn as a gradient of this many steps. */
const GRADIENT_STOPS = 12;

/**
 * The light of one RGB lamp on the map: a texture of its own, a gradient that is full at the lamp and gone at the end
 * of its reach, cut out by the polygon the light reaches (shadows included), added in the colour of the lamp. The
 * texture is only drawn again when asked: a lamp that does not change costs one image to render. Nothing is clipped
 * with a mask (see LampZoneLights).
 */
export class RgbLampVisual {
    private readonly image: Phaser.GameObjects.Image;
    private texture: Phaser.Textures.CanvasTexture | undefined;
    private texels = 0;
    /** The texture the light is drawn in now: the night veil is pierced with it. */
    public textureKey = "";

    constructor(
        private readonly scene: Phaser.Scene,
        /** The id of the object: the texture of this light is its own. */
        private readonly id: string,
        depth: number,
    ) {
        this.image = scene.add
            .image(0, 0, "__DEFAULT")
            .setOrigin(0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(LIGHT_ALPHA)
            .setDepth(depth)
            .setVisible(false);
    }

    /** Draws the light again: its place, its reach, its shape and its colour. */
    public draw(light: LightCone, polygon: readonly Point[], colour: number): void {
        const size = light.radius * 2;
        const texels = Math.max(2, Math.ceil(size * TEXELS_PER_PIXEL));
        if (texels !== this.texels || !this.texture) {
            this.resize(texels);
        }
        const left = light.x - light.radius;
        const top = light.y - light.radius;
        if (this.texture) {
            const context = this.texture.getContext();
            context.clearRect(0, 0, texels, texels);
            if (polygon.length >= 3) {
                const scale = texels / size;
                const centre = texels / 2;
                const gradient = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
                for (let stop = 0; stop <= GRADIENT_STOPS; stop++) {
                    const distance = stop / GRADIENT_STOPS;
                    gradient.addColorStop(distance, `rgba(255, 255, 255, ${lightFalloff(distance)})`);
                }
                context.beginPath();
                polygon.forEach((point, index) => {
                    const x = (point.x - left) * scale;
                    const y = (point.y - top) * scale;
                    if (index === 0) {
                        context.moveTo(x, y);
                    } else {
                        context.lineTo(x, y);
                    }
                });
                context.closePath();
                context.fillStyle = gradient;
                context.fill();
            }
            this.texture.refresh();
        }
        this.image.setPosition(left, top).setDisplaySize(size, size).setTint(colour);
    }

    private resize(texels: number): void {
        const previous = this.texture;
        this.texels = texels;
        this.textureKey = `rgb-lamp:${this.id}:${texels}`;
        this.texture = this.scene.textures.createCanvas(this.textureKey, texels, texels) ?? undefined;
        if (this.texture) {
            // The game runs without antialiasing (nearest filtering): a light must be smoothed all the same.
            this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
            this.image.setTexture(this.textureKey);
        }
        previous?.destroy();
    }

    public setVisible(visible: boolean): void {
        this.image.setVisible(visible);
    }

    public destroy(): void {
        this.image.destroy();
        this.texture?.destroy();
        this.texture = undefined;
    }
}
