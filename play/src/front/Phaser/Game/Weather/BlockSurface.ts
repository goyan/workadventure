import * as Phaser from "phaser";
import type { WeatherView } from "./WeatherFrame";

/** Where a block canvas lies on the map: its top left corner (map pixels) and its size, one pixel a block. */
export interface BlockCanvasArea {
    x: number;
    y: number;
    columns: number;
    rows: number;
}

/**
 * The canvas covering `view` with one pixel a block of `resolution` map pixels, on a grid fixed to the map. Its size
 * depends on the size of the view only, one block wider and higher than it: a scroll never makes the canvas again.
 */
export function blockCanvasArea(view: WeatherView, resolution: number): BlockCanvasArea {
    return {
        x: Math.floor(view.x / resolution) * resolution,
        y: Math.floor(view.y / resolution) * resolution,
        columns: Math.ceil(view.width / resolution) + 1,
        rows: Math.ceil(view.height / resolution) + 1,
    };
}

/**
 * Paints a field of thickness levels (fieldLevels) into the RGBA pixels of a block canvas, on its outdoor cells only
 * (outdoorCells over the canvas), moved by `shift` whole cells (the shadows of the clouds), over what is already there.
 */
export function paintField(
    pixels: Uint8ClampedArray,
    area: BlockCanvasArea,
    resolution: number,
    field: BlockCanvasArea,
    levels: Uint8Array,
    outdoor: Uint8Array,
    shift: { columns: number; rows: number },
    color: number,
    alphaOf: (level: number) => number,
): void {
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;
    const alphas = Array.from({ length: 256 }, (_, level) => (level === 0 ? 0 : alphaOf(level)));
    // Field cell under the canvas cell (column, line), the field moved by the shift.
    const columnOffset = Math.round((area.x - field.x) / resolution) - shift.columns;
    const lineOffset = Math.round((area.y - field.y) / resolution) - shift.rows;
    for (let line = 0; line < area.rows; line++) {
        const fieldLine = line + lineOffset;
        if (fieldLine < 0 || fieldLine >= field.rows) continue;
        for (let column = 0; column < area.columns; column++) {
            const cell = line * area.columns + column;
            if (!outdoor[cell]) continue;
            const fieldColumn = column + columnOffset;
            if (fieldColumn < 0 || fieldColumn >= field.columns) continue;
            const alpha = alphas[levels[fieldLine * field.columns + fieldColumn]];
            if (alpha <= 0) continue;
            blend(pixels, cell * 4, red, green, blue, alpha);
        }
    }
}

/** Lays a colour of opacity `alpha` over the pixel at `index`, as the screen would. */
function blend(
    pixels: Uint8ClampedArray,
    index: number,
    red: number,
    green: number,
    blue: number,
    alpha: number,
): void {
    const under = pixels[index + 3] / 255;
    const over = under * (1 - alpha);
    const total = alpha + over;
    pixels[index] = (red * alpha + pixels[index] * over) / total;
    pixels[index + 1] = (green * alpha + pixels[index + 1] * over) / total;
    pixels[index + 2] = (blue * alpha + pixels[index + 2] * over) / total;
    pixels[index + 3] = total * 255;
}

/** Blocks of the weather drawn on the map (fog, clouds, their shadows), each layer over the one before. */
export interface BlockSurface {
    /** Starts a new image over `view`, one pixel a cell of `resolution` map pixels: the cells of the canvas. */
    begin(view: WeatherView, resolution: number): BlockCanvasArea;
    /** Paints a field of levels (paintField) on the outdoor cells of the canvas, over the layers painted before. */
    paintField(
        field: BlockCanvasArea,
        levels: Uint8Array,
        outdoor: Uint8Array,
        shift: { columns: number; rows: number },
        color: number,
        alphaOf: (level: number) => number,
    ): void;
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
    /** Canvases made so far (a new size of view), for a key of its own each. */
    private sizes = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        depth: number,
    ) {
        this.image = scene.add.image(0, 0, "__DEFAULT").setOrigin(0, 0).setDepth(depth).setVisible(false);
    }

    public begin(view: WeatherView, resolution: number): BlockCanvasArea {
        this.resolution = resolution;
        this.area = blockCanvasArea(view, resolution);
        this.painted = false;
        const { columns, rows } = this.area;
        if (!this.texture || this.texture.width !== columns || this.texture.height !== rows) {
            const previous = this.texture;
            // A canvas kept in memory (not on the GPU): sending its pixels to the texture at every drawing stays cheap.
            const canvas = document.createElement("canvas");
            canvas.width = columns;
            canvas.height = rows;
            canvas.getContext("2d", { willReadFrequently: true });
            this.texture =
                this.scene.textures.addCanvas(`weather-blocks:${this.id}:${this.sizes++}:${columns}x${rows}`, canvas) ??
                undefined;
            this.texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
            this.pixels = this.texture?.getContext().createImageData(columns, rows);
            if (this.texture) this.image.setTexture(this.texture.key);
            previous?.destroy();
        } else {
            this.pixels?.data.fill(0);
        }
        return this.area;
    }

    public paintField(
        field: BlockCanvasArea,
        levels: Uint8Array,
        outdoor: Uint8Array,
        shift: { columns: number; rows: number },
        color: number,
        alphaOf: (level: number) => number,
    ): void {
        if (!this.pixels) return;
        paintField(this.pixels.data, this.area, this.resolution, field, levels, outdoor, shift, color, alphaOf);
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
