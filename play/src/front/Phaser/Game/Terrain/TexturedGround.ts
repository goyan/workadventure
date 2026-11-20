import * as Phaser from "phaser";
import { refreshCanvasTexture } from "@wa/front/Phaser/Game/CanvasTextureRefresh";

/** Where a ground is shown: the top left corner of a grid of square cells, in map pixels, and its size in cells. */
export interface GroundArea {
    x: number;
    y: number;
    columns: number;
    rows: number;
    cell: number;
}

/** The ground textures: soils of the relief, grass of the seasons, snow and water. Their key is their URL. */
export const GROUND_TEXTURES = {
    earth: "/resources/terrain/ground-earth.png?v=3",
    meadow: "/resources/terrain/ground-meadow.png?v=2",
    clay: "/resources/terrain/ground-clay.png",
    sand: "/resources/terrain/ground-sand.png?v=2",
    rock: "/resources/terrain/ground-rock.png?v=7",
    gravel: "/resources/terrain/ground-gravel.png",
    grass: "/resources/objects/weather/terrain-green.png",
    autumnGrass: "/resources/objects/weather/terrain-autumn.png",
    snow: "/resources/objects/weather/terrain-snow.png",
    water: "/resources/terrain/ground-water-0.png",
    ice: "/resources/terrain/ground-ice.png",
    deepWater: "/resources/terrain/ground-water-deep.png",
} as const;

/** The water, its ripples twinkling in place: one image after the other in a loop, nothing slides. */
export const WATER_FRAMES = [0, 1, 2, 3, 4, 5].map((frame) => `/resources/terrain/ground-water-${frame}.png`);

/** Every texture of the grounds, to load before the first drawing. */
export const GROUND_TEXTURE_URLS = [...Object.values(GROUND_TEXTURES), ...WATER_FRAMES];

/** Pixels of the mask a side for each cell of a ground. */
const MASK_SCALE = 4;
/** How far the noise bends an edge, in coverage: 0 keeps the soft square edges of the cells. */
const EDGE_NOISE = 1.5;
/** The size of the bends of an edge, in map pixels: wide bends, and small ones along them. */
const NOISE_PX = 26;
const FINE_NOISE_PX = 9;
/** Cells a side of a piece of the mask, worked out once and kept while the ground does not change. */
const CHUNK = 32;

let groundCount = 0;

/**
 * A ground texture laid over an area of the map where a coverage (0 to 1 per cell) says. The texture repeats at its own
 * size, sharp and fixed to the map; the coverage is the mask of that texture, stretched smooth, so two grounds meet in a
 * soft, uneven edge (the coverage of a point is read from the four cells around it: the neighbours decide the blend,
 * no tile of transition is needed) and nothing is blurred inside them.
 *
 * The mask is worked out once for each piece of the map (CHUNK cells a side) and kept while the ground keeps its
 * `stamp`: moving the view only copies the kept pieces into the mask of the view. Without a stamp (the water, which
 * moves), the mask of the view is worked out at each call.
 */
export class TexturedGround {
    private readonly sprite: Phaser.GameObjects.TileSprite;
    private readonly maskKey = `ground-mask-${++groundCount}`;
    private mask: Phaser.Filters.Mask | undefined;
    private visible = false;
    /** The pieces of the mask worked out for `chunksStamp`; undefined canvas: nothing of this ground there. */
    private readonly chunks = new Map<string, { kept: boolean; canvas: HTMLCanvasElement | undefined }>();
    private chunksStamp: number | undefined;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly textureKey: string,
        depth: number,
        /**
         * Soft: the coverage is the opacity itself (the thickness of grass, the depth of water), not the edge of a
         * ground made steep: a thin grass shows a little, nothing turns into patches.
         */
        private readonly soft = false,
    ) {
        this.sprite = scene.add.tileSprite(0, 0, 1, 1, textureKey).setOrigin(0).setDepth(depth).setVisible(false);
    }

    /**
     * Lays the ground over `area` (aligned on its cells), as much as `coverage(index of a cell of the area)` says;
     * covering nothing, it is hidden. `stamp` names the state of the ground: while it stays the same, the pieces of the
     * mask already worked out are kept.
     */
    public show(area: GroundArea, coverage: (index: number) => number, stamp?: number, alpha = 1): void {
        if (!this.scene.textures.exists(this.textureKey)) return this.hide();
        const canvas = this.maskCanvas(area.columns * MASK_SCALE, area.rows * MASK_SCALE);
        if (!canvas) return this.hide();
        const context = canvas.getContext();
        const any =
            stamp === undefined
                ? this.paintArea(context, area, coverage)
                : this.paintFromChunks(context, area, coverage, stamp);
        if (!any) return this.hide();
        // Smooth: the mask is stretched over the cells; its edges blend, the texture stays sharp.
        canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
        refreshCanvasTexture(canvas);
        this.sprite
            .setPosition(area.x, area.y)
            .setSize(area.columns * area.cell, area.rows * area.cell)
            // The pattern is fixed to the map: it does not slide when the area moves with the view.
            .setTilePosition(area.x, area.y)
            .setAlpha(alpha)
            .setVisible(true);
        if (!this.mask) {
            this.sprite.enableFilters();
            this.mask = this.sprite.filters?.internal.addMask(this.maskKey);
        }
        this.visible = true;
    }

    /** Shows another image of the same ground (the next image of the water), still fixed to the map. */
    public setImage(key: string): void {
        if (this.sprite.texture.key !== key && this.scene.textures.exists(key)) this.sprite.setTexture(key);
    }

    public isVisible(): boolean {
        return this.visible;
    }

    /** Tints the texture (white: as drawn): the dark of deep water. */
    public setTint(color: number): this {
        this.sprite.setTint(color);
        return this;
    }

    public setAlpha(alpha: number): void {
        this.sprite.setAlpha(alpha);
    }

    public hide(): void {
        if (!this.visible) return;
        this.visible = false;
        this.sprite.setVisible(false);
    }

    public destroy(): void {
        this.sprite.destroy();
        this.chunks.clear();
        if (this.scene.textures.exists(this.maskKey)) this.scene.textures.remove(this.maskKey);
    }

    /** The canvas of the mask of the view, made again when its size changes. */
    private maskCanvas(width: number, height: number): Phaser.Textures.CanvasTexture | undefined {
        const existing = this.scene.textures.get(this.maskKey);
        if (
            existing instanceof Phaser.Textures.CanvasTexture &&
            existing.width === width &&
            existing.height === height
        ) {
            return existing;
        }
        if (this.scene.textures.exists(this.maskKey)) this.scene.textures.remove(this.maskKey);
        const created = this.scene.textures.createCanvas(this.maskKey, width, height) ?? undefined;
        if (created) this.mask?.setTexture(this.maskKey);
        return created;
    }

    /** Works the mask of the whole area out (the water: it moves, nothing is kept). */
    private paintArea(
        context: CanvasRenderingContext2D,
        area: GroundArea,
        coverage: (index: number) => number,
    ): boolean {
        const levels = new Float32Array(area.columns * area.rows);
        let any = false;
        for (let index = 0; index < levels.length; index++) {
            levels[index] = clamp(coverage(index));
            if (levels[index] > 0) any = true;
        }
        context.clearRect(0, 0, area.columns * MASK_SCALE, area.rows * MASK_SCALE);
        if (!any) return false;
        const image = paintMask(levels, area.columns, area.rows, area.x, area.y, area.cell, 0, this.soft);
        context.putImageData(image, 0, 0);
        return true;
    }

    /** Copies the pieces of the mask over the area, working out those not kept for this stamp. */
    private paintFromChunks(
        context: CanvasRenderingContext2D,
        area: GroundArea,
        coverage: (index: number) => number,
        stamp: number,
    ): boolean {
        if (stamp !== this.chunksStamp) {
            this.chunks.clear();
            this.chunksStamp = stamp;
        }
        const firstColumn = Math.round(area.x / area.cell);
        const firstRow = Math.round(area.y / area.cell);
        context.clearRect(0, 0, area.columns * MASK_SCALE, area.rows * MASK_SCALE);
        let any = false;
        const lastChunkX = Math.floor((firstColumn + area.columns - 1) / CHUNK);
        const lastChunkY = Math.floor((firstRow + area.rows - 1) / CHUNK);
        for (let chunkY = Math.floor(firstRow / CHUNK); chunkY <= lastChunkY; chunkY++) {
            for (let chunkX = Math.floor(firstColumn / CHUNK); chunkX <= lastChunkX; chunkX++) {
                const key = `${chunkX},${chunkY}`;
                let chunk = this.chunks.get(key);
                if (!chunk?.kept) {
                    chunk = this.workChunkOut(chunkX, chunkY, area, firstColumn, firstRow, coverage);
                    this.chunks.set(key, chunk);
                }
                if (!chunk.canvas) continue;
                any = true;
                context.drawImage(
                    chunk.canvas,
                    (chunkX * CHUNK - firstColumn) * MASK_SCALE,
                    (chunkY * CHUNK - firstRow) * MASK_SCALE,
                );
            }
        }
        return any;
    }

    /**
     * One piece of the mask, from the cells of the area (and one cell around it, for its edges). Kept only when the
     * area holds all of it: a piece cut by the edge of the area is worked out again when the view reaches it.
     */
    private workChunkOut(
        chunkX: number,
        chunkY: number,
        area: GroundArea,
        firstColumn: number,
        firstRow: number,
        coverage: (index: number) => number,
    ): { kept: boolean; canvas: HTMLCanvasElement | undefined } {
        const side = CHUNK + 2;
        const left = chunkX * CHUNK - 1;
        const top = chunkY * CHUNK - 1;
        const levels = new Float32Array(side * side);
        let any = false;
        for (let row = 0; row < side; row++) {
            const areaRow = Math.max(0, Math.min(area.rows - 1, top + row - firstRow));
            for (let column = 0; column < side; column++) {
                const areaColumn = Math.max(0, Math.min(area.columns - 1, left + column - firstColumn));
                const level = clamp(coverage(areaRow * area.columns + areaColumn));
                levels[row * side + column] = level;
                if (level > 0) any = true;
            }
        }
        const kept =
            left >= firstColumn &&
            top >= firstRow &&
            left + side <= firstColumn + area.columns &&
            top + side <= firstRow + area.rows;
        if (!any) return { kept, canvas: undefined };
        const image = paintMask(levels, side, side, left * area.cell, top * area.cell, area.cell, 1, this.soft);
        const canvas = document.createElement("canvas");
        canvas.width = CHUNK * MASK_SCALE;
        canvas.height = CHUNK * MASK_SCALE;
        // The border cells only lend their level to the edges: the piece is the cells inside them.
        canvas.getContext("2d")?.putImageData(image, -MASK_SCALE, -MASK_SCALE);
        return { kept, canvas };
    }
}

/**
 * The mask of a grid of cells (MASK_SCALE pixels a side each): the level of a pixel is read from the four cells around
 * it, and where two grounds meet a little noise fixed to the map bends the edge (a shore, a patch of snow, not the
 * outline of the cells). Inside a ground nothing is bent, and the noise, the costly part, is not worked out.
 */
function paintMask(
    levels: Float32Array,
    columns: number,
    rows: number,
    x0: number,
    y0: number,
    cell: number,
    border: number,
    soft: boolean,
): ImageData {
    const width = columns * MASK_SCALE;
    const height = rows * MASK_SCALE;
    const image = new ImageData(width, height);
    const pixel = cell / MASK_SCALE;
    for (let y = border * MASK_SCALE; y < height - border * MASK_SCALE; y++) {
        for (let x = border * MASK_SCALE; x < width - border * MASK_SCALE; x++) {
            const level = edgeLevel(levels, columns, rows, (x + 0.5) / MASK_SCALE - 0.5, (y + 0.5) / MASK_SCALE - 0.5);
            if (level === 0) continue;
            let alpha = level;
            if (level < 1) {
                const noise = mapNoise(x0 + (x + 0.5) * pixel, y0 + (y + 0.5) * pixel) - 0.5;
                // The bent edge, then made steep: a clear line that keeps its bends, not a band of blur.
                const bent = clamp(level + noise * EDGE_NOISE * 4 * level * (1 - level));
                alpha = soft ? bent : steep(bent);
            }
            const at = (y * width + x) * 4;
            image.data[at] = 255;
            image.data[at + 1] = 255;
            image.data[at + 2] = 255;
            image.data[at + 3] = Math.round(alpha * 255);
        }
    }
    return image;
}

/** The coverage at a point between the cell centres (in cells), from the four cells around it. */
function edgeLevel(levels: Float32Array, columns: number, rows: number, cx: number, cy: number): number {
    const x0 = Math.max(0, Math.min(columns - 1, Math.floor(cx)));
    const y0 = Math.max(0, Math.min(rows - 1, Math.floor(cy)));
    const x1 = Math.min(columns - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const fx = clamp(cx - x0);
    const fy = clamp(cy - y0);
    const top = (levels[y0 * columns + x0] ?? 0) * (1 - fx) + (levels[y0 * columns + x1] ?? 0) * fx;
    const bottom = (levels[y1 * columns + x0] ?? 0) * (1 - fx) + (levels[y1 * columns + x1] ?? 0) * fx;
    return top * (1 - fy) + bottom * fy;
}

/** Smooth value noise of the map (0 to 1), in two sizes: the same at a place whatever the area drawn around it. */
function mapNoise(x: number, y: number): number {
    return (
        0.65 * valueNoise(x / NOISE_PX, y / NOISE_PX) + 0.35 * valueNoise(x / FINE_NOISE_PX + 17.3, y / FINE_NOISE_PX)
    );
}

function valueNoise(gx: number, gy: number): number {
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = smooth(gx - ix);
    const fy = smooth(gy - iy);
    const top = lattice(ix, iy) * (1 - fx) + lattice(ix + 1, iy) * fx;
    const bottom = lattice(ix, iy + 1) * (1 - fx) + lattice(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
}

function smooth(t: number): number {
    return t * t * (3 - 2 * t);
}

function lattice(x: number, y: number): number {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
}

/** How quickly an edge goes from bare to covered: over the middle third of the coverage. */
function steep(level: number): number {
    const t = clamp((level - 1 / 3) * 3);
    return t * t * (3 - 2 * t);
}

function clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
}
