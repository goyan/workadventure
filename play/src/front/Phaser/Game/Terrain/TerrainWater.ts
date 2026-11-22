import {
    poolBasins,
    reliefCells,
    SLOW_SPEED_UNITS,
    SPEED_BLOCK_CELLS,
    SPEED_UNITS,
    TERRAIN_CELL,
    TILE_PX,
    WATER_MESSAGE_MS,
} from "@workadventure/map-editor";
import type { PoolStyle, TerrainData } from "@workadventure/map-editor";
import { WaterTrend } from "./WaterTrend";

/** A state of the water as the server sends it, its bytes already unzipped (TerrainWaterMessage). */
export interface WaterState {
    /** The rectangle of the grid, in cells of the relief. */
    x: number;
    y: number;
    width: number;
    height: number;
    seq: number;
    /** Whether `depths` is the whole state, or what changed since the state before (to XOR with it). */
    full: boolean;
    /** Two bytes a cell, in eighths of a pixel of water, low byte first, row by row. */
    depths: Uint8Array;
    /**
     * The speed of the water, when the server knows it (a water with inertia): two signed bytes a block of cells
     * (towards the east, towards the south), row by row, already unzipped.
     */
    speeds?: Uint8Array;
    /** The slow speeds apart, unzipped (TerrainWaterMessage.slowSpeeds): where `speeds` says 0. */
    slowSpeeds?: Uint8Array;
}

/** The last state of the water and the one before it, over the grid the server simulates. */
export interface SettledWater {
    /** The rectangle of the grid, in cells of the relief. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Pixels of water over each cell, row by row: now, and one state earlier. */
    depths: Float32Array;
    before: Float32Array;
    /** The seconds between the two states; Infinity when there is only one. */
    seconds: number;
    /** The speed of the water over a cell of the map, in cells a second; undefined when the server tells none. */
    speedAt?: (cellX: number, cellY: number) => { x: number; y: number } | undefined;
    /**
     * How fast the level of each cell rises over a few seconds, its waves left out, in pixels a second (WaterTrend),
     * and whether that shows as a rise (1), a fall (-1) or neither (0). Absent: read the two states instead.
     */
    trend?: Float32Array;
    trendShown?: Int8Array;
    /** Whether that trend is known yet: the waves of the water are sampled for a few seconds first. */
    trendReady?: boolean;
}

/** Water thinner than this is a film the feet stand in: what stands or walks reads the ground under it. */
export const WATER_SHOWN_PX = 0.5;
/**
 * Water is drawn down to this, the step of the depths the server tells (4 mm), running or still: a sheet that runs
 * over a slope a few millimetres thin carries real water from a pool to the next (the flows of the water show it).
 */
const DRAWN_PX = 1 / 8;
/**
 * How often a gliding water asks to be drawn again: a level that creeps between two states of the server (a second
 * apart) shows as well at five drawings a second as at ten, and each drawing paints the whole view.
 */
const GLIDE_DRAW_MS = 200;
/** The shortest glide between two states: the server never tells the water more often than every step. */
const SHORTEST_GLIDE_MS = 100;
/**
 * A trend nobody read for this long is let go (the view of the flows reads it ten times a second): a view closed and
 * opened again within half a minute does not wait for its trend again.
 */
const TREND_UNREAD_MS = 30_000;

/**
 * The water of the relief as this browser shows it: the depth of the water over each cell of the grid the server
 * simulates. The server alone computes it and tells what changed once a second; between two states the water
 * glides, so a lake never jumps.
 */
export class TerrainWater {
    private terrain: TerrainData | undefined;
    private pools: readonly PoolStyle[] | undefined;
    private dug = false;
    private grid = { x: 0, y: 0, width: 0, height: 0 };
    /** The last state received, as bytes: the next change applies to it. */
    private bytes: Uint8Array | undefined;
    private seq: number | undefined;
    /** The water glides from `from` to `to`, from `at` on. */
    private from = new Float32Array(0);
    private to = new Float32Array(0);
    private at = -Infinity;
    /** The state before the last one, and the time between the two (ms): how fast the water rises and falls. */
    private before = new Float32Array(0);
    private betweenMs = Infinity;
    private receivedAt = -Infinity;
    /** How fast the level rises or falls over a few seconds, cell by cell: the waves left out. */
    /**
     * How fast the level rises or falls over a few seconds, cell by cell: the waves left out. Kept only while the
     * view of the flows reads it (settled with the time of the game): it goes through the whole grid at each state.
     */
    private trend: WaterTrend | undefined;
    private trendReadAt = -Infinity;
    /** The speed of the water block by block, as the server last told it; undefined when it tells none. */
    private speeds: Int8Array | undefined;
    /** The slow speeds, in SLOW_SPEED_UNITS, where `speeds` says 0; undefined when the server tells none. */
    private slowSpeeds: Int8Array | undefined;
    private wet = false;
    private changes = 0;
    /** How many of those changes were states of the water received. */
    private states = 0;
    private bridges: ReadonlySet<string> = new Set();
    /** The deepest water shown, now or while it glides to its last state (px). */
    private deepestDepth = 0;

    /** The relief of the map, as it is now (drawn with the water). */
    public setTerrain(terrain: TerrainData | undefined): void {
        if (terrain === this.terrain) return;
        this.terrain = terrain;
        // A map with painted soils has something to draw too.
        this.dug = reliefCells(terrain).size > 0 || Object.keys(terrain?.soil ?? {}).length > 0;
        this.changes++;
    }

    /** The relief the water was last given. */
    public relief(): TerrainData | undefined {
        return this.terrain;
    }

    /** The styles of the pools of the map: their depth is the depth of their basin (see basin). */
    public setPools(pools: readonly PoolStyle[] | undefined): void {
        if (pools === this.pools) return;
        this.pools = pools;
        this.changes++;
    }

    /**
     * The relief as the water stands on it: the relief of the map with its pools dug as deep as their style
     * (poolBasins), as the server reads it. The surface of the water is its depth over this ground, not over the
     * relief drawn: read here whatever goes by the level of the water (its current, its flows).
     */
    public basin(): TerrainData | undefined {
        return poolBasins(this.terrain, this.pools);
    }

    /** Whether there is anything to draw: a relief, or water (a source can flood a flat map). */
    public hasAnything(): boolean {
        return this.dug || this.wet;
    }

    /** A state from the server, at this time of the game: the water glides to it. */
    public receive(state: WaterState, now: number): void {
        const cells = state.width * state.height;
        if (state.depths.length !== cells * 2) return;
        const sameGrid =
            state.x === this.grid.x &&
            state.y === this.grid.y &&
            state.width === this.grid.width &&
            state.height === this.grid.height;
        let bytes: Uint8Array;
        if (state.full) {
            bytes = Uint8Array.from(state.depths);
        } else {
            // A change applies to the state just before it; a missed one leaves the water as it is until the next
            // whole state.
            if (!this.bytes || !sameGrid || this.seq === undefined || state.seq !== this.seq + 1) {
                this.seq = undefined;
                return;
            }
            bytes = this.bytes.map((byte, index) => byte ^ state.depths[index]);
        }
        const to = new Float32Array(cells);
        let wet = false;
        for (let index = 0; index < cells; index++) {
            to[index] = (bytes[index * 2] | (bytes[index * 2 + 1] << 8)) / 8;
            if (to[index] > 0) wet = true;
        }
        if (sameGrid && this.bytes) {
            // From where the water is shown now, at the pace of the glide that was going on.
            const shown = new Float32Array(cells);
            const share = this.share(now);
            for (let index = 0; index < cells; index++) {
                shown[index] = this.from[index] + (this.to[index] - this.from[index]) * share;
            }
            this.from = shown;
            this.at = now;
            // Only then the pace of the new glide: the time the server took between the two states.
            this.before = this.to;
            this.betweenMs = Math.max(100, now - this.receivedAt);
            if (this.trend && now - this.trendReadAt > TREND_UNREAD_MS) this.trend = undefined;
            this.trend?.add(this.to, to, now);
        } else {
            // The first state, or another grid (the relief was edited): shown at once.
            this.from = to;
            this.at = -Infinity;
            this.before = to;
            this.betweenMs = Infinity;
            this.trend?.reset(to, now);
        }
        this.receivedAt = now;
        this.to = to;
        this.grid = { x: state.x, y: state.y, width: state.width, height: state.height };
        // The speeds come whole with each state; none, or some of another size, and the water has no known speed.
        const blocks = Math.ceil(state.width / SPEED_BLOCK_CELLS) * Math.ceil(state.height / SPEED_BLOCK_CELLS);
        this.speeds =
            state.speeds && state.speeds.length === blocks * 2
                ? Int8Array.from(state.speeds, (byte) => (byte << 24) >> 24)
                : undefined;
        this.slowSpeeds =
            this.speeds && state.slowSpeeds && state.slowSpeeds.length === blocks * 2
                ? Int8Array.from(state.slowSpeeds, (byte) => (byte << 24) >> 24)
                : undefined;
        this.bytes = bytes;
        this.seq = state.seq;
        this.wet = wet || this.from.some((depth) => depth > 0);
        let deepest = 0;
        for (let index = 0; index < cells; index++) deepest = Math.max(deepest, this.from[index], to[index]);
        this.deepestDepth = deepest;
        this.changes++;
        this.states++;
    }

    /**
     * The last state received, whole, as it came (its sequence and speeds with it): where the local ground of a player
     * starts from, and what the water goes back to when they follow the server again. Undefined before any state.
     */
    public wholeState(): WaterState | undefined {
        if (!this.bytes) return undefined;
        return {
            ...this.grid,
            seq: this.seq ?? 0,
            full: true,
            depths: this.bytes,
            ...(this.speeds ? { speeds: Uint8Array.from(this.speeds) } : {}),
            ...(this.slowSpeeds ? { slowSpeeds: Uint8Array.from(this.slowSpeeds) } : {}),
        };
    }

    /** The deepest water of the map (px), as shown or gliding: how much higher a lake on a mount draws its surface. */
    public deepest(): number {
        return this.deepestDepth;
    }

    /** Pixels of water over a point of the map (map pixels) at this time of the game: 0 where it is dry. */
    public depthAt(x: number, y: number, now: number): number {
        const column = Math.floor(x / TERRAIN_CELL) - this.grid.x;
        const row = Math.floor(y / TERRAIN_CELL) - this.grid.y;
        if (column < 0 || row < 0 || column >= this.grid.width || row >= this.grid.height) return 0;
        const index = row * this.grid.width + column;
        const share = this.share(now);
        return this.from[index] + (this.to[index] - this.from[index]) * share;
    }

    /**
     * Pixels of water over a point of the map in the last state the server sent, without the glide: what every
     * browser knows alike (the wandering animals walk around it).
     */
    public settledDepthAt(x: number, y: number): number {
        const column = Math.floor(x / TERRAIN_CELL) - this.grid.x;
        const row = Math.floor(y / TERRAIN_CELL) - this.grid.y;
        if (column < 0 || row < 0 || column >= this.grid.width || row >= this.grid.height) return 0;
        return this.to[row * this.grid.width + column];
    }

    /**
     * The last state the server sent, cell by cell, with the one before it and the seconds between the two: what
     * the water holds and how fast it rises or falls (the view of the flows of the water). The arrays are those of
     * this object: read, never written. With `now` (ms of the game), the trend of the level too: kept from then on
     * while it is read so (it starts from nothing, and shows after a few seconds), and dying down where the server
     * has fallen silent: the water is still.
     */
    public settled(now?: number): SettledWater {
        let trend: WaterTrend | undefined;
        if (now !== undefined) {
            this.trendReadAt = now;
            if (!this.trend) {
                this.trend = new WaterTrend();
                this.trend.reset(this.to, now);
            } else this.trend.idle(now);
            trend = this.trend;
        }
        return {
            ...this.grid,
            depths: this.to,
            before: this.before,
            seconds: this.betweenMs / 1000,
            ...(this.speeds ? { speedAt: (cellX: number, cellY: number) => this.speedOfCell(cellX, cellY) } : {}),
            ...(trend ? { trend: trend.trend(), trendShown: trend.shown(), trendReady: trend.ready() } : {}),
        };
    }

    /** The view of the flows is closed: the trend is let go, and starts again from nothing when it opens. */
    public dropTrend(): void {
        this.trend = undefined;
        this.trendReadAt = -Infinity;
    }

    /**
     * How fast the water runs at a point of the map (map pixels), in cells a second, as the server computes it
     * (the water with inertia): undefined when it tells none, so that the caller reads the slope instead.
     */
    public speedAt(x: number, y: number): { x: number; y: number } | undefined {
        return this.speedOfCell(Math.floor(x / TERRAIN_CELL), Math.floor(y / TERRAIN_CELL));
    }

    private speedOfCell(cellX: number, cellY: number): { x: number; y: number } | undefined {
        const speeds = this.speeds;
        if (!speeds) return undefined;
        const column = cellX - this.grid.x;
        const row = cellY - this.grid.y;
        if (column < 0 || row < 0 || column >= this.grid.width || row >= this.grid.height) return { x: 0, y: 0 };
        const columns = Math.ceil(this.grid.width / SPEED_BLOCK_CELLS);
        const at = (Math.floor(row / SPEED_BLOCK_CELLS) * columns + Math.floor(column / SPEED_BLOCK_CELLS)) * 2;
        const slow = this.slowSpeeds;
        // Slower than a quarter of a cell a second: the slow speeds say how slow, when the server tells them.
        if (slow && speeds[at] === 0 && speeds[at + 1] === 0) {
            return { x: slow[at] / SLOW_SPEED_UNITS, y: slow[at + 1] / SLOW_SPEED_UNITS };
        }
        return { x: speeds[at] / SPEED_UNITS, y: speeds[at + 1] / SPEED_UNITS };
    }

    /**
     * The tiles that carry the deck of a bridge ("x,y" in tiles, see bridgeTilesOf): what walks reads no water
     * there. What reads the water again at each version (the wandering animals) is told when they change.
     */
    public setBridges(tiles: ReadonlySet<string>): void {
        if (tiles.size === this.bridges.size && [...tiles].every((tile) => this.bridges.has(tile))) return;
        this.bridges = tiles;
        this.changes++;
    }

    /** Whether a point of the map (map pixels) is on the deck of a bridge. */
    public isBridgeAt(x: number, y: number): boolean {
        return this.bridges.size > 0 && this.bridges.has(`${Math.floor(x / TILE_PX)},${Math.floor(y / TILE_PX)}`);
    }

    /** The water of the last state as what walks sees it: none on the deck of a bridge. */
    public walkerSettledDepthAt(x: number, y: number): number {
        return this.isBridgeAt(x, y) ? 0 : this.settledDepthAt(x, y);
    }

    /** The part of the map the grid of the water covers, in map pixels. */
    public coveredArea(): { x: number; y: number; width: number; height: number } {
        return {
            x: this.grid.x * TERRAIN_CELL,
            y: this.grid.y * TERRAIN_CELL,
            width: this.grid.width * TERRAIN_CELL,
            height: this.grid.height * TERRAIN_CELL,
        };
    }

    /** Changes each time a state is received or the relief changes. */
    public version(): number {
        return this.changes;
    }

    /**
     * The water over the cells of a canvas (one pixel a cell of the relief, its corner at the cell `cellX`, `cellY`)
     * at this time of the game, written into `levels`: 0 where it is dry or under the thinnest water told (DRAWN_PX), else
     * its depth in pixels (1 to 255).
     * Returns whether there is any. One pass over the part of the grid the canvas shows, for a drawing made ten
     * times a second.
     */
    public levelsOver(
        cellX: number,
        cellY: number,
        columns: number,
        rows: number,
        now: number,
        levels: Uint8Array,
        /**
         * Truncated instead of rounded, for the relief in 3/4: water 15.7 px deep is drawn there as water one wades in,
         * as the walk reads it (one swims from SWIM_DEPTH_PX on).
         */
        floored = false,
    ): boolean {
        levels.fill(0);
        const share = this.share(now);
        const { from, to, grid } = this;
        const firstRow = Math.max(0, grid.y - cellY);
        const lastRow = Math.min(rows, grid.y + grid.height - cellY);
        const firstColumn = Math.max(0, grid.x - cellX);
        const lastColumn = Math.min(columns, grid.x + grid.width - cellX);
        let any = false;
        for (let row = firstRow; row < lastRow; row++) {
            const gridLine = (row + cellY - grid.y) * grid.width + (cellX - grid.x);
            const line = row * columns;
            for (let column = firstColumn; column < lastColumn; column++) {
                const start = from[gridLine + column];
                const depth = start + (to[gridLine + column] - start) * share;
                if (depth < DRAWN_PX) continue;
                levels[line + column] =
                    depth < 1 ? 1 : depth > 255 ? 255 : floored ? Math.floor(depth) : Math.round(depth);
                any = true;
            }
        }
        return any;
    }

    /** Changes when what is shown changed: the relief, a state, and five times a second while the water glides. */
    public drawKey(now: number): string {
        const gliding = now < this.at + this.glideMs() + GLIDE_DRAW_MS;
        // While it glides the water is drawn five times a second, however often the server tells it: a state
        // received does not ask for a drawing of its own.
        return gliding ? `${this.changes - this.states}:${Math.floor(now / GLIDE_DRAW_MS)}` : `${this.changes}`;
    }

    /**
     * The depth of the water over the cells of an area (`columns` × `rows` cells from the cell `cellX`, `cellY`) at
     * this time of the game, written into `depths`: its pixels as they are, however thin or deep; 0 where it is dry.
     * For the surface of the water seen in 3/4 (the levels of `levelsOver` stop at 255 px).
     */
    public depthsOver(
        cellX: number,
        cellY: number,
        columns: number,
        rows: number,
        now: number,
        depths: Float32Array,
    ): void {
        depths.fill(0);
        const share = this.share(now);
        const { from, to, grid } = this;
        const firstRow = Math.max(0, grid.y - cellY);
        const lastRow = Math.min(rows, grid.y + grid.height - cellY);
        const firstColumn = Math.max(0, grid.x - cellX);
        const lastColumn = Math.min(columns, grid.x + grid.width - cellX);
        for (let row = firstRow; row < lastRow; row++) {
            const gridLine = (row + cellY - grid.y) * grid.width + (cellX - grid.x);
            const line = row * columns;
            for (let column = firstColumn; column < lastColumn; column++) {
                const start = from[gridLine + column];
                depths[line + column] = start + (to[gridLine + column] - start) * share;
            }
        }
    }

    /**
     * How far the water has glided from the state before to the last one. The glide lasts as long as the server
     * took between the two (a second, or less on a map told more often, or under a wave): gliding for a second
     * to a state that came a fifth of a second after the one before would leave the water a second late.
     */
    private share(now: number): number {
        return Math.max(0, Math.min(1, (now - this.at) / this.glideMs()));
    }

    private glideMs(): number {
        return Math.min(WATER_MESSAGE_MS, Math.max(SHORTEST_GLIDE_MS, this.betweenMs));
    }
}
