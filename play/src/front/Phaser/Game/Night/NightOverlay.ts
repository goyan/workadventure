import * as Phaser from "phaser";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { NightFrame } from "./NightRenderDecision";

/** Night blue of the veil. */
export const NIGHT_TINT = 0x0b1030;
/** Width of the soft border of a lit area, in map pixels. */
export const NIGHT_SOFT_EDGE_PX = 8;

/** White brush with a transparent-to-opaque border, generated once and shared by every overlay. */
const SOFT_RECT_TEXTURE = "night-soft-rect";
// Two solid pixels in the middle: the part of the nine-slice that is stretched to the size of the area.
const SOFT_RECT_SIZE = NIGHT_SOFT_EDGE_PX * 2 + 2;
const MIN_BRUSH_SIZE = NIGHT_SOFT_EDGE_PX * 2;

function ensureSoftRectTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(SOFT_RECT_TEXTURE)) {
        return;
    }
    const texture = scene.textures.createCanvas(SOFT_RECT_TEXTURE, SOFT_RECT_SIZE, SOFT_RECT_SIZE);
    if (!texture) {
        return;
    }
    const context = texture.getContext();
    const image = context.createImageData(SOFT_RECT_SIZE, SOFT_RECT_SIZE);
    // Opacity grows linearly from the outer edge; the product of both axes rounds the corners a little.
    const ramp = (index: number): number =>
        Math.min(1, (Math.min(index, SOFT_RECT_SIZE - 1 - index) + 0.5) / NIGHT_SOFT_EDGE_PX);
    for (let y = 0; y < SOFT_RECT_SIZE; y++) {
        for (let x = 0; x < SOFT_RECT_SIZE; x++) {
            const offset = (y * SOFT_RECT_SIZE + x) * 4;
            image.data[offset] = 255;
            image.data[offset + 1] = 255;
            image.data[offset + 2] = 255;
            image.data[offset + 3] = Math.round(ramp(x) * ramp(y) * 255);
        }
    }
    context.putImageData(image, 0, 0);
    texture.refresh();
    // The game runs without antialiasing (nearest filtering): smooth the stretched gradient anyway.
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** White disc, opaque at the centre and fading to transparent at its edge: the brush of the player halos. */
const SOFT_DISC_TEXTURE = "night-soft-disc";
const SOFT_DISC_SIZE = 128;

function ensureSoftDiscTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(SOFT_DISC_TEXTURE)) {
        return;
    }
    const texture = scene.textures.createCanvas(SOFT_DISC_TEXTURE, SOFT_DISC_SIZE, SOFT_DISC_SIZE);
    if (!texture) {
        return;
    }
    const context = texture.getContext();
    const image = context.createImageData(SOFT_DISC_SIZE, SOFT_DISC_SIZE);
    const half = SOFT_DISC_SIZE / 2;
    for (let y = 0; y < SOFT_DISC_SIZE; y++) {
        for (let x = 0; x < SOFT_DISC_SIZE; x++) {
            // Distance of the texel centre to the disc centre, 0 at the centre and 1 at the edge.
            const t = Math.min(1, Math.hypot(x + 0.5 - half, y + 0.5 - half) / half);
            // Smoothstep falloff: no visible ring where the light ends.
            const alpha = 1 - t * t * (3 - 2 * t);
            const offset = (y * SOFT_DISC_SIZE + x) * 4;
            image.data[offset] = 255;
            image.data[offset + 1] = 255;
            image.data[offset + 2] = 255;
            image.data[offset + 3] = Math.round(alpha * 255);
        }
    }
    context.putImageData(image, 0, 0);
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/**
 * The night veil: a texture the size of the screen, filled with the night tint, out of which the lit areas are
 * erased with a soft brush, and the player halos with a soft disc. It is only redrawn when asked (see nightRenderAction).
 *
 * Placement under zoom: the texture has one texel per screen pixel and a scroll factor of 0, but Phaser still
 * applies the camera zoom to scroll-factor-0 objects, around the camera origin (originX * width, originY * height):
 * a local point p is shown at (p - origin) * zoom + origin. Scaling the texture by 1 / zoom and placing its top-left
 * corner at origin * (1 - 1 / zoom) puts that corner on the top-left of the viewport and makes one texel one screen
 * pixel again, at any zoom. A lit area at world x is then at texture x (x - worldView.x) * zoom.
 */
export class NightOverlay {
    private readonly texture: Phaser.GameObjects.RenderTexture;
    // One brush per lit area drawn this frame: the texture's drawing commands run at render(), so a brush cannot be
    // moved between two erases of the same frame.
    private readonly brushes: Phaser.GameObjects.NineSlice[] = [];
    // Same for the halos: one disc per halo drawn this frame.
    private readonly discs: Phaser.GameObjects.Image[] = [];
    private textureWidth = 0;
    private textureHeight = 0;

    constructor(private readonly scene: Phaser.Scene) {
        ensureSoftRectTexture(scene);
        ensureSoftDiscTexture(scene);
        const camera = scene.cameras.main;
        this.textureWidth = Math.ceil(camera.width);
        this.textureHeight = Math.ceil(camera.height);
        this.texture = scene.add
            .renderTexture(0, 0, this.textureWidth, this.textureHeight)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH_NIGHT_INDEX)
            .setVisible(false);
    }

    public draw(frame: NightFrame): void {
        const camera = this.scene.cameras.main;
        const { view } = frame;
        const zoom = view.zoom;

        const width = Math.ceil(camera.width);
        const height = Math.ceil(camera.height);
        if (width !== this.textureWidth || height !== this.textureHeight) {
            this.textureWidth = width;
            this.textureHeight = height;
            this.texture.resize(width, height);
        }
        this.texture
            .setScale(1 / zoom)
            .setPosition(
                camera.originX * camera.width * (1 - 1 / zoom),
                camera.originY * camera.height * (1 - 1 / zoom),
            );

        this.texture.clear();
        this.texture.fill(NIGHT_TINT, frame.opacity);

        let used = 0;
        for (const area of frame.lit) {
            if (
                area.x + area.width <= view.x ||
                area.y + area.height <= view.y ||
                area.x >= view.x + view.width ||
                area.y >= view.y + view.height
            ) {
                continue;
            }
            const brush = this.brush(used++);
            // The brush is sized in map pixels (so the soft edge is NIGHT_SOFT_EDGE_PX map pixels) and scaled by the
            // zoom into texture pixels. An area smaller than both borders shrinks the minimal brush instead.
            const brushWidth = Math.max(area.width, MIN_BRUSH_SIZE);
            const brushHeight = Math.max(area.height, MIN_BRUSH_SIZE);
            brush
                .setSize(brushWidth, brushHeight)
                .setScale((zoom * area.width) / brushWidth, (zoom * area.height) / brushHeight)
                .setPosition((area.x - view.x) * zoom, (area.y - view.y) * zoom)
                .setAlpha(area.intensity);
            this.texture.erase(brush);
        }

        let discsUsed = 0;
        for (const halo of frame.halos) {
            if (
                halo.x + halo.radius <= view.x ||
                halo.y + halo.radius <= view.y ||
                halo.x - halo.radius >= view.x + view.width ||
                halo.y - halo.radius >= view.y + view.height
            ) {
                continue;
            }
            const disc = this.disc(discsUsed++);
            const diameter = halo.radius * 2 * zoom;
            disc.setDisplaySize(diameter, diameter).setPosition((halo.x - view.x) * zoom, (halo.y - view.y) * zoom);
            this.texture.erase(disc);
        }

        this.texture.render();
        this.texture.setVisible(true);
    }

    public hide(): void {
        this.texture.setVisible(false);
    }

    public destroy(): void {
        this.texture.destroy();
        for (const brush of this.brushes) {
            brush.destroy();
        }
        this.brushes.length = 0;
        for (const disc of this.discs) {
            disc.destroy();
        }
        this.discs.length = 0;
        // The soft brush textures stay in the texture manager: they are small and reused by the next scene.
    }

    private brush(index: number): Phaser.GameObjects.NineSlice {
        let brush = this.brushes[index];
        if (brush === undefined) {
            // Not added to the display list: only drawn into the veil. NineSlice has no canvas renderer in Phaser 4.2:
            // with the canvas renderer the veil shows without lit areas (accepted, WebGL is the normal case).
            brush = new Phaser.GameObjects.NineSlice(
                this.scene,
                0,
                0,
                SOFT_RECT_TEXTURE,
                undefined,
                MIN_BRUSH_SIZE,
                MIN_BRUSH_SIZE,
                NIGHT_SOFT_EDGE_PX,
                NIGHT_SOFT_EDGE_PX,
                NIGHT_SOFT_EDGE_PX,
                NIGHT_SOFT_EDGE_PX,
            ).setOrigin(0, 0);
            this.brushes[index] = brush;
        }
        return brush;
    }

    private disc(index: number): Phaser.GameObjects.Image {
        let disc = this.discs[index];
        if (disc === undefined) {
            // Not added to the display list either. Unlike NineSlice, Image also renders with the canvas renderer.
            disc = new Phaser.GameObjects.Image(this.scene, 0, 0, SOFT_DISC_TEXTURE).setOrigin(0.5, 0.5);
            this.discs[index] = disc;
        }
        return disc;
    }
}
