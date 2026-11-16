import type { FogBlock, WeatherView } from "./WeatherFrame";

/** Where a block canvas lies on the map: its top left corner (map pixels) and its size, one pixel a block. */
export interface BlockCanvasArea {
    x: number;
    y: number;
    columns: number;
    rows: number;
}

/** The canvas covering `view` with one pixel a block of `resolution` map pixels, on a grid fixed to the map. */
export function blockCanvasArea(view: WeatherView, resolution: number): BlockCanvasArea {
    const x = Math.floor(view.x / resolution) * resolution;
    const y = Math.floor(view.y / resolution) * resolution;
    return {
        x,
        y,
        columns: Math.ceil((view.x + view.width - x) / resolution),
        rows: Math.ceil((view.y + view.height - y) / resolution),
    };
}

/**
 * Paints blocks (fog, clouds, their shadows) into the RGBA pixels of a block canvas, over what is already there as the
 * screen would lay them. A block cut by a wall is rounded to the nearest pixel.
 */
export function paintBlocks(
    pixels: Uint8ClampedArray,
    area: BlockCanvasArea,
    resolution: number,
    blocks: readonly FogBlock[],
    color: number,
    alphaOf: (level: number) => number,
): void {
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;
    const column = (x: number) => Math.max(0, Math.min(area.columns, Math.round((x - area.x) / resolution)));
    const row = (y: number) => Math.max(0, Math.min(area.rows, Math.round((y - area.y) / resolution)));
    for (const block of blocks) {
        const alpha = alphaOf(block.level);
        if (alpha <= 0) continue;
        const left = column(block.x);
        const right = column(block.x + block.width);
        const bottom = row(block.y + block.height);
        for (let line = row(block.y); line < bottom; line++) {
            for (let index = (line * area.columns + left) * 4; index < (line * area.columns + right) * 4; index += 4) {
                const under = pixels[index + 3] / 255;
                const over = under * (1 - alpha);
                const total = alpha + over;
                pixels[index] = (red * alpha + pixels[index] * over) / total;
                pixels[index + 1] = (green * alpha + pixels[index + 1] * over) / total;
                pixels[index + 2] = (blue * alpha + pixels[index + 2] * over) / total;
                pixels[index + 3] = total * 255;
            }
        }
    }
}

/** Blocks of the weather drawn on the map (fog, clouds, their shadows), each layer over the one before. */
export interface BlockSurface {
    /** Starts a new image over `view`, with blocks of `resolution` map pixels at the finest. */
    begin(view: WeatherView, resolution: number): void;
    paint(blocks: readonly FogBlock[], color: number, alphaOf: (level: number) => number): void;
    /** Shows what was painted since `begin` (nothing painted: hidden). */
    end(): void;
    hide(): void;
    destroy(): void;
}

let surfaces = 0;

/**
 * The blocks painted into a small canvas, one pixel a block, shown as one image stretched over the map with sharp
 * pixels: one picture for the GPU instead of thousands of rectangles at every displayed image.
 */
export class CanvasBlockSurface implements BlockSurface {
    private readonly id = surfaces++;
    private readonly image: Phaser.GameObjects.Image;
    private texture: Phaser.Textures.CanvasTexture | undefined;
    private pixels: ImageData | undefined;
    private area: BlockCanvasArea = { x: 0, y: 0, columns: 0, rows: 0 };
    private resolution = 1;
    private painted = false;

    constructor(
        private readonly scene: Phaser.Scene,
        depth: number,
    ) {
        this.image = scene.add.image(0, 0, "__DEFAULT").setOrigin(0, 0).setDepth(depth).setVisible(false);
    }

    public begin(view: WeatherView, resolution: number): void {
        this.resolution = resolution;
        this.area = blockCanvasArea(view, resolution);
        this.painted = false;
        const { columns, rows } = this.area;
        if (!this.texture || this.texture.width !== columns || this.texture.height !== rows) {
            const previous = this.texture;
            this.texture =
                this.scene.textures.createCanvas(`weather-blocks:${this.id}:${columns}x${rows}`, columns, rows) ??
                undefined;
            this.texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
            this.pixels = this.texture?.getContext().createImageData(columns, rows);
            if (this.texture) this.image.setTexture(this.texture.key);
            previous?.destroy();
        } else {
            this.pixels?.data.fill(0);
        }
    }

    public paint(blocks: readonly FogBlock[], color: number, alphaOf: (level: number) => number): void {
        if (!this.pixels || blocks.length === 0) return;
        paintBlocks(this.pixels.data, this.area, this.resolution, blocks, color, alphaOf);
        this.painted = true;
    }

    public end(): void {
        if (!this.texture || !this.pixels || !this.painted) {
            this.image.setVisible(false);
            return;
        }
        this.texture.getContext().putImageData(this.pixels, 0, 0);
        this.texture.refresh();
        this.image
            .setPosition(this.area.x, this.area.y)
            .setDisplaySize(this.area.columns * this.resolution, this.area.rows * this.resolution)
            .setVisible(true);
    }

    public hide(): void {
        this.image.setVisible(false);
    }

    public destroy(): void {
        this.image.destroy();
        this.texture?.destroy();
    }
}

export function createBlockSurface(scene: Phaser.Scene, depth: number): BlockSurface {
    return new CanvasBlockSurface(scene, depth);
}
