import * as Phaser from "phaser";
import { heightAt, TERRAIN_CELL, TERRAIN_CHUNK, TILE_PX } from "@workadventure/map-editor";
import type { Season, TerrainData } from "@workadventure/map-editor";
import { refreshCanvasTexture } from "../CanvasTextureRefresh";
import type { MeadowState } from "./MeadowState";
import {
    contourShade,
    groundColor,
    groundValue,
    shadowHorizon,
    SHADOW_RISE_A_STEP,
    isContour,
    lightOfRise,
    shadowedLight,
    seasonPatch,
    sprinkleAt,
    textureIndex,
    textureTable,
    textureValue,
    TEXTURE_MASK,
} from "./Pixel/GroundPixel";
import { cellMaterial, outlineOf, pickMaterial } from "./Pixel/MaterialField";
import type { CellInputs, Cover } from "./Pixel/MaterialField";
import { bayer, RAMPS, rampsFor } from "./Pixel/PixelPalette";
import type { Material, Ramp, Rgb as PaletteRgb } from "./Pixel/PixelPalette";
import { groundPointAt, MAX_DROP, MAX_RISE, paintColumn, RELIEF_TEXEL, shiftOfHeight } from "./ReliefProjection";
import type { ColumnSample } from "./ReliefProjection";
import { blockCellWindow, ReliefTileSchedule, reliefSignature } from "./ReliefTileSchedule";
import { waterColor } from "./Pixel/WaterPixel";
import type { TerrainWater } from "./TerrainWater";

/** The ground outdoors: under the foam and the life of the water (0.66), the objects and the avatars. */
export const RELIEF_TILES_DEPTH = 0.655;
/** Map pixels across a block: one chunk of the relief. */
const BLOCK_PX = TERRAIN_CHUNK * TERRAIN_CELL;
const BLOCK_TEXELS = BLOCK_PX / RELIEF_TEXEL;
/** The ground of a block seen from above: 1 px more all around than the block, MAX_DROP px north and MAX_RISE south. */
const POINT_COLUMNS = BLOCK_PX + 2;
const POINT_ROWS = MAX_DROP + BLOCK_PX + MAX_RISE + 2;
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
const UNKNOWN_MATERIAL = 255;
/** The most blocks whose covers are read in one image. */
const COVERS_AN_IMAGE = 8;
/** What covers a point, as stored: the materials, then "none" (transparent). */
const COVERS: readonly Cover[] = [...MATERIALS, "none"];
const COVER_INDEX = Object.fromEntries(COVERS.map((cover, index) => [cover, index])) as Record<Cover, number>;
const NONE_INDEX = COVER_INDEX.none;
/** From this much grass of the meadow (0 to 255), the grass is dense: the flowers of the season grow there. */
const DENSE_GRASS = 160;
/** The time an image spends drawing a block (ms): the rest of the block waits for the next image. */
const DRAW_BUDGET_MS = 6;
/** The rows (or columns) of a block drawn between two looks at the time. */
const ROWS_A_STEP = 16;
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
/** The cells a block is drawn from (blockCellWindow). */
const GRID_WIDTH = blockCellWindow(0, 0).width;
const GRID_HEIGHT = blockCellWindow(0, 0).height;
/** Water thinner than this is not drawn (as on the flat drawing). */
const WATER_SEEN_PX = 0.5;
/** The water is drawn, and its blocks drawn again, by steps of this many pixels of depth. */
const WATER_STEP_PX = 2;

export interface ReliefInputs {
    relief(): TerrainData | undefined;
    water: TerrainWater;
    meadow?: MeadowState;
    season(): Season | undefined;
    /** How much of the ground is under the snow of the season (0 to 1). */
    snowShown(): number;
    /** The season of the calendar, for the snow line of the heights (the same for everyone, as the walk). */
    snowLineSeason?(): Season | undefined;
    /** The layout of the map, to draw the flat ground too: absent, only the dug ground and its water are drawn. */
    layout?: GroundLayout;
}

/** What the flat ground needs to know of the map: its rooms, the floors of the Carte tool, its grass tiles. */
export interface GroundLayout {
    outdoor(cellX: number, cellY: number): boolean;
    paved(cellX: number, cellY: number): boolean;
    mapGrass(cellX: number, cellY: number): boolean;
    /** Changes whenever one of them does. */
    version(): number;
}

interface Block {
    texture: Phaser.Textures.CanvasTexture;
    image: Phaser.GameObjects.Image;
    /** Whether it was last drawn in 3/4: hidden while the relief is shown the other way, until it is drawn again. */
    projected: boolean;
}

/**
 * The relief seen in 3/4 (ReliefProjection), drawn as one image a block of the relief: the dug ground lower by half
 * its depth, the faces of the drops, the water at its surface. A block is drawn again only when what it is drawn
 * from changes (ReliefTileSchedule), never because the view scrolls or zooms.
 */
export class ReliefTiles {
    private readonly blocks = new Map<string, Block>();
    private readonly schedule = new ReliefTileSchedule();
    private hidden = false;
    /** In 3/4 (the game), or flat (the map editor, to dig and place where one aims). */
    private projected = true;
    /** While the relief is edited: the water fainter, so what is dug under it shows. */
    private seeThrough = false;
    private reliefKept: TerrainData | undefined;
    private readonly reliefSignatures = new Map<string, string>();
    private waterKey = "";
    private coverKey = "";
    private coverReadCount = 0;
    /** The blocks whose covers are to be read again (their old signature kept meanwhile). */
    private readonly staleCovers = new Set<string>();
    /** The block being drawn, a step an image. */
    private job: { key: string; steps: Generator<void, void, void> } | undefined;
    private readonly coverSignatures = new Map<string, string>();
    private readonly waterSignatures = new Map<string, string>();
    private readonly heights = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
    private readonly gridWater = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    private readonly cellMaterials = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    /** The ground of a block seen from above, a pixel a pixel of the map: reused, nothing allocated. */
    private readonly pointHeights = new Float32Array(POINT_COLUMNS * POINT_ROWS);
    private readonly pointMaterials = new Uint8Array(POINT_COLUMNS * POINT_ROWS);
    private readonly pointWaters = new Float32Array(POINT_COLUMNS * POINT_ROWS);
    /** The horizon of each point towards the north-west (shadowHorizon), for the shadows of the relief. */
    private readonly pointHorizons = new Float32Array(POINT_COLUMNS * POINT_ROWS);
    /** Undefined where nothing covers the ground (transparent). */
    private readonly pointColors: (PaletteRgb | undefined)[] = new Array<PaletteRgb | undefined>(
        POINT_COLUMNS * POINT_ROWS,
    ).fill(undefined);
    /** One sample a texel of a column, from MAX_DROP north of the block to MAX_RISE south of it: reused, nothing allocated. */
    private readonly samples: ColumnSample[] = Array.from(
        { length: (MAX_DROP + BLOCK_PX + MAX_RISE) / RELIEF_TEXEL + 1 },
        () => ({
            groundY: 0,
            drop: 0,
            color: RAMPS.grass[0],
            wallRamp: RAMPS.wall,
            flankRamp: RAMPS.grass,
            plain: true,
        }),
    );
    private readonly levels = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly inputs: ReliefInputs,
    ) {}

    /** What covers the ground at a point of the map (map pixels), as the blocks draw it: for the footprints. */
    public coverAt(x: number, y: number, now: number): Cover {
        const cellX = Math.floor(x / TERRAIN_CELL);
        const cellY = Math.floor(y / TERRAIN_CELL);
        return cellMaterial(this.cellInputs(this.inputs.relief(), now), cellX, cellY);
    }

    /** How many times what covers the cells of a block was read: spread over images after a message of the meadow. */
    public coverReads(): number {
        return this.coverReadCount;
    }

    /** Whether a block is being drawn, a step an image (its drawing not shown yet). */
    public isDrawing(): boolean {
        return this.job !== undefined || this.staleCovers.size > 0;
    }

    /** What covers the cells changed somewhere (meadow, layout, snow, relief): every block is read again, in turn. */
    private markCoversStale(): void {
        for (const key of this.coverSignatures.keys()) this.staleCovers.add(key);
    }

    /** Blocks drawn so far: none while the view only scrolls or zooms. */
    public redraws(): number {
        return this.schedule.redraws;
    }

    /** Whether the relief is drawn in 3/4 now (a map with relief, the editor closed). */
    public isActive(): boolean {
        return !this.hidden && this.projected && this.inputs.relief() !== undefined;
    }

    /**
     * In 3/4 in the game, flat while the map is edited (drawn at its place, its water fainter so that what is dug
     * under it shows): every block is drawn again in the other way.
     */
    public setSeeThrough(seeThrough: boolean): void {
        if (seeThrough === this.seeThrough) return;
        this.seeThrough = seeThrough;
        this.schedule.forget();
        this.scene.markDirty();
    }

    public setProjected(projected: boolean): void {
        if (projected === this.projected) return;
        this.projected = projected;
        // A block drawn the other way would not match the clicks nor the avatars: hidden until it is drawn again.
        for (const block of this.blocks.values()) block.image.setVisible(!this.hidden && block.projected === projected);
        this.schedule.forget();
        this.scene.markDirty();
    }

    /** The point of the ground drawn under a point of the map on the screen (groundPointAt); itself when flat. */
    public groundPointAt(point: { x: number; y: number }): { x: number; y: number } {
        return this.isActive()
            ? groundPointAt(this.inputs.relief(), point, (x, y) => this.inputs.water.isBridgeAt(x, y))
            : { x: point.x, y: point.y };
    }

    public setHidden(hidden: boolean): void {
        if (hidden === this.hidden) return;
        this.hidden = hidden;
        for (const block of this.blocks.values()) block.image.setVisible(!hidden && block.projected === this.projected);
        // What changed while it was hidden is drawn again when it shows.
        if (!hidden) this.schedule.forget();
        this.scene.markDirty();
    }

    public update(now: number): void {
        const terrain = this.inputs.relief();
        const layout = this.inputs.layout;
        if (this.hidden || (!terrain && !layout)) return;
        if (terrain !== this.reliefKept) {
            this.reliefKept = terrain;
            this.reliefSignatures.clear();
            // The soils painted are read by what covers the cells too.
            this.markCoversStale();
        }
        const view = this.scene.cameras.main.worldView;
        const visible = this.blocksOver(view.x, view.y, view.width, view.height);
        const around = this.blocksOver(
            view.x - BLOCK_PX,
            view.y - BLOCK_PX,
            view.width + 2 * BLOCK_PX,
            view.height + 2 * BLOCK_PX,
        );
        const waterKey = this.inputs.water.drawKey(now);
        if (waterKey !== this.waterKey) {
            this.waterKey = waterKey;
            this.waterSignatures.clear();
        }
        // The meadow is told again every 10 s (2 s during a fire): a block is drawn again only when what covers one of
        // its cells changes, not at each message.
        const snow = Math.round(this.inputs.snowShown() * 10) / 10;
        const coverKey = `${this.inputs.meadow?.version() ?? 0}|${layout?.version() ?? 0}|${snow}|${
            this.inputs.snowLineSeason?.() ?? ""
        }`;
        if (coverKey !== this.coverKey) {
            this.coverKey = coverKey;
            this.markCoversStale();
        }
        // What covers the cells is read again COVERS_AN_IMAGE blocks an image at most, the visible ones first: a
        // message of the meadow (every 10 s) would else read the whole view in one image. Until then a block keeps
        // the signature it had.
        // Blocks gone out of the view are forgotten (read again when they come back).
        const aroundKeys = new Set(around);
        for (const key of this.staleCovers) {
            if (aroundKeys.has(key)) continue;
            this.staleCovers.delete(key);
            this.coverSignatures.delete(key);
        }
        let reads = 0;
        const visibleKeys = new Set(visible);
        for (const key of [...visible, ...around.filter((key) => !visibleKeys.has(key))]) {
            if (reads >= COVERS_AN_IMAGE) break;
            if (this.coverSignatures.has(key) && !this.staleCovers.has(key)) continue;
            this.coverSignatures.set(key, this.coverSignature(key, terrain, now));
            this.staleCovers.delete(key);
            reads++;
        }
        const shared = `${this.inputs.season() ?? ""}|${snow}|${this.projected ? "3/4" : "flat"}|${this.seeThrough}`;
        const signatures = new Map<string, string>();
        for (const key of around) {
            let relief = this.reliefSignatures.get(key);
            if (relief === undefined) {
                const [blockX, blockY] = key.split(",").map(Number);
                relief = reliefSignature(terrain, blockX, blockY);
                this.reliefSignatures.set(key, relief);
            }
            let water = this.waterSignatures.get(key);
            if (water === undefined) {
                water = this.waterSignature(key, now);
                this.waterSignatures.set(key, water);
            }
            // Without the layout of the map, only the dug ground and its water are drawn.
            if (!layout && relief === "" && water === "") {
                signatures.set(key, "");
                continue;
            }
            const cover = this.coverSignatures.get(key);
            // Not read yet (its turn comes in a next image): not drawn yet.
            if (cover === undefined) {
                signatures.set(key, "");
                continue;
            }
            // With it: nothing to draw where nothing covers the ground, nothing is dug and no water lies.
            signatures.set(
                key,
                relief === "" && water === "" && cover === "" ? "" : `${relief}|${water}|${cover}|${shared}`,
            );
        }
        // One block drawn at a time, spread over images: DRAW_BUDGET_MS of it an image.
        if (!this.job) {
            for (const key of this.schedule.toRedraw(around, signatures, undefined, new Set(visible))) {
                if (signatures.get(key) === "") this.drop(key);
                else this.job = { key, steps: this.drawSteps(key, terrain, now) };
            }
        }
        if (this.job) {
            const start = performance.now();
            while (performance.now() - start < DRAW_BUDGET_MS) {
                if (this.job.steps.next().done) {
                    this.job = undefined;
                    break;
                }
            }
        }
        for (const key of this.schedule.evict(new Set(around))) this.drop(key);
    }

    public destroy(): void {
        for (const key of [...this.blocks.keys()]) this.drop(key);
    }

    private blocksOver(x: number, y: number, width: number, height: number): string[] {
        const keys: string[] = [];
        for (let blockY = Math.floor(y / BLOCK_PX); blockY <= Math.floor((y + height) / BLOCK_PX); blockY++) {
            for (let blockX = Math.floor(x / BLOCK_PX); blockX <= Math.floor((x + width) / BLOCK_PX); blockX++) {
                keys.push(`${blockX},${blockY}`);
            }
        }
        return keys;
    }

    /**
     * What covers the cells a block is drawn from (cellMaterial: meadow, snow, soil, the layout of the map), as a short
     * text; empty when nothing does (only with the layout of the map: without it, bare ground is grass).
     */
    private coverSignature(key: string, terrain: TerrainData | undefined, now: number): string {
        this.coverReadCount++;
        const [blockX, blockY] = key.split(",").map(Number);
        const { x: gridX, y: gridY } = blockCellWindow(blockX, blockY);
        const inputs = this.cellInputs(terrain, now);
        let hash = 0;
        let covered = false;
        for (let row = 0; row < GRID_HEIGHT; row++) {
            for (let column = 0; column < GRID_WIDTH; column++) {
                const cover = cellMaterial(inputs, gridX + column, gridY + row);
                if (cover !== "none") covered = true;
                hash = (Math.imul(hash, 31) + COVER_INDEX[cover]) | 0;
            }
        }
        return covered ? hash.toString(36) : "";
    }

    /** What the material of a cell is read from (cellMaterial). */
    private cellInputs(terrain: TerrainData | undefined, now: number): CellInputs {
        const meadow = this.inputs.meadow;
        const layout = this.inputs.layout;
        return {
            terrain,
            meadow,
            snowShown: this.inputs.snowShown(),
            outdoor: layout && ((cellX, cellY) => layout.outdoor(cellX, cellY)),
            paved: layout && ((cellX, cellY) => layout.paved(cellX, cellY)),
            mapGrass: layout && ((cellX, cellY) => layout.mapGrass(cellX, cellY)),
            moistureAt: meadow && ((x, y) => meadow.moistureAt(x, y)),
            waterDepthAt: (x, y) => this.inputs.water.depthAt(x, y, now),
            snowLineSeason: this.inputs.snowLineSeason?.(),
        };
    }

    /** The water a block is drawn with (blockCellWindow), as a short text; empty when dry. */
    private waterSignature(key: string, now: number): string {
        const [blockX, blockY] = key.split(",").map(Number);
        // The same cells as the drawing reads (draw).
        const window = blockCellWindow(blockX, blockY);
        const any = this.inputs.water.levelsOver(window.x, window.y, GRID_WIDTH, GRID_HEIGHT, now, this.levels);
        if (!any) return "";
        let hash = 0;
        for (let index = 0; index < GRID_WIDTH * GRID_HEIGHT; index++) {
            // As the water is drawn: by steps of WATER_STEP_PX (a lake rising slowly is not drawn again each time).
            hash = (Math.imul(hash, 31) + Math.floor(this.levels[index] / WATER_STEP_PX)) | 0;
        }
        return hash.toString(36);
    }

    private drop(key: string): void {
        // A block left half drawn is not drawn on.
        if (this.job?.key === key) this.job = undefined;
        const block = this.blocks.get(key);
        if (!block) return;
        block.image.destroy();
        block.texture.destroy();
        this.blocks.delete(key);
        this.scene.markDirty();
    }

    private block(key: string, left: number, top: number): Block | undefined {
        const kept = this.blocks.get(key);
        if (kept) return kept;
        const texture = this.scene.textures.createCanvas(`relief-block:${key}`, BLOCK_TEXELS, BLOCK_TEXELS);
        if (!texture) return undefined;
        // Pixel art: each pixel of the block is a pixel of the map, never smoothed.
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        const image = this.scene.add
            .image(left, top, texture.key)
            .setOrigin(0, 0)
            .setDisplaySize(BLOCK_PX, BLOCK_PX)
            .setDepth(RELIEF_TILES_DEPTH)
            .setVisible(!this.hidden);
        const block = { texture, image, projected: this.projected };
        this.blocks.set(key, block);
        return block;
    }

    /**
     * Draws a block, a step at a time: it yields every ROWS_A_STEP rows (or columns) so that update can spread a block
     * over several images. The block shows its new drawing once the last step is done.
     */
    private *drawSteps(key: string, terrain: TerrainData | undefined, now: number): Generator<void, void, void> {
        const [blockX, blockY] = key.split(",").map(Number);
        const left = blockX * BLOCK_PX;
        const top = blockY * BLOCK_PX;
        const block = this.block(key, left, top);
        if (!block) return;
        // The heights and the water of the cells the block is drawn from, read once (one more cell around for the
        // interpolation between centres): reading the relief map at every pixel would cost far too much.
        const { x: gridX, y: gridY } = blockCellWindow(blockX, blockY);
        const width = GRID_WIDTH;
        const height = GRID_HEIGHT;
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                this.heights[row * width + column] = heightAt(terrain, gridX + column, gridY + row);
            }
        }
        const wet = this.inputs.water.levelsOver(gridX, gridY, width, height, now, this.gridWater);
        // Only the rows of the ground that can be drawn in the block are worked out: a point is drawn lower in a hollow,
        // higher on a mount (or the surface of its water). One more row each way, for the face of a drop that comes from
        // the row before or goes on past the block.
        let lowest = 0;
        let highest = Number.NEGATIVE_INFINITY;
        let highestSurface = 0;
        for (let index = 0; index < width * height; index++) {
            const value = this.heights[index];
            if (value < lowest) lowest = value;
            if (value > highest) highest = value;
            const surface = value + (wet ? this.gridWater[index] : 0);
            if (surface > highestSurface) highestSurface = surface;
        }
        // Flat in the map editor: nothing is drawn lower nor higher.
        const shiftOf = (ground: number): number => (this.projected ? shiftOfHeight(ground) : 0);
        const mostDrop = Math.max(0, shiftOf(lowest));
        const mostRise = Math.max(0, -shiftOf(highestSurface));
        // No least drop under water, whose surface is drawn higher.
        const leastDrop = wet ? 0 : Math.max(0, shiftOf(highest));
        const firstY = top - Math.ceil(mostDrop) - 1;
        const endY =
            mostRise > 0
                ? top + BLOCK_PX + Math.ceil(mostRise) + 1
                : Math.min(top + BLOCK_PX, top + BLOCK_PX - Math.floor(leastDrop) + 1);
        const bilinear = (values: ArrayLike<number>, x: number, y: number): number => {
            const fx = Math.min(width - 1.001, Math.max(0, x / TERRAIN_CELL - 0.5 - gridX));
            const fy = Math.min(height - 1.001, Math.max(0, y / TERRAIN_CELL - 0.5 - gridY));
            const cx = Math.floor(fx);
            const cy = Math.floor(fy);
            const tx = fx - cx;
            const ty = fy - cy;
            const index = cy * width + cx;
            const upper = values[index] * (1 - tx) + values[index + 1] * tx;
            const lower = values[index + width] * (1 - tx) + values[index + width + 1] * tx;
            return upper * (1 - ty) + lower * ty;
        };
        // What covers each cell, read once.
        this.cellMaterials.fill(UNKNOWN_MATERIAL);
        const cellInputs = this.cellInputs(terrain, now);
        const cell = (cellX: number, cellY: number): Cover => {
            const column = Math.min(width - 1, Math.max(0, cellX - gridX));
            const row = Math.min(height - 1, Math.max(0, cellY - gridY));
            const index = row * width + column;
            let known = this.cellMaterials[index];
            if (known === UNKNOWN_MATERIAL) {
                known = COVER_INDEX[cellMaterial(cellInputs, gridX + column, gridY + row)];
                this.cellMaterials[index] = known;
            }
            return COVERS[known];
        };
        // 1. The ground seen from above, one pixel a pixel of the map, 1 px more all around than what is drawn (so a
        // border on the edge of a block gets its line on both blocks) and MAX_DROP px north of the block.
        const originX = left - 1;
        const originY = top - MAX_DROP - 1;
        const heights = this.pointHeights;
        // The water of each point (as the blocks draw it), to find its edge: a point of water next to a dry one.
        const waters = this.pointWaters;
        const materials = this.pointMaterials;
        const cellHeights = this.heights;
        const firstRow = Math.max(0, firstY - originY - 1);
        const endRow = Math.min(POINT_ROWS, endY - originY + 1);
        for (let row = firstRow; row < endRow; row++) {
            const y = originY + row + 0.5;
            // The heights between the centres of the cells, worked out along the row (the bilinear of `bilinear`).
            const fy = Math.min(height - 1.001, Math.max(0, y / TERRAIN_CELL - 0.5 - gridY));
            const heightRow = Math.floor(fy);
            const ty = fy - heightRow;
            // The four cells around the points of this row, between their centres: one material all around is the
            // material of every point there, only a border needs pickMaterial.
            const cellY = Math.floor(y / TERRAIN_CELL - 0.5);
            let region = Number.NaN;
            let uniform = -1;
            for (let column = 0; column < POINT_COLUMNS; column++) {
                const x = originX + column + 0.5;
                const index = row * POINT_COLUMNS + column;
                const fx = Math.min(width - 1.001, Math.max(0, x / TERRAIN_CELL - 0.5 - gridX));
                const heightColumn = Math.floor(fx);
                const tx = fx - heightColumn;
                const at = heightRow * width + heightColumn;
                const upper = cellHeights[at] * (1 - tx) + cellHeights[at + 1] * tx;
                const lower = cellHeights[at + width] * (1 - tx) + cellHeights[at + width + 1] * tx;
                heights[index] = upper * (1 - ty) + lower * ty;
                if (wet) waters[index] = bilinear(this.gridWater, x, y);
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
            if ((row - firstRow) % ROWS_A_STEP === ROWS_A_STEP - 1) yield;
        }
        // 2. Its colours: texture, light of the slope, depth, and the line of a border.
        const colors = this.pointColors;
        const season = this.inputs.season();
        const ramps = rampsFor(season);
        const meadow = this.inputs.meadow;
        // The shadows of the relief: only where the window has one (a flat window casts none). The horizon of a point
        // is that of its north-west neighbour, one step lower, or the ground of that neighbour: worked out along the
        // diagonals, the ray followed only from the first points of each (the first row, the first column).
        const shaded = highest > lowest;
        const horizons = this.pointHorizons;
        if (shaded) {
            const heightOf = (pointX: number, pointY: number): number => bilinear(this.heights, pointX, pointY);
            for (let row = firstRow; row < endRow; row++) {
                const y = originY + row + 0.5;
                for (let column = 0; column < POINT_COLUMNS; column++) {
                    const index = row * POINT_COLUMNS + column;
                    if (row === firstRow || column === 0) {
                        horizons[index] = shadowHorizon(heightOf, originX + column + 0.5, y);
                    } else {
                        const corner = index - POINT_COLUMNS - 1;
                        horizons[index] = Math.max(heights[corner], horizons[corner]) - SHADOW_RISE_A_STEP;
                    }
                }
                if ((row - firstRow) % ROWS_A_STEP === ROWS_A_STEP - 1) yield;
            }
        }
        // The textures of the materials met in this block only (a table is 1 MB).
        const textures: (Float32Array | undefined)[] = [];
        for (let row = Math.max(1, firstRow + 1); row < Math.min(POINT_ROWS - 1, endRow - 1); row++) {
            const y = originY + row;
            const textureRow = textureIndex(0, y);
            const bayerRow = BAYER_ROWS[y & 3];
            for (let column = 1; column < POINT_COLUMNS - 1; column++) {
                const index = row * POINT_COLUMNS + column;
                const here = materials[index];
                // Nothing covers it: transparent, the tiles of the map show.
                if (here === NONE_INDEX) {
                    colors[index] = undefined;
                    continue;
                }
                const material = COVERS[here] as Material;
                const west = materials[index - 1];
                const east = materials[index + 1];
                const north = materials[index - POINT_COLUMNS];
                const south = materials[index + POINT_COLUMNS];
                // Inside a material (most of the ground): no line to look for.
                const outline =
                    west === here && east === here && north === here && south === here
                        ? undefined
                        : (outlineOf(material, COVERS[west]) ??
                          outlineOf(material, COVERS[east]) ??
                          outlineOf(material, COVERS[north]) ??
                          outlineOf(material, COVERS[south]));
                const rise =
                    heights[index + 1] -
                    heights[index - 1] +
                    heights[index + POINT_COLUMNS] -
                    heights[index - POINT_COLUMNS];
                const x = originX + column;
                // In the shadow of a mount (or of the north-west rim of a hollow): darker.
                const light =
                    shaded && horizons[index] > heights[index] ? shadowedLight(lightOfRise(rise)) : lightOfRise(rise);
                const contour = isContour(
                    heights[index],
                    heights[index - 1],
                    heights[index + 1],
                    heights[index - POINT_COLUMNS],
                    heights[index + POINT_COLUMNS],
                );
                // Dense grass of the meadow: where the flowers of the season grow.
                const dense =
                    material === "grass" &&
                    meadow !== undefined &&
                    meadow.grassAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) >= DENSE_GRASS;
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
                    const shade = Math.round(value * 3 + bayerRow[x & 3] - 0.5);
                    const ramp = seasonPatch(material, season, x, y) ?? ramps[material];
                    colors[index] = ramp[shade < 0 ? 0 : shade > 3 ? 3 : shade];
                } else {
                    colors[index] = groundColor(material, x, y, light, heights[index], outline, contour, season, dense);
                }
            }
            if (row % ROWS_A_STEP === 0) yield;
        }
        // 3. Projected in 3/4, column by column, from MAX_DROP px north of the block to MAX_RISE south of it.
        const context = block.texture.getContext();
        const pixels = context.createImageData(BLOCK_TEXELS, BLOCK_TEXELS);
        const samples = this.samples;
        for (let column = 0; column < BLOCK_TEXELS; column++) {
            const x = left + column;
            let count = 0;
            for (let y = firstY; y < endY; y++) {
                const index = (y - originY) * POINT_COLUMNS + column + 1;
                const ground = heights[index];
                const water = wet ? waters[index] : 0;
                const sample = samples[count++];
                const here = materials[index];
                sample.groundY = y;
                sample.wallRamp = here === NONE_INDEX ? RAMPS.wall : WALL_RAMPS[COVERS[here] as Material];
                // The flank of a mount: its own ground in the shade (grass where nothing covers it).
                sample.flankRamp = here === NONE_INDEX ? ramps.grass : ramps[COVERS[here] as Material];
                if (water >= WATER_SEEN_PX) {
                    // The water as its signature knows it (WATER_STEP_PX): a block is drawn again only when it shows.
                    const depth = Math.max(WATER_SEEN_PX, Math.floor(water / WATER_STEP_PX) * WATER_STEP_PX);
                    sample.drop = shiftOf(ground + depth);
                    const edge =
                        waters[index - 1] < WATER_SEEN_PX ||
                        waters[index + 1] < WATER_SEEN_PX ||
                        waters[index - POINT_COLUMNS] < WATER_SEEN_PX ||
                        waters[index + POINT_COLUMNS] < WATER_SEEN_PX;
                    sample.color = waterColor(depth, x, y, season, colors[index], this.seeThrough, edge);
                    sample.plain = false;
                } else {
                    sample.drop = shiftOf(ground);
                    sample.color = colors[index];
                    // Left to the map (unless it hides what is drawn behind it): what nothing covers; without the layout
                    // of the map (the 3/4 relief only), the flat ground.
                    sample.plain = this.inputs.layout ? here === NONE_INDEX : Math.abs(ground) < 0.5;
                }
            }
            paintColumn(samples, count, BLOCK_TEXELS, top, pixels.data, BLOCK_TEXELS, column);
            if (column % ROWS_A_STEP === ROWS_A_STEP - 1) yield;
        }
        context.putImageData(pixels, 0, 0);
        refreshCanvasTexture(block.texture);
        block.projected = this.projected;
        block.image.setVisible(!this.hidden);
        this.scene.markDirty();
    }
}
