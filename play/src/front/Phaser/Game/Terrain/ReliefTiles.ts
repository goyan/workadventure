import * as Phaser from "phaser";
import { heightAt, Season, TERRAIN_CELL, TILE_PX } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { refreshCanvasTexture } from "../CanvasTextureRefresh";
import type { MeadowState } from "./MeadowState";
import {
    BLOCK_PX,
    BlockPainter,
    COVER_INDEX,
    DENSE_COLUMNS,
    DENSE_ROWS,
    GRID_HEIGHT,
    GRID_WIDTH,
    WATER_STEP_PX,
} from "./Pixel/BlockPainter";
import type { BlockJob } from "./Pixel/BlockPainter";
import { cellMaterial } from "./Pixel/MaterialField";
import type { CellInputs, Cover } from "./Pixel/MaterialField";
import { groundPointAt } from "./ReliefProjection";
import { blockCellWindow, COARSE_TEXEL, ReliefTileSchedule, reliefSignature, texelFor } from "./ReliefTileSchedule";
import type { TerrainWater } from "./TerrainWater";

/** The ground outdoors: under the foam and the life of the water (0.66), the objects and the avatars. */
export const RELIEF_TILES_DEPTH = 0.655;
/** The most blocks whose covers are read in one image. */
const COVERS_AN_IMAGE = 8;
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
/** Tiles across a block, and the tiles around it whose dense grass a block is told of (BlockJob.dense). */
const TILES_A_BLOCK = BLOCK_PX / TILE_PX;
const DENSE_WEST = 1;
const DENSE_NORTH = 5;

/** A block drawn, as it is shown: where, how fine, which way. */
interface Shown {
    left: number;
    top: number;
    /** Pixels of the map for a point of its drawing (texelFor). */
    texel: number;
    /** Points across and down its drawing. */
    size: number;
    projected: boolean;
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
    /** Paints the blocks on the thread of the game, a slice an image. */
    private readonly painter = new BlockPainter();
    private jobCount = 0;
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
        needed: 1 | 2 | 4,
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
     * Shows a block just drawn (`pixels`), on a surface of the size of its drawing: another one than before when it is
     * drawn finer or coarser. Until then the block keeps showing what it showed.
     */
    private show(key: string, shown: Shown, pixels: Uint8ClampedArray): void {
        let block = this.blocks.get(key);
        if (block && block.texel !== shown.texel) {
            block.image.destroy();
            block.texture.destroy();
            this.blocks.delete(key);
            block = undefined;
        }
        if (!block) {
            const name = shown.texel === 1 ? `relief-block:${key}` : `relief-block:${key}@${shown.texel}`;
            const texture = this.scene.textures.createCanvas(name, shown.size, shown.size);
            if (!texture) return;
            // Pixel art: each point of the block is drawn as it is, never smoothed.
            texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
            const image = this.scene.add
                .image(shown.left, shown.top, texture.key)
                .setOrigin(0, 0)
                .setDisplaySize(BLOCK_PX, BLOCK_PX)
                .setDepth(RELIEF_TILES_DEPTH);
            block = { texture, image, projected: shown.projected, texel: shown.texel };
            this.blocks.set(key, block);
        }
        const context = block.texture.getContext();
        const image = context.createImageData(shown.size, shown.size);
        image.data.set(pixels);
        context.putImageData(image, 0, 0);
        refreshCanvasTexture(block.texture);
        block.projected = shown.projected;
        // Drawn the other way than the relief is shown now (the editor opened meanwhile): hidden until drawn again.
        block.image.setVisible(!this.hidden && block.projected === this.projected);
        this.scene.markDirty();
    }

    /**
     * Draws a block on the thread of the game, a step at a time: it yields every ROWS_A_STEP rows (or columns) so that
     * update can spread a block over several images. The block shows its new drawing once the last step is done.
     */
    private *drawSteps(
        key: string,
        terrain: TerrainData | undefined,
        now: number,
        texel: 1 | 2 | 4,
    ): Generator<void, void, void> {
        // The loops run in the plain methods of the painter, a slice at a time: inside a generator they would run
        // several times slower.
        const job = this.jobOf(key, terrain, now, texel);
        const painter = this.painter;
        const shape = painter.begin(job);
        for (let row = shape.firstRow; row < shape.endRow; row += ROWS_A_STEP) {
            painter.groundRows(row, Math.min(row + ROWS_A_STEP, shape.endRow));
            yield;
        }
        if (shape.shaded) {
            for (let row = shape.firstRow; row < shape.endRow; row += ROWS_A_STEP) {
                painter.horizonRows(row, Math.min(row + ROWS_A_STEP, shape.endRow));
                yield;
            }
        }
        for (let row = shape.colorsFirst; row < shape.colorsEnd; row += ROWS_A_STEP) {
            painter.colorRows(row, Math.min(row + ROWS_A_STEP, shape.colorsEnd));
            yield;
        }
        for (let column = 0; column < shape.size; column += ROWS_A_STEP) {
            painter.projectColumns(column, Math.min(column + ROWS_A_STEP, shape.size));
            yield;
        }
        this.show(key, this.shownOf(job), painter.pixels());
    }

    /** Where and how a block painted from a job is shown. */
    private shownOf(job: BlockJob): Shown {
        return {
            left: job.blockX * BLOCK_PX,
            top: job.blockY * BLOCK_PX,
            texel: job.texel,
            size: BLOCK_PX / job.texel,
            projected: job.projected,
        };
    }

    /**
     * What a block is painted from, read from the game once, as plain data (BlockJob): the heights and the water of the
     * cells of its window, what covers each of them and, in the seasons of the flowers, where the grass is dense. The
     * painter (here, or in a worker) reads nothing else.
     */
    private jobOf(key: string, terrain: TerrainData | undefined, now: number, texel: 1 | 2 | 4): BlockJob {
        const [blockX, blockY] = key.split(",").map(Number);
        const { x: gridX, y: gridY } = blockCellWindow(blockX, blockY);
        const cells = GRID_WIDTH * GRID_HEIGHT;
        const heights = new Float32Array(cells);
        const covers = new Uint8Array(cells);
        const inputs = this.cellInputs(terrain, now);
        for (let row = 0; row < GRID_HEIGHT; row++) {
            for (let column = 0; column < GRID_WIDTH; column++) {
                const index = row * GRID_WIDTH + column;
                heights[index] = heightAt(terrain, gridX + column, gridY + row);
                covers[index] = COVER_INDEX[cellMaterial(inputs, gridX + column, gridY + row)];
            }
        }
        const waters = new Uint8Array(cells);
        const wet = this.inputs.water.levelsOver(gridX, gridY, GRID_WIDTH, GRID_HEIGHT, now, waters);
        const season = this.inputs.season();
        const meadow = this.inputs.meadow;
        let dense: Uint8Array | undefined;
        if (meadow && (season === Season.Spring || season === Season.Summer)) {
            dense = new Uint8Array(DENSE_COLUMNS * DENSE_ROWS);
            const tileX = blockX * TILES_A_BLOCK - DENSE_WEST;
            const tileY = blockY * TILES_A_BLOCK - DENSE_NORTH;
            for (let row = 0; row < DENSE_ROWS; row++) {
                for (let column = 0; column < DENSE_COLUMNS; column++) {
                    if (meadow.grassAt(tileX + column, tileY + row) >= DENSE_GRASS) {
                        dense[row * DENSE_COLUMNS + column] = 1;
                    }
                }
            }
        }
        return {
            id: ++this.jobCount,
            blockX,
            blockY,
            texel,
            projected: this.projected,
            seeThrough: this.seeThrough,
            withLayout: this.inputs.layout !== undefined,
            season,
            heights,
            waters: wet ? waters : undefined,
            covers,
            dense,
        };
    }
}
