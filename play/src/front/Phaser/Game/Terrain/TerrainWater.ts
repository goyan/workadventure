import { dugCells, TERRAIN_CELL, WATER_MESSAGE_MS } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

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

/** A film of water thinner than this is not drawn: what a flood leaves behind would speckle the ground. */
const SHOWN_PX = 0.5;
/** How often a gliding water asks to be drawn again. */
const GLIDE_DRAW_MS = 100;

/**
 * The water of the relief as this browser shows it: the depth of the water over each cell of the grid the server
 * simulates. The server alone computes it and tells what changed once a second; between two states the water
 * glides, so a lake never jumps.
 */
export class TerrainWater {
    private terrain: TerrainData | undefined;
    private dug = false;
    private grid = { x: 0, y: 0, width: 0, height: 0 };
    /** The last state received, as bytes: the next change applies to it. */
    private bytes: Uint8Array | undefined;
    private seq: number | undefined;
    /** The water glides from `from` to `to`, from `at` on. */
    private from = new Float32Array(0);
    private to = new Float32Array(0);
    private at = -Infinity;
    private wet = false;
    private changes = 0;

    /** The relief of the map, as it is now (drawn with the water). */
    public setTerrain(terrain: TerrainData | undefined): void {
        if (terrain === this.terrain) return;
        this.terrain = terrain;
        this.dug = dugCells(terrain).size > 0;
        this.changes++;
    }

    /** The relief the water was last given. */
    public relief(): TerrainData | undefined {
        return this.terrain;
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
            // From where the water is shown now.
            const shown = new Float32Array(cells);
            const share = this.share(now);
            for (let index = 0; index < cells; index++) {
                shown[index] = this.from[index] + (this.to[index] - this.from[index]) * share;
            }
            this.from = shown;
            this.at = now;
        } else {
            // The first state, or another grid (the relief was edited): shown at once.
            this.from = to;
            this.at = -Infinity;
        }
        this.to = to;
        this.grid = { x: state.x, y: state.y, width: state.width, height: state.height };
        this.bytes = bytes;
        this.seq = state.seq;
        this.wet = wet || this.from.some((depth) => depth > 0);
        this.changes++;
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

    /** Changes when what is shown changed: the relief, a state, and ten times a second while the water glides. */
    public drawKey(now: number): string {
        const gliding = now < this.at + WATER_MESSAGE_MS + GLIDE_DRAW_MS;
        return gliding ? `${this.changes}:${Math.floor(now / GLIDE_DRAW_MS)}` : `${this.changes}`;
    }

    private share(now: number): number {
        return Math.max(0, Math.min(1, (now - this.at) / WATER_MESSAGE_MS));
    }
}
