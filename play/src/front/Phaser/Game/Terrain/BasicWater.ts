import type * as Phaser from "phaser";
import { TERRAIN_CELL } from "@workadventure/map-editor";
import { refreshCanvasTexture } from "../CanvasTextureRefresh";
import { SHORE_PX } from "./TerrainShading";
import type { TerrainWater } from "./TerrainWater";

/**
 * The water of the relief as Basique shows it: where it stands, in one flat blue, cell by cell. No depth, no shore,
 * no shader, no waves, no glide, no foam nor reflection. One pixel a cell stretched over the map: one image drawn,
 * looked at again every few seconds, and sent to the GPU again only when the outline of the water changed.
 */
export class BasicWater {
    private static instances = 0;
    private readonly key = `basic-water-${BasicWater.instances++}`;
    private readonly image: Phaser.GameObjects.Image;
    private texture: Phaser.Textures.CanvasTexture | undefined;
    private pixels: ImageData | undefined;
    private drawnVersion = -1;
    private checkedAt = -Infinity;
    private wet = false;

    constructor(
        private readonly scene: Phaser.Scene,
        depth: number,
    ) {
        this.image = scene.add.image(0, 0, "__MISSING").setOrigin(0, 0).setDepth(depth).setVisible(false);
    }

    /** Shows the water as `water` last holds it, at `now` (ms of the game); true when something changed on screen. */
    public show(water: TerrainWater, now: number): boolean {
        const version = water.version();
        if (version === this.drawnVersion || now - this.checkedAt < BASIC_WATER_CHECK_MS) return this.reveal();
        this.drawnVersion = version;
        this.checkedAt = now;
        const { x, y, width, height, depths } = water.settled();
        const resized = this.prepare(width, height);
        const { texture, pixels } = this;
        if (!texture || !pixels) return this.hide();
        const painted = paintBasicWater(depths, pixels.data);
        this.wet = painted.wet;
        if (!this.wet) return this.hide();
        if (painted.changed || resized) {
            texture.getContext().putImageData(pixels, 0, 0);
            refreshCanvasTexture(texture);
            this.image
                .setTexture(this.key)
                .setPosition(x * TERRAIN_CELL, y * TERRAIN_CELL)
                .setDisplaySize(width * TERRAIN_CELL, height * TERRAIN_CELL);
        }
        const shown = !this.image.visible || painted.changed || resized;
        this.image.setVisible(true);
        return shown;
    }

    /** Hides it; true when it was shown. */
    public hide(): boolean {
        if (!this.image.visible) return false;
        this.image.setVisible(false);
        return true;
    }

    public destroy(): void {
        this.image.destroy();
        if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    }

    private reveal(): boolean {
        if (this.image.visible || !this.wet) return false;
        this.image.setVisible(true);
        return true;
    }

    /** The canvas and its pixels for the grid, made again only when the grid changes size; true when they were. */
    private prepare(width: number, height: number): boolean {
        if (this.texture && this.texture.width === width && this.texture.height === height) return false;
        if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
        this.texture = undefined;
        this.pixels = undefined;
        if (width === 0 || height === 0) return true;
        this.texture = this.scene.textures.createCanvas(this.key, width, height) ?? undefined;
        this.pixels = this.texture?.getContext().createImageData(width, height);
        return true;
    }
}

/** How often Basique looks at the water again: it shows where water stands, not how it moves. */
const BASIC_WATER_CHECK_MS = 5000;

/** The one colour of the water in Basique. */
const BASIC_WATER_RGBA = [0x4f, 0x86, 0xb8, 0xd9] as const;

/**
 * Paints the depths of the water (pixels of water a cell) into RGBA `pixels`, one pixel a cell: the blue of Basique
 * where at least SHORE_PX of water stands, transparent elsewhere (a film over a meadow is not a lake). `changed` says
 * whether any pixel differs from what `pixels` held, `wet` whether any cell holds water.
 */
export function paintBasicWater(depths: Float32Array, pixels: Uint8ClampedArray): { wet: boolean; changed: boolean } {
    const [red, green, blue, opaque] = BASIC_WATER_RGBA;
    let wet = false;
    let changed = false;
    for (let index = 0; index < depths.length; index++) {
        const at = index * 4;
        const alpha = depths[index] >= SHORE_PX ? opaque : 0;
        if (alpha > 0) wet = true;
        // One colour: only whether the cell shows changes.
        if (pixels[at + 3] === alpha) continue;
        changed = true;
        pixels[at] = red;
        pixels[at + 1] = green;
        pixels[at + 2] = blue;
        pixels[at + 3] = alpha;
    }
    return { wet, changed };
}
