import * as Phaser from "phaser";
import { heightAt, TERRAIN_CELL, TERRAIN_CHUNK, TILE_PX } from "@workadventure/map-editor";
import { Season } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { refreshCanvasTexture } from "../CanvasTextureRefresh";
import type { MeadowState } from "./MeadowState";
import {
    contourShade,
    groundColor,
    groundValue,
    shadowHorizon,
    SHADOW_RISE_A_STEP,
    contourOf,
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
import { blockCellWindow, COARSE_TEXEL, ReliefTileSchedule, reliefSignature, texelFor } from "./ReliefTileSchedule";
import { waterColor } from "./Pixel/WaterPixel";
import type { TerrainWater } from "./TerrainWater";

/** The ground outdoors: under the foam and the life of the water (0.66), the objects and the avatars. */
export const RELIEF_TILES_DEPTH = 0.655;
/** Map pixels across a block: one chunk of the relief. */
const BLOCK_PX = TERRAIN_CHUNK * TERRAIN_CELL;
const BLOCK_TEXELS = BLOCK_PX / RELIEF_TEXEL;
/**
 * The ground of a block seen from above, at its sharpest (a point a pixel of the map; coarser, fewer points: see
 * BlockDraw): 1 point more all around than the block, MAX_DROP px north and MAX_RISE south of it, and one row more each
 * way for the deepest face and the highest top.
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
const UNKNOWN_MATERIAL = 255;
/** The most blocks whose covers are read in one image. */
const COVERS_AN_IMAGE = 8;
/** What covers a point, as stored: the materials, then "none" (transparent). */
const COVERS: readonly Cover[] = [...MATERIALS, "none"];
const COVER_INDEX = Object.fromEntries(COVERS.map((cover, index) => [cover, index])) as Record<Cover, number>;
const NONE_INDEX = COVER_INDEX.none;
/** From this much grass of the meadow (0 to 255), the grass is dense: the flowers of the season grow there. */
const DENSE_GRASS = 160;
/** The time an image spends drawing blocks (ms): the rest waits for the next image. */
const DRAW_BUDGET_MS = 6;
/** The most blocks taken up in one image (cheap ones: coarse, or with nothing to draw). */
const PICKS_AN_IMAGE = 16;
/**
 * The blocks kept drawn, in sharp blocks (256 × 256 points: about half a megabyte each, its canvas and its texture): a
 * block drawn a point every 2 px weighs a quarter, a coarse one is not counted (a sixteenth). The blocks around the view
 * are always kept; beyond, the ones seen least lately are let go: zooming out again, or coming back, draws nothing
 * again.
 */
const KEPT_WEIGHT = 256;
/** The map is drawn ahead (coarse) while fewer blocks than this are kept. */
const MAX_AHEAD_BLOCKS = 2048;
/**
 * The most blocks whose relief is read for the first time in one image (a view far out comes over hundreds of blocks
 * at once): the others wait for a next image, as they are.
 */
const RELIEFS_AN_IMAGE = 48;
/** The most blocks of the map looked at in one image to draw them ahead (what covers each is read). */
const AHEAD_LOOKS_AN_IMAGE = 8;
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
/** The shades of the face of a drop, by what covers its rim (as stored: COVERS). */
const WALL_RAMP_OF: readonly Ramp[] = COVERS.map((cover) => (cover === "none" ? RAMPS.wall : WALL_RAMPS[cover]));
/** The cells a block is drawn from (blockCellWindow). */
const GRID_WIDTH = blockCellWindow(0, 0).width;
const GRID_HEIGHT = blockCellWindow(0, 0).height;
/** Water thinner than this is not drawn (as on the flat drawing). */
const WATER_SEEN_PX = 0.5;
/** The water is drawn, and its blocks drawn again, by steps of this many pixels of depth. */
const WATER_STEP_PX = 2;

/** A block being drawn: what its passes share (ReliefTiles.prepareDraw). */
interface BlockDraw {
    left: number;
    top: number;
    /** Pixels of the map for a point drawn (texelFor): 1 sharp, 2 or 4 coarser. */
    texel: number;
    /** Points across and down the block drawn. */
    size: number;
    /** Points across and down the ground seen from above (a point more all around, the rows north and south). */
    columns: number;
    rows: number;
    /** The first cell of its window (blockCellWindow). */
    gridX: number;
    gridY: number;
    wet: boolean;
    projected: boolean;
    /** The point of the map of the first point of the ground seen from above. */
    originX: number;
    originY: number;
    /** The rows of the ground seen from above worked out. */
    firstRow: number;
    endRow: number;
    /** The rows of the ground that can be drawn in the block. */
    sampleFirst: number;
    sampleEnd: number;
    shaded: boolean;
    cellInputs: CellInputs;
    season: Season | undefined;
    /** Whether the season sows flowers in the dense grass. */
    flowers: boolean;
    ramps: Record<Material | "wall" | "water", Ramp>;
    /** The shades of the flank of a mount, by what covers it (as stored: COVERS). */
    flankRamps: readonly Ramp[];
    /** The textures of the materials met in this block only (a table is 1 MB). */
    textures: (Float32Array | undefined)[];
}

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
    /**
     * Pixels of the screen for a pixel of the map (the zoom of the camera): far out, the blocks are drawn no finer than
     * the screen shows them (texelFor). Absent: always sharp.
     */
    screenScale?(): number;
    /**
     * The size of the map (px): once the view is drawn, the rest of the map is drawn ahead, coarse, so that zooming out
     * or going somewhere shows the ground at once. Absent: only the blocks around the view are drawn.
     */
    mapSize?(): { width: number; height: number };
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
    /** Pixels of the map for a point of its drawing (texelFor). */
    texel: number;
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
        { length: (MAX_DROP + BLOCK_PX + MAX_RISE) / RELIEF_TEXEL + 4 },
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
    /** The blocks around the view, the nearest to its middle first (nearestFirst). */
    private nearest: readonly string[] = [];
    private nearestKey = "";
    /** The blocks of the map left to draw ahead, the nearest to the view first, for the blocks the view is over. */
    private ahead: string[] = [];
    private aheadAt = 0;
    private aheadRange = "";
    private aheadLooks = 0;
    /** The reliefs of blocks read for the first time: in this image, in all; whether some wait for a next image. */
    private reliefReads = 0;
    private reliefReadCount = 0;
    private reliefsWaiting = false;
    /** The blocks of the map with nothing to draw, as far as known: not looked at again. */
    private readonly aheadEmpty = new Set<string>();
    /** The pixels of the block being drawn (RGBA), shown once it is whole. */
    private readonly out = new Uint8ClampedArray(BLOCK_TEXELS * BLOCK_TEXELS * 4);

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

    /** How many times the relief of a block was read for the first time: spread over images when the view is huge. */
    public signatureReads(): number {
        return this.reliefReadCount;
    }

    /** Whether a block is being drawn, a step an image (its drawing not shown yet). */
    public isDrawing(): boolean {
        return (
            this.job !== undefined ||
            this.staleCovers.size > 0 ||
            this.reliefsWaiting ||
            this.aheadAt < this.ahead.length
        );
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
            this.lookAheadAgain();
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
            this.lookAheadAgain();
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
        // The blocks of the view first, and from its middle outwards: what one looks at is read, drawn and sharpened
        // first.
        const nearest = this.nearestFirst(around, view);
        const inTurn = [
            ...nearest.filter((key) => visibleKeys.has(key)),
            ...nearest.filter((key) => !visibleKeys.has(key)),
        ];
        for (const key of inTurn) {
            if (reads >= COVERS_AN_IMAGE) break;
            if (this.coverSignatures.has(key) && !this.staleCovers.has(key)) continue;
            this.coverSignatures.set(key, this.coverSignature(key, terrain, now));
            this.staleCovers.delete(key);
            reads++;
        }
        const shared = `${this.inputs.season() ?? ""}|${snow}|${this.projected ? "3/4" : "flat"}|${this.seeThrough}`;
        // The time of the image counts what the blocks are drawn from too.
        const start = performance.now();
        this.reliefReads = 0;
        this.reliefsWaiting = false;
        // A block whose relief is not read yet (its turn comes in a next image) is left as it is.
        const bases = new Map<string, string>();
        for (const key of inTurn) {
            const base = this.baseOf(key, terrain, now, shared, false);
            if (base !== undefined) bases.set(key, base);
        }
        // Blocks are drawn one after the other, DRAW_BUDGET_MS an image: one that takes longer goes on in the next
        // images; cheap ones (coarse, or with nothing left to draw) follow one another in the same image.
        const needed = texelFor(this.inputs.screenScale?.() ?? 1);
        this.aheadLooks = 0;
        let picks = 0;
        for (;;) {
            if (
                !this.job &&
                (picks++ >= PICKS_AN_IMAGE ||
                    !(
                        this.pick(nearest, visibleKeys, bases, needed, terrain, now) ||
                        this.drawAhead(around, aroundKeys, shared, terrain, now)
                    ))
            ) {
                break;
            }
            if (this.job?.steps.next().done) this.job = undefined;
            if (performance.now() - start >= DRAW_BUDGET_MS) break;
        }
        for (const key of this.schedule.evict(aroundKeys, KEPT_WEIGHT, (kept) => this.weightOf(kept))) {
            this.drop(key);
            // Let go sharp: drawn ahead again, coarse.
            this.lookAheadAgain();
        }
    }

    /**
     * The blocks around the view, the nearest to its middle first. Worked out again when the view comes over other
     * blocks, or its middle goes half a block further.
     */
    private nearestFirst(
        around: readonly string[],
        view: { x: number; y: number; width: number; height: number },
    ): readonly string[] {
        const middleX = (view.x + view.width / 2) / BLOCK_PX;
        const middleY = (view.y + view.height / 2) / BLOCK_PX;
        const key = `${around[0]}|${around[around.length - 1]}|${Math.round(middleX * 2)},${Math.round(middleY * 2)}`;
        if (key !== this.nearestKey) {
            this.nearestKey = key;
            this.nearest = around
                .map((block) => {
                    const [blockX, blockY] = block.split(",").map(Number);
                    return { block, distance: (blockX + 0.5 - middleX) ** 2 + (blockY + 0.5 - middleY) ** 2 };
                })
                .sort((a, b) => a.distance - b.distance)
                .map((each) => each.block);
        }
        return this.nearest;
    }

    /** What a block weighs in the blocks kept (KEPT_WEIGHT): nothing while it is coarse, or not drawn. */
    private weightOf(key: string): number {
        const texel = this.blocks.get(key)?.texel;
        return texel === undefined || texel >= COARSE_TEXEL ? 0 : 1 / (texel * texel);
    }

    /** The blocks of the map are looked at again to draw them ahead (what covers them changed, one was let go). */
    private lookAheadAgain(): void {
        this.aheadEmpty.clear();
        this.aheadRange = "";
    }

    /**
     * What a block is drawn from, but the fineness of its drawing, as a short text; empty when there is nothing to draw
     * (nothing dug, no water, nothing that covers the ground), or when what covers its cells is not read yet (`readCover`
     * false: its turn comes in a next image).
     */
    private baseOf(
        key: string,
        terrain: TerrainData | undefined,
        now: number,
        shared: string,
        readCover: boolean,
    ): string | undefined {
        let relief = this.reliefSignatures.get(key);
        if (relief === undefined) {
            // Not read yet, and enough of them read in this image: its turn comes in a next one.
            if (this.reliefReads >= RELIEFS_AN_IMAGE) {
                this.reliefsWaiting = true;
                return undefined;
            }
            this.reliefReads++;
            this.reliefReadCount++;
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
        if (!this.inputs.layout && relief === "" && water === "") return "";
        let cover = this.coverSignatures.get(key);
        if (cover === undefined) {
            if (!readCover) return "";
            cover = this.coverSignature(key, terrain, now);
            this.coverSignatures.set(key, cover);
        }
        // With it: nothing to draw where nothing covers the ground, nothing is dug and no water lies.
        return relief === "" && water === "" && cover === "" ? "" : `${relief}|${water}|${cover}|${shared}`;
    }

    /**
     * Once the blocks around the view are drawn: the rest of the map, coarse (COARSE_TEXEL: a sixteenth of the time and
     * of the memory of a sharp block), the nearest to the view first. Zooming out, or going somewhere, shows the ground
     * at once; it is sharpened then. False when nothing is left to draw ahead in this image.
     */
    private drawAhead(
        around: readonly string[],
        aroundKeys: ReadonlySet<string>,
        shared: string,
        terrain: TerrainData | undefined,
        now: number,
    ): boolean {
        const size = this.inputs.mapSize?.();
        if (!size) return false;
        const range = `${around[0]}|${around[around.length - 1]}|${size.width}|${size.height}`;
        if (range !== this.aheadRange) {
            this.aheadRange = range;
            const [firstX, firstY] = around[0].split(",").map(Number);
            const [lastX, lastY] = around[around.length - 1].split(",").map(Number);
            const middleX = (firstX + lastX) / 2;
            const middleY = (firstY + lastY) / 2;
            const left: { key: string; distance: number }[] = [];
            for (let blockY = 0; blockY < Math.ceil(size.height / BLOCK_PX); blockY++) {
                for (let blockX = 0; blockX < Math.ceil(size.width / BLOCK_PX); blockX++) {
                    const key = `${blockX},${blockY}`;
                    if (aroundKeys.has(key) || this.blocks.has(key) || this.aheadEmpty.has(key)) continue;
                    left.push({ key, distance: Math.max(Math.abs(blockX - middleX), Math.abs(blockY - middleY)) });
                }
            }
            this.ahead = left.sort((a, b) => a.distance - b.distance).map((block) => block.key);
            this.aheadAt = 0;
        }
        while (this.aheadAt < this.ahead.length && this.aheadLooks < AHEAD_LOOKS_AN_IMAGE) {
            if (this.blocks.size >= MAX_AHEAD_BLOCKS) {
                this.aheadAt = this.ahead.length;
                break;
            }
            const key = this.ahead[this.aheadAt++];
            if (this.blocks.has(key) || aroundKeys.has(key)) continue;
            this.aheadLooks++;
            const base = this.baseOf(key, terrain, now, shared, true);
            // Its relief is read in a next image.
            if (base === undefined) {
                this.aheadAt--;
                return false;
            }
            if (base === "") {
                this.aheadEmpty.add(key);
                continue;
            }
            this.schedule.mark(key, `${base}|t${COARSE_TEXEL}`);
            this.job = { key, steps: this.drawSteps(key, terrain, now, COARSE_TEXEL) };
            return true;
        }
        return false;
    }

    /**
     * Takes up the next block to draw (or to drop, where nothing is left to draw), the ones of the view first. A block of
     * the view never drawn yet is drawn coarse first (COARSE_TEXEL: the view is filled at once), then as sharp as the
     * screen shows it (`needed`); one drawn sharper than needed is kept as it is. False when nothing is left to do.
     */
    private pick(
        around: readonly string[],
        visible: ReadonlySet<string>,
        bases: ReadonlyMap<string, string>,
        needed: number,
        terrain: TerrainData | undefined,
        now: number,
    ): boolean {
        const signatures = new Map<string, string>();
        const fresh: string[] = [];
        const shown: string[] = [];
        const rest: string[] = [];
        for (const key of around) {
            const base = bases.get(key);
            if (base === undefined) continue;
            const drawn = this.blocks.get(key)?.texel;
            signatures.set(
                key,
                base === "" ? "" : `${base}|t${drawn !== undefined && drawn <= needed ? drawn : needed}`,
            );
            if (!visible.has(key)) rest.push(key);
            else if (drawn === undefined && base !== "") fresh.push(key);
            else shown.push(key);
        }
        const [key] = this.schedule.toRedraw([...fresh, ...shown, ...rest], signatures);
        if (key === undefined) return false;
        const base = bases.get(key) ?? "";
        if (base === "") {
            this.drop(key);
            return true;
        }
        const texel = !this.blocks.has(key) && visible.has(key) && needed < COARSE_TEXEL ? COARSE_TEXEL : needed;
        this.schedule.mark(key, `${base}|t${texel}`);
        this.job = { key, steps: this.drawSteps(key, terrain, now, texel) };
        return true;
    }

    public destroy(): void {
        for (const key of [...this.blocks.keys()]) this.drop(key);
        this.lookAheadAgain();
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

    /**
     * Shows the block just drawn (`out`), on a surface of the size of its drawing: another one than before when it is
     * drawn finer or coarser. Until then the block keeps showing what it showed.
     */
    private show(key: string, draw: BlockDraw): void {
        let block = this.blocks.get(key);
        if (block && block.texel !== draw.texel) {
            block.image.destroy();
            block.texture.destroy();
            this.blocks.delete(key);
            block = undefined;
        }
        if (!block) {
            const name = draw.texel === 1 ? `relief-block:${key}` : `relief-block:${key}@${draw.texel}`;
            const texture = this.scene.textures.createCanvas(name, draw.size, draw.size);
            if (!texture) return;
            // Pixel art: each point of the block is drawn as it is, never smoothed.
            texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
            const image = this.scene.add
                .image(draw.left, draw.top, texture.key)
                .setOrigin(0, 0)
                .setDisplaySize(BLOCK_PX, BLOCK_PX)
                .setDepth(RELIEF_TILES_DEPTH);
            block = { texture, image, projected: draw.projected, texel: draw.texel };
            this.blocks.set(key, block);
        }
        const context = block.texture.getContext();
        const pixels = context.createImageData(draw.size, draw.size);
        pixels.data.set(this.out.subarray(0, draw.size * draw.size * 4));
        context.putImageData(pixels, 0, 0);
        refreshCanvasTexture(block.texture);
        block.projected = draw.projected;
        // Drawn the other way than the relief is shown now (the editor opened meanwhile): hidden until drawn again.
        block.image.setVisible(!this.hidden && block.projected === this.projected);
        this.scene.markDirty();
    }

    /**
     * Draws a block, a step at a time: it yields every ROWS_A_STEP rows (or columns) so that update can spread a block
     * over several images. The block shows its new drawing once the last step is done.
     */
    private *drawSteps(
        key: string,
        terrain: TerrainData | undefined,
        now: number,
        texel: number,
    ): Generator<void, void, void> {
        // The loops run in plain methods, a slice at a time: inside a generator they would run several times slower.
        const draw = this.prepareDraw(key, terrain, now, texel);
        for (let row = draw.firstRow; row < draw.endRow; row += ROWS_A_STEP) {
            this.groundRows(draw, row, Math.min(row + ROWS_A_STEP, draw.endRow));
            yield;
        }
        if (draw.shaded) {
            for (let row = draw.firstRow; row < draw.endRow; row += ROWS_A_STEP) {
                this.horizonRows(draw, row, Math.min(row + ROWS_A_STEP, draw.endRow));
                yield;
            }
        }
        const colorsEnd = Math.min(draw.rows - 1, draw.endRow - 1);
        for (let row = Math.max(1, draw.firstRow + 1); row < colorsEnd; row += ROWS_A_STEP) {
            this.colorRows(draw, row, Math.min(row + ROWS_A_STEP, colorsEnd));
            yield;
        }
        for (let column = 0; column < draw.size; column += ROWS_A_STEP) {
            this.projectColumns(draw, column, Math.min(column + ROWS_A_STEP, draw.size));
            yield;
        }
        this.show(key, draw);
    }

    /**
     * What drawing a block needs to know before its passes: the heights and the water of its cells, read once (one more
     * cell around for the interpolation between centres: reading the relief map at every pixel would cost far too
     * much), and the rows of the ground that can be drawn in it. `texel`: pixels of the map for a point drawn.
     */
    private prepareDraw(key: string, terrain: TerrainData | undefined, now: number, texel: number): BlockDraw {
        const [blockX, blockY] = key.split(",").map(Number);
        const left = blockX * BLOCK_PX;
        const top = blockY * BLOCK_PX;
        const { x: gridX, y: gridY } = blockCellWindow(blockX, blockY);
        for (let row = 0; row < GRID_HEIGHT; row++) {
            for (let column = 0; column < GRID_WIDTH; column++) {
                this.heights[row * GRID_WIDTH + column] = heightAt(terrain, gridX + column, gridY + row);
            }
        }
        const wet = this.inputs.water.levelsOver(gridX, gridY, GRID_WIDTH, GRID_HEIGHT, now, this.gridWater);
        // Only the rows of the ground that can be drawn in the block are worked out: a point is drawn lower in a hollow,
        // higher on a mount (or the surface of its water). One more row each way, for the face of a drop that comes from
        // the row before or goes on past the block.
        let lowest = 0;
        let highest = Number.NEGATIVE_INFINITY;
        let highestSurface = 0;
        for (let index = 0; index < GRID_WIDTH * GRID_HEIGHT; index++) {
            const value = this.heights[index];
            if (value < lowest) lowest = value;
            if (value > highest) highest = value;
            const surface = value + (wet ? this.gridWater[index] : 0);
            if (surface > highestSurface) highestSurface = surface;
        }
        const projected = this.projected;
        // Flat in the map editor: nothing is drawn lower nor higher.
        const shiftOf = (ground: number): number => (projected ? shiftOfHeight(ground) : 0);
        const mostDrop = Math.max(0, shiftOf(lowest));
        const mostRise = Math.max(0, -shiftOf(highestSurface));
        // No least drop under water, whose surface is drawn higher.
        const leastDrop = wet ? 0 : Math.max(0, shiftOf(highest));
        const firstY = top - Math.ceil(mostDrop) - 1;
        const endY =
            mostRise > 0
                ? top + BLOCK_PX + Math.ceil(mostRise) + 1
                : Math.min(top + BLOCK_PX, top + BLOCK_PX - Math.floor(leastDrop) + 1);
        // The ground seen from above, a point every `texel` px: 1 point more all around than what is drawn (so a border
        // on the edge of a block gets its line on both blocks), from MAX_DROP px north of the block (and one row more,
        // for the neighbours of the first row drawn).
        const size = BLOCK_PX / texel;
        const columns = size + 2;
        const rows = (MAX_DROP + BLOCK_PX + MAX_RISE) / texel + 4;
        const originX = left - texel;
        const originY = top - MAX_DROP - 2 * texel;
        const first = Math.floor((firstY - originY) / texel);
        const end = Math.ceil((endY - originY) / texel);
        // What covers each cell, read once.
        this.cellMaterials.fill(UNKNOWN_MATERIAL);
        this.out.fill(0, 0, size * size * 4);
        const season = this.inputs.season();
        const ramps = rampsFor(season);
        return {
            left,
            top,
            texel,
            size,
            columns,
            rows,
            gridX,
            gridY,
            wet,
            projected,
            originX,
            originY,
            firstRow: Math.max(0, first - 1),
            endRow: Math.min(rows, end + 1),
            sampleFirst: Math.max(1, first),
            sampleEnd: Math.min(rows - 1, end),
            // The shadows of the relief: only where the window has one (a flat window casts none).
            shaded: highest > lowest,
            cellInputs: this.cellInputs(terrain, now),
            season,
            flowers: season === Season.Spring || season === Season.Summer,
            ramps,
            // The flank of a mount: its own ground in the shade (grass where nothing covers it).
            flankRamps: COVERS.map((cover) => (cover === "none" ? ramps.grass : ramps[cover])),
            textures: [],
        };
    }

    /** The value of the cell values (heights, water) at a point, between the centres of the cells of the window. */
    private bilinear(draw: BlockDraw, values: ArrayLike<number>, x: number, y: number): number {
        const fx = Math.min(GRID_WIDTH - 1.001, Math.max(0, x / TERRAIN_CELL - 0.5 - draw.gridX));
        const fy = Math.min(GRID_HEIGHT - 1.001, Math.max(0, y / TERRAIN_CELL - 0.5 - draw.gridY));
        const cx = Math.floor(fx);
        const cy = Math.floor(fy);
        const tx = fx - cx;
        const ty = fy - cy;
        const index = cy * GRID_WIDTH + cx;
        const upper = values[index] * (1 - tx) + values[index + 1] * tx;
        const lower = values[index + GRID_WIDTH] * (1 - tx) + values[index + GRID_WIDTH + 1] * tx;
        return upper * (1 - ty) + lower * ty;
    }

    /** What covers a cell of the window, read once a block. */
    private coverOfCell(draw: BlockDraw, cellX: number, cellY: number): Cover {
        const column = Math.min(GRID_WIDTH - 1, Math.max(0, cellX - draw.gridX));
        const row = Math.min(GRID_HEIGHT - 1, Math.max(0, cellY - draw.gridY));
        const index = row * GRID_WIDTH + column;
        let known = this.cellMaterials[index];
        if (known === UNKNOWN_MATERIAL) {
            known = COVER_INDEX[cellMaterial(draw.cellInputs, draw.gridX + column, draw.gridY + row)];
            this.cellMaterials[index] = known;
        }
        return COVERS[known];
    }

    /** 1. The ground seen from above: the heights, the water and the materials of the points of the rows given. */
    private groundRows(draw: BlockDraw, fromRow: number, toRow: number): void {
        const { originX, originY, gridX, gridY, wet, texel, columns } = draw;
        const heights = this.pointHeights;
        // The water of each point (as the blocks draw it), to find its edge: a point of water next to a dry one.
        const waters = this.pointWaters;
        const materials = this.pointMaterials;
        const cellHeights = this.heights;
        const cellWaters = this.gridWater;
        const cell = (cellX: number, cellY: number): Cover => this.coverOfCell(draw, cellX, cellY);
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
                if (wet) {
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
    private horizonRows(draw: BlockDraw, fromRow: number, toRow: number): void {
        const { originX, originY, firstRow, texel, columns } = draw;
        const heights = this.pointHeights;
        const horizons = this.pointHorizons;
        const step = SHADOW_RISE_A_STEP * texel;
        const heightOf = (pointX: number, pointY: number): number => this.bilinear(draw, this.heights, pointX, pointY);
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
    private colorRows(draw: BlockDraw, fromRow: number, toRow: number): void {
        const { originX, originY, shaded, season, flowers, ramps, textures, texel, columns } = draw;
        const heights = this.pointHeights;
        const horizons = this.pointHorizons;
        const materials = this.pointMaterials;
        const colors = this.pointColors;
        const meadow = this.inputs.meadow;
        for (let row = fromRow; row < toRow; row++) {
            const y = originY + row * texel;
            const textureRow = textureIndex(0, y);
            // The dither goes by points drawn, not by pixels of the map: coarse, it stays a dither.
            const bayerRow = BAYER_ROWS[(y / texel) & 3];
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
    private projectColumns(draw: BlockDraw, fromColumn: number, toColumn: number): void {
        const { left, top, originY, wet, projected, season, flankRamps, texel, columns, size } = draw;
        const { sampleFirst, sampleEnd } = draw;
        const heights = this.pointHeights;
        const waters = this.pointWaters;
        const materials = this.pointMaterials;
        const colors = this.pointColors;
        const samples = this.samples;
        const withLayout = this.inputs.layout !== undefined;
        const seeThrough = this.seeThrough;
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
