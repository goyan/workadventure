import { poolBasins, reliefCells, TERRAIN_CELL, TILE_PX, WATER_MESSAGE_MS } from "@workadventure/map-editor";
import type { PoolStyle, TerrainData } from "@workadventure/map-editor";

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
}

/** A film of water thinner than this is not drawn: what a flood leaves behind would speckle the ground. */
const SHOWN_PX = 0.5;
/**
 * How often a gliding water asks to be drawn again: a level that creeps between two states of the server (a second
 * apart) shows as well at five drawings a second as at ten, and each drawing paints the whole view.
 */
const GLIDE_DRAW_MS = 200;
/** The shortest glide between two states: the server never tells the water more often than every step. */
const SHORTEST_GLIDE_MS = 100;

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
    private wet = false;
    private changes = 0;
    /** How many of those changes were states of the water received. */
    private states = 0;
    private bridges: ReadonlySet<string> = new Set();

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
        } else {
            // The first state, or another grid (the relief was edited): shown at once.
            this.from = to;
            this.at = -Infinity;
            this.before = to;
            this.betweenMs = Infinity;
        }
        this.receivedAt = now;
        this.to = to;
        this.grid = { x: state.x, y: state.y, width: state.width, height: state.height };
        this.bytes = bytes;
        this.seq = state.seq;
        this.wet = wet || this.from.some((depth) => depth > 0);
        this.changes++;
        this.states++;
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
     * this object: read, never written.
     */
    public settled(): SettledWater {
        return {
            ...this.grid,
            depths: this.to,
            before: this.before,
            seconds: this.betweenMs / 1000,
        };
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
     * at this time of the game, written into `levels`: 0 where it is dry or under a film too thin to be seen, else
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
                if (depth < SHOWN_PX) continue;
                levels[line + column] = depth < 1 ? 1 : depth > 255 ? 255 : Math.round(depth);
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
