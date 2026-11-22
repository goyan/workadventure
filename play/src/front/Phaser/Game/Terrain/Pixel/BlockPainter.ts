import type { Season } from "@workadventure/map-editor";
import { blockCellWindow } from "./BlockWindow";
import { MAX_DROP, MAX_RISE, paintColumn, shiftOfHeight } from "./ColumnPainter";
import type { ColumnSample } from "./ColumnPainter";
import {
    contourOf,
    contourShade,
    groundColor,
    groundValue,
    lightOfRise,
    seasonPatch,
    SHADOW_RISE_A_STEP,
    shadowedLight,
    shadowHorizon,
    sprinkleAt,
    TEXTURE_MASK,
    textureIndex,
    textureTable,
    textureValue,
} from "./GroundPixel";
import { outlineOf, pickMaterial } from "./MaterialBorder";
import type { Cover } from "./MaterialBorder";
import { bayer, RAMPS, rampsFor } from "./PixelPalette";
import type { Material, Ramp, Rgb } from "./PixelPalette";
import { SPRING, SUMMER, TERRAIN_CELL, TERRAIN_CHUNK, TILE_PX } from "./TerrainUnits";
import { waterColor } from "./WaterPixel";

/** Map pixels across a block: one chunk of the relief. */
export const BLOCK_PX = TERRAIN_CHUNK * TERRAIN_CELL;
/** The cells a block is drawn from (blockCellWindow). */
export const GRID_WIDTH = blockCellWindow(0, 0).width;
export const GRID_HEIGHT = blockCellWindow(0, 0).height;
/**
 * The ground of a block seen from above, at its sharpest (a point a pixel of the map; coarser, fewer points): 1 point
 * more all around than the block, MAX_DROP px north and MAX_RISE south of it, and one row more each way for the deepest
 * face and the highest top.
 */
const POINT_COLUMNS = BLOCK_PX + 2;
const POINT_ROWS = MAX_DROP + BLOCK_PX + MAX_RISE + 4;
const MATERIALS: readonly Material[] = [
    "grass",
    "earth",
    "meadow",
    "clay",
    "sand",
    "rock",
    "gravel",
    "straw",
    "ash",
    "ember",
    "snow",
    "mud",
];
/** What covers a point, as stored: the materials, then "none" (transparent). */
export const COVERS: readonly Cover[] = [...MATERIALS, "none"];
export const COVER_INDEX = Object.fromEntries(COVERS.map((cover, index) => [cover, index])) as Record<Cover, number>;
const NONE_INDEX = COVER_INDEX.none;
/**
 * The tiles (TILE_PX) whose dense grass a block is told of: from 1 tile west of the block to 1 east of it, from 5
 * tiles north of it (its rows north) to 5 south of it.
 */
export const DENSE_COLUMNS = 10;
export const DENSE_ROWS = 18;
const DENSE_WEST = 1;
const DENSE_NORTH = 5;
const TILES_A_BLOCK = BLOCK_PX / TILE_PX;
/** The thresholds of the dither (bayer), row by row. */
const BAYER_ROWS = [0, 1, 2, 3].map((row) => [0, 1, 2, 3].map((column) => bayer(column, row)));
/** The rock of the faces of the drops, a little of the material of their rim mixed in. */
const WALL_SOIL_SHARE = 0.3;
const WALL_RAMPS = Object.fromEntries(
    MATERIALS.map((material) => [
        material,
        RAMPS.wall.map((shade, index) =>
            shade.map((channel, at) =>
                Math.round(channel * (1 - WALL_SOIL_SHARE) + RAMPS[material][index][at] * WALL_SOIL_SHARE),
            ),
        ) as unknown as Ramp,
    ]),
) as Record<Material, Ramp>;
/** The shades of the face of a drop, by what covers its rim (as stored: COVERS). */
const WALL_RAMP_OF: readonly Ramp[] = COVERS.map((cover) => (cover === "none" ? RAMPS.wall : WALL_RAMPS[cover]));
/** Water thinner than this is not drawn (as on the flat drawing). */
const WATER_SEEN_PX = 0.5;
/** The water is drawn, and its blocks drawn again, by steps of this many pixels of depth. */
export const WATER_STEP_PX = 2;

/**
 * What a block of the terrain is painted from, as plain data: read from the game once (ReliefTiles), painted here or in
 * a worker (BlockPaintWorker).
 */
export interface BlockJob {
    id: number;
    blockX: number;
    blockY: number;
    /** Pixels of the map for a point drawn (texelFor): 1 sharp, 2 or 4 coarser. */
    texel: 1 | 2 | 4;
    /** In 3/4 (the game), or flat (the map editor). */
    projected: boolean;
    /** While the relief is edited: the water lets the bottom show. */
    seeThrough: boolean;
    /** With the layout of the map: the flat ground is drawn too; without, it is left to the tiles of the map. */
    withLayout: boolean;
    season: Season | undefined;
    /** The heights of the cells of the window of the block (blockCellWindow), row by row. */
    heights: Float32Array;
    /** The levels of the water over them (px), absent where the window is dry. */
    waters: Uint8Array | undefined;
    /** What covers each of them (COVER_INDEX of cellMaterial). */
    covers: Uint8Array;
    /**
     * 1 where the grass of a tile is dense (the flowers of the season grow there): DENSE_COLUMNS × DENSE_ROWS tiles,
     * from the tile (blockX × 8 − 1, blockY × 8 − 5). Absent out of spring and summer.
     */
    dense: Uint8Array | undefined;
}

/** What the passes of a block go over (BlockPainter.begin). */
export interface BlockShape {
    /** Points across and down the block drawn. */
    size: number;
    /** The rows of the ground seen from above to work out (groundRows, horizonRows). */
    firstRow: number;
    endRow: number;
    /** The rows to colour (colorRows). */
    colorsFirst: number;
    colorsEnd: number;
    /** Whether the window has a relief: its shadows are worked out (horizonRows). */
    shaded: boolean;
}

/**
 * Paints the blocks of the terrain, one at a time, from plain data: the ground seen from above (heights, water,
 * materials), its colours, then its projection in 3/4. Its buffers are kept from a block to the next; nothing else is.
 * Pass by pass and slice by slice (the game spreads a block over several images), or at once (`paint`, in a worker).
 */
export class BlockPainter {
    private readonly pointHeights = new Float32Array(POINT_COLUMNS * POINT_ROWS);
    private readonly pointMaterials = new Uint8Array(POINT_COLUMNS * POINT_ROWS);
    /** The water of each point (as the blocks draw it), to find its edge: a point of water next to a dry one. */
    private readonly pointWaters = new Float32Array(POINT_COLUMNS * POINT_ROWS);
    /** The horizon of each point towards the north-west (shadowHorizon), for the shadows of the relief. */
    private readonly pointHorizons = new Float32Array(POINT_COLUMNS * POINT_ROWS);
    /** Undefined where nothing covers the ground (transparent). */
    private readonly pointColors: (Rgb | undefined)[] = new Array<Rgb | undefined>(POINT_COLUMNS * POINT_ROWS).fill(
        undefined,
    );
    /** One sample a point of a column, from MAX_DROP north of the block to MAX_RISE south of it. */
    private readonly samples: ColumnSample[] = Array.from({ length: MAX_DROP + BLOCK_PX + MAX_RISE + 4 }, () => ({
        groundY: 0,
        drop: 0,
        color: RAMPS.grass[0],
        wallRamp: RAMPS.wall,
        flankRamp: RAMPS.grass,
        plain: true,
    }));
    private readonly own = new Uint8ClampedArray(BLOCK_PX * BLOCK_PX * 4);
    /** The pixels of the block being painted (RGBA): its own buffer, or the one it was given. */
    private out: Uint8ClampedArray = this.own;

    // The block being painted.
    private job: BlockJob | undefined;
    private left = 0;
    private top = 0;
    private texel = 1;
    private size = BLOCK_PX;
    private columns = POINT_COLUMNS;
    private gridX = 0;
    private gridY = 0;
    private originX = 0;
    private originY = 0;
    private firstRow = 0;
    private sampleFirst = 0;
    private sampleEnd = 0;
    private shaded = false;
    private flowers = false;
    private ramps = RAMPS;
    /** The shades of the flank of a mount, by what covers it (as stored: COVERS). */
    private flankRamps: readonly Ramp[] = [];
    /** The textures of the materials met in this block only (a table is 1 MB). */
    private textures: (Float32Array | undefined)[] = [];

    /**
     * Takes a block up: the rows of its ground that can be drawn in it (a point is drawn lower in a hollow, higher on
     * a mount, or the surface of its water), and what its passes share. `target`: where its pixels go, instead of the
     * buffer of the painter.
     */
    public begin(job: BlockJob, target?: Uint8ClampedArray): BlockShape {
        const { texel, heights, waters, projected } = job;
        this.job = job;
        this.left = job.blockX * BLOCK_PX;
        this.top = job.blockY * BLOCK_PX;
        this.texel = texel;
        const window = blockCellWindow(job.blockX, job.blockY);
        this.gridX = window.x;
        this.gridY = window.y;
        // One more row each way, for the face of a drop that comes from the row before or goes on past the block.
        let lowest = 0;
        let highest = Number.NEGATIVE_INFINITY;
        let highestSurface = 0;
        for (let index = 0; index < GRID_WIDTH * GRID_HEIGHT; index++) {
            const value = heights[index];
            if (value < lowest) lowest = value;
            if (value > highest) highest = value;
            const surface = value + (waters ? waters[index] : 0);
            if (surface > highestSurface) highestSurface = surface;
        }
        // Flat in the map editor: nothing is drawn lower nor higher.
        const shiftOf = (ground: number): number => (projected ? shiftOfHeight(ground) : 0);
        const mostDrop = Math.max(0, shiftOf(lowest));
        const mostRise = Math.max(0, -shiftOf(highestSurface));
        // No least drop under water, whose surface is drawn higher.
        const leastDrop = waters ? 0 : Math.max(0, shiftOf(highest));
        const firstY = this.top - Math.ceil(mostDrop) - 1;
        const endY =
            mostRise > 0
                ? this.top + BLOCK_PX + Math.ceil(mostRise) + 1
                : Math.min(this.top + BLOCK_PX, this.top + BLOCK_PX - Math.floor(leastDrop) + 1);
        // The ground seen from above, a point every `texel` px: 1 point more all around than what is drawn (so a border
        // on the edge of a block gets its line on both blocks), from MAX_DROP px north of the block (and one row more,
        // for the neighbours of the first row drawn).
        this.size = BLOCK_PX / texel;
        this.columns = this.size + 2;
        const rows = (MAX_DROP + BLOCK_PX + MAX_RISE) / texel + 4;
        this.originX = this.left - texel;
        this.originY = this.top - MAX_DROP - 2 * texel;
        const first = Math.floor((firstY - this.originY) / texel);
        const end = Math.ceil((endY - this.originY) / texel);
        this.firstRow = Math.max(0, first - 1);
        const endRow = Math.min(rows, end + 1);
        this.sampleFirst = Math.max(1, first);
        this.sampleEnd = Math.min(rows - 1, end);
        // The shadows of the relief: only where the window has one (a flat window casts none).
        this.shaded = highest > lowest;
        this.flowers = job.dense !== undefined && (job.season === SPRING || job.season === SUMMER);
        const ramps = rampsFor(job.season);
        this.ramps = ramps;
        // The flank of a mount: its own ground in the shade (grass where nothing covers it).
        this.flankRamps = COVERS.map((cover) => (cover === "none" ? ramps.grass : ramps[cover]));
        this.textures = [];
        this.out = target ?? this.own;
        this.out.fill(0, 0, this.size * this.size * 4);
        return {
            size: this.size,
            firstRow: this.firstRow,
            endRow,
            colorsFirst: Math.max(1, this.firstRow + 1),
            colorsEnd: Math.min(rows - 1, endRow - 1),
            shaded: this.shaded,
        };
    }

    /** The pixels of the block (RGBA, `size` × `size`): a view valid until the next block is taken up. */
    public pixels(): Uint8ClampedArray {
        return this.out.subarray(0, this.size * this.size * 4);
    }

    /**
     * Paints a block at once. Into `into` when it is given and large enough (a buffer handed back by the game: nothing
     * is allocated), into a new buffer else.
     */
    public paint(job: BlockJob, into?: ArrayBuffer): Uint8ClampedArray {
        const size = BLOCK_PX / job.texel;
        const bytes = size * size * 4;
        const target = new Uint8ClampedArray(into && into.byteLength >= bytes ? into : new ArrayBuffer(bytes));
        const shape = this.begin(job, target);
        this.groundRows(shape.firstRow, shape.endRow);
        if (shape.shaded) this.horizonRows(shape.firstRow, shape.endRow);
        this.colorRows(shape.colorsFirst, shape.colorsEnd);
        this.projectColumns(0, shape.size);
        const painted = this.pixels();
        // The buffer given is not kept: the next block painted slice by slice goes to the buffer of the painter.
        this.out = this.own;
        return painted;
    }

    /** The value of the cell values (heights, water) at a point, between the centres of the cells of the window. */
    private bilinear(values: ArrayLike<number>, x: number, y: number): number {
        const fx = Math.min(GRID_WIDTH - 1.001, Math.max(0, x / TERRAIN_CELL - 0.5 - this.gridX));
        const fy = Math.min(GRID_HEIGHT - 1.001, Math.max(0, y / TERRAIN_CELL - 0.5 - this.gridY));
        const cx = Math.floor(fx);
        const cy = Math.floor(fy);
        const tx = fx - cx;
        const ty = fy - cy;
        const index = cy * GRID_WIDTH + cx;
        const upper = values[index] * (1 - tx) + values[index + 1] * tx;
        const lower = values[index + GRID_WIDTH] * (1 - tx) + values[index + GRID_WIDTH + 1] * tx;
        return upper * (1 - ty) + lower * ty;
    }

    /** 1. The ground seen from above: the heights, the water and the materials of the points of the rows given. */
    public groundRows(fromRow: number, toRow: number): void {
        const job = this.job;
        if (!job) return;
        const { originX, originY, gridX, gridY, texel, columns } = this;
        const heights = this.pointHeights;
        const waters = this.pointWaters;
        const materials = this.pointMaterials;
        const cellHeights = job.heights;
        const cellWaters = job.waters;
        const covers = job.covers;
        // What covers a cell of the window (the cells beyond it as its edge).
        const cell = (cellX: number, cellY: number): Cover => {
            const column = Math.min(GRID_WIDTH - 1, Math.max(0, cellX - gridX));
            const row = Math.min(GRID_HEIGHT - 1, Math.max(0, cellY - gridY));
            return COVERS[covers[row * GRID_WIDTH + column]];
        };
        for (let row = fromRow; row < toRow; row++) {
            // The middle of the point.
            const y = originY + (row + 0.5) * texel;
            // The heights between the centres of the cells, worked out along the row (the bilinear of `bilinear`).
            const fy = Math.min(GRID_HEIGHT - 1.001, Math.max(0, y / TERRAIN_CELL - 0.5 - gridY));
            const heightRow = Math.floor(fy);
            const ty = fy - heightRow;
            // The four cells around the points of this row, between their centres: one material all around is the
            // material of every point there, only a border needs pickMaterial.
            const cellY = Math.floor(y / TERRAIN_CELL - 0.5);
            let region = Number.NaN;
            let uniform = -1;
            for (let column = 0; column < columns; column++) {
                const x = originX + (column + 0.5) * texel;
                const index = row * columns + column;
                const fx = Math.min(GRID_WIDTH - 1.001, Math.max(0, x / TERRAIN_CELL - 0.5 - gridX));
                const heightColumn = Math.floor(fx);
                const tx = fx - heightColumn;
                const at = heightRow * GRID_WIDTH + heightColumn;
                const below = at + GRID_WIDTH;
                heights[index] =
                    (cellHeights[at] * (1 - tx) + cellHeights[at + 1] * tx) * (1 - ty) +
                    (cellHeights[below] * (1 - tx) + cellHeights[below + 1] * tx) * ty;
                if (cellWaters) {
                    waters[index] =
                        (cellWaters[at] * (1 - tx) + cellWaters[at + 1] * tx) * (1 - ty) +
                        (cellWaters[below] * (1 - tx) + cellWaters[below + 1] * tx) * ty;
                }
                const cellX = Math.floor(x / TERRAIN_CELL - 0.5);
                if (cellX !== region) {
                    region = cellX;
                    const material = cell(cellX, cellY);
                    uniform =
                        material === cell(cellX + 1, cellY) &&
                        material === cell(cellX, cellY + 1) &&
                        material === cell(cellX + 1, cellY + 1)
                            ? COVER_INDEX[material]
                            : -1;
                }
                materials[index] = uniform >= 0 ? uniform : COVER_INDEX[pickMaterial(cell, x, y)];
            }
        }
    }

    /**
     * The horizons of the shadows of the rows given: that of a point is that of its north-west neighbour, one step
     * lower, or the ground of that neighbour; worked out along the diagonals, the ray followed only from the first points
     * of each (the first row, the first column).
     */
    public horizonRows(fromRow: number, toRow: number): void {
        const job = this.job;
        if (!job) return;
        const { originX, originY, firstRow, texel, columns } = this;
        const heights = this.pointHeights;
        const horizons = this.pointHorizons;
        const step = SHADOW_RISE_A_STEP * texel;
        const heightOf = (pointX: number, pointY: number): number => this.bilinear(job.heights, pointX, pointY);
        for (let row = fromRow; row < toRow; row++) {
            const y = originY + (row + 0.5) * texel;
            for (let column = 0; column < columns; column++) {
                const index = row * columns + column;
                if (row === firstRow || column === 0) {
                    horizons[index] = shadowHorizon(heightOf, originX + (column + 0.5) * texel, y, texel);
                } else {
                    const corner = index - columns - 1;
                    horizons[index] = Math.max(heights[corner], horizons[corner]) - step;
                }
            }
        }
    }

    /** 2. The colours of the rows given: texture, light of the slope, shadow, depth, level lines, borders. */
    public colorRows(fromRow: number, toRow: number): void {
        const job = this.job;
        if (!job) return;
        const { originX, originY, shaded, flowers, ramps, textures, texel, columns } = this;
        const season = job.season;
        const denseTiles = job.dense;
        const denseX = job.blockX * TILES_A_BLOCK - DENSE_WEST;
        const denseY = job.blockY * TILES_A_BLOCK - DENSE_NORTH;
        const heights = this.pointHeights;
        const horizons = this.pointHorizons;
        const materials = this.pointMaterials;
        const colors = this.pointColors;
        for (let row = fromRow; row < toRow; row++) {
            const y = originY + row * texel;
            const textureRow = textureIndex(0, y);
            // The dither goes by points drawn, not by pixels of the map: coarse, it stays a dither.
            const bayerRow = BAYER_ROWS[(y / texel) & 3];
            const denseRow = (Math.floor(y / TILE_PX) - denseY) * DENSE_COLUMNS - denseX;
            for (let column = 1; column < columns - 1; column++) {
                const index = row * columns + column;
                const here = materials[index];
                // Nothing covers it: transparent, the tiles of the map show.
                if (here === NONE_INDEX) {
                    colors[index] = undefined;
                    continue;
                }
                const material = COVERS[here] as Material;
                const west = materials[index - 1];
                const east = materials[index + 1];
                const north = materials[index - columns];
                const south = materials[index + columns];
                // Inside a material (most of the ground): no line to look for.
                const outline =
                    west === here && east === here && north === here && south === here
                        ? undefined
                        : (outlineOf(material, COVERS[west]) ??
                          outlineOf(material, COVERS[east]) ??
                          outlineOf(material, COVERS[north]) ??
                          outlineOf(material, COVERS[south]));
                // The rise of the ground for a pixel of the map, east and south.
                const rise =
                    (heights[index + 1] - heights[index - 1] + heights[index + columns] - heights[index - columns]) /
                    texel;
                const x = originX + column * texel;
                // In the shadow of a mount (or of the north-west rim of a hollow): darker.
                const light =
                    shaded && horizons[index] > heights[index] ? shadowedLight(lightOfRise(rise)) : lightOfRise(rise);
                const contour = contourOf(
                    heights[index],
                    heights[index - 1],
                    heights[index + 1],
                    heights[index - columns],
                    heights[index + columns],
                );
                // Dense grass of the meadow: where the flowers of the season grow.
                const dense =
                    flowers &&
                    material === "grass" &&
                    denseTiles !== undefined &&
                    denseTiles[denseRow + Math.floor(x / TILE_PX)] === 1;
                const sown = outline === undefined ? sprinkleAt(material, season, dense, x, y) : undefined;
                if (sown) {
                    colors[index] = sown;
                } else if (outline === undefined && material !== "ember" && material !== "mud") {
                    // The common case of groundColor, without its calls: texture, light, depth, then the dither.
                    const value =
                        groundValue(
                            textureValue(
                                material,
                                (textures[here] ??= textureTable(material)),
                                textureRow + (x & TEXTURE_MASK),
                                x,
                                y,
                            ),
                            light,
                            heights[index],
                        ) - contourShade(contour);
                    const shade = Math.round(value * 3 + bayerRow[(x / texel) & 3] - 0.5);
                    const ramp = seasonPatch(material, season, x, y) ?? ramps[material];
                    colors[index] = ramp[shade < 0 ? 0 : shade > 3 ? 3 : shade];
                } else {
                    colors[index] = groundColor(
                        material,
                        x / texel,
                        y / texel,
                        light,
                        heights[index],
                        outline,
                        contour,
                        season,
                        dense,
                    );
                }
            }
        }
    }

    /** 3. The columns given, projected in 3/4, from MAX_DROP px north of the block to MAX_RISE south of it. */
    public projectColumns(fromColumn: number, toColumn: number): void {
        const job = this.job;
        if (!job) return;
        const { left, top, originY, flankRamps, texel, columns, size, sampleFirst, sampleEnd } = this;
        const { projected, season, seeThrough, withLayout } = job;
        const wet = job.waters !== undefined;
        const heights = this.pointHeights;
        const waters = this.pointWaters;
        const materials = this.pointMaterials;
        const colors = this.pointColors;
        const samples = this.samples;
        // Rows drawn and drops are counted in points drawn (paintColumn).
        const firstGround = originY / texel;
        for (let column = fromColumn; column < toColumn; column++) {
            const pointX = left / texel + column;
            let count = 0;
            for (let row = sampleFirst; row < sampleEnd; row++) {
                const index = row * columns + column + 1;
                const ground = heights[index];
                const water = wet ? waters[index] : 0;
                const sample = samples[count++];
                const here = materials[index];
                sample.groundY = firstGround + row;
                sample.wallRamp = WALL_RAMP_OF[here];
                sample.flankRamp = flankRamps[here];
                if (water >= WATER_SEEN_PX) {
                    // The water as its signature knows it (WATER_STEP_PX): a block is drawn again only when it shows.
                    const depth = Math.max(WATER_SEEN_PX, Math.floor(water / WATER_STEP_PX) * WATER_STEP_PX);
                    sample.drop = (projected ? shiftOfHeight(ground + depth) : 0) / texel;
                    const edge =
                        waters[index - 1] < WATER_SEEN_PX ||
                        waters[index + 1] < WATER_SEEN_PX ||
                        waters[index - columns] < WATER_SEEN_PX ||
                        waters[index + columns] < WATER_SEEN_PX;
                    sample.color = waterColor(
                        depth,
                        pointX,
                        firstGround + row,
                        season,
                        colors[index],
                        seeThrough,
                        edge,
                    );
                    sample.plain = false;
                } else {
                    sample.drop = (projected ? shiftOfHeight(ground) : 0) / texel;
                    sample.color = colors[index];
                    // Left to the map (unless it hides what is drawn behind it): what nothing covers; without the layout
                    // of the map (the 3/4 relief only), the flat ground.
                    sample.plain = withLayout ? here === NONE_INDEX : Math.abs(ground) < 0.5;
                }
            }
            paintColumn(samples, count, size, top / texel, this.out, size, column, texel);
        }
    }
}
