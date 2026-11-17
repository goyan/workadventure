import * as Phaser from "phaser";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import type { WeatherView } from "../Weather/WeatherFrame";
import type { Point } from "./SkyShadowGeometry";

/** Over the shadows of the sky (0.7), under everything sorted by its y: a light on the floor of the room. */
const SKY_WINDOW_LIGHT_DEPTH = 0.71;
const MAX_TEXELS = 2048;

/** A patch of light on the floor of a room, and the room it stays in. */
export interface WindowLightPatch {
    polygon: readonly Point[];
    room: number;
}

/**
 * The light of the sky that comes in through the windows: one square texture over the part of the map around the
 * screen, the patches filled in white, each kept inside the cells of its own room, shown added in the colour of the
 * light. The night veil is pierced with the same texture (skyWindowLightsStore).
 */
export class SkyWindowLightLayer {
    private readonly image: Phaser.GameObjects.Image;
    private texture: Phaser.Textures.CanvasTexture | undefined;
    private texels = 0;
    private generation = 0;
    public textureKey = "";
    /** Changes whenever the texture is drawn again. */
    public revision = 0;
    /** The square of the map the texture covers, in map pixels. */
    public square = { x: 0, y: 0, size: 0 };

    constructor(private readonly scene: Phaser.Scene) {
        this.image = scene.add
            .image(0, 0, "__DEFAULT")
            .setOrigin(0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(SKY_WINDOW_LIGHT_DEPTH)
            .setVisible(false);
    }

    public draw(
        area: WeatherView,
        zoom: number,
        patches: readonly WindowLightPatch[],
        grid: OutdoorGrid,
        color: number,
        alpha: number,
    ): void {
        const side = Math.max(area.width, area.height);
        const scale = Math.min(1, zoom, MAX_TEXELS / side);
        const texels = Math.max(1, Math.ceil(side * scale));
        if (!this.texture || texels !== this.texels) this.resize(texels);
        const texture = this.texture;
        if (!texture) return;
        const context = texture.getContext();
        context.clearRect(0, 0, texels, texels);
        context.fillStyle = "#ffffff";
        const cell = grid.cellSize;
        for (const patch of patches) {
            const xs = patch.polygon.map((point) => point.x);
            const ys = patch.polygon.map((point) => point.y);
            // The patch stays inside its room: clipped to the cells of that room under it.
            context.save();
            context.beginPath();
            for (let row = Math.floor(Math.min(...ys) / cell); row * cell < Math.max(...ys); row++) {
                for (let column = Math.floor(Math.min(...xs) / cell); column * cell < Math.max(...xs); column++) {
                    if (grid.roomAt((column + 0.5) * cell, (row + 0.5) * cell) !== patch.room) continue;
                    context.rect(
                        (column * cell - area.x) * scale,
                        (row * cell - area.y) * scale,
                        cell * scale,
                        cell * scale,
                    );
                }
            }
            context.clip();
            context.beginPath();
            patch.polygon.forEach((point, index) => {
                const x = (point.x - area.x) * scale;
                const y = (point.y - area.y) * scale;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.closePath();
            context.fill();
            context.restore();
        }
        texture.refresh();
        this.revision += 1;
        this.square = { x: area.x, y: area.y, size: texels / scale };
        this.image
            .setPosition(area.x, area.y)
            .setDisplaySize(texels / scale, texels / scale)
            .setTint(color)
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

    private resize(texels: number): void {
        const previous = this.texture;
        this.texels = texels;
        this.textureKey = `sky-windows:${this.generation++}`;
        this.texture = this.scene.textures.createCanvas(this.textureKey, texels, texels) ?? undefined;
        if (this.texture) {
            this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
            this.image.setTexture(this.textureKey);
        }
        previous?.destroy();
    }
}
