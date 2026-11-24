/**
 * What a hurricane does to the water of the map, kept by this browser so that it can be seen and read: the water as
 * it stood when the hurricane began (each cell), the highest it has stood since, and what that leaves when it falls
 * back. From the states of the water the server sends (TerrainWater.settled), nothing more.
 *
 * - The rise: how much higher the water of a cell stands than before the hurricane (the floors badge reads it under
 *   the pointer, the panel of the hurricane its highest);
 * - the marks: where the water reached land that was dry before the hurricane and has drawn back since, the ground
 *   stays dark and drowned, and along the highest line it reached lies a wrack of foam and debris; both fade in
 *   FLOOD_MARKS_MS after the water has drawn back.
 */

/** A cell holds water over this depth (map pixels): under it, a wet film. */
export const FLOOD_WET_PX = 0.5;
/** The marks a flood leaves fade over this long once the water has drawn back (ms). */
export const FLOOD_MARKS_MS = 4 * 60_000;
/** What a hurricane leaves is forgotten this long after it ended (ms): its marks have faded by then. */
export const FLOOD_KEPT_MS = FLOOD_MARKS_MS + 60_000;

/** The water of a grid of cells as the server sends it: its rectangle (cells) and the depth over each (map px). */
export interface FloodWater {
    x: number;
    y: number;
    width: number;
    height: number;
    depths: Float32Array;
}

/** A mark a flood left on a cell, and how strongly it shows still (1 when the water has just drawn back). */
export interface FloodMark {
    cellX: number;
    cellY: number;
    /** "drowned": land the water covered, dry again; "wrack": on the highest line the water reached. */
    kind: "drowned" | "wrack";
    strength: number;
}

export class HurricaneFlood {
    private grid: { x: number; y: number; width: number; height: number } | undefined;
    /** The depth of each cell when the hurricane began, the highest since, and when the water left it (ms; 0: wet). */
    private before = new Float32Array(0);
    private highest = new Float32Array(0);
    private drewBack = new Float64Array(0);
    private highestRise = 0;
    private endedAt: number | undefined;

    /** A hurricane begins: the water as it stands now is what the rise is counted from. */
    public begin(water: FloodWater): void {
        const size = water.width * water.height;
        this.grid = { x: water.x, y: water.y, width: water.width, height: water.height };
        this.before = Float32Array.from(water.depths.subarray(0, size));
        this.highest = Float32Array.from(this.before);
        this.drewBack = new Float64Array(size);
        this.highestRise = 0;
        this.endedAt = undefined;
    }

    /** The hurricane ended (or is gone): its marks fade, then it is forgotten. */
    public end(now: number): void {
        if (this.grid && this.endedAt === undefined) this.endedAt = now;
    }

    /** Whether a hurricane is followed (going, or its marks still showing). */
    public following(now: number): boolean {
        if (!this.grid) return false;
        if (this.endedAt !== undefined && now - this.endedAt > FLOOD_KEPT_MS) {
            this.grid = undefined;
            return false;
        }
        return true;
    }

    /**
     * A new state of the water: the highest each cell has stood at, and when the water left land it had covered.
     * A grid that changed size starts afresh (the map changed under it).
     */
    public observe(water: FloodWater, now: number): void {
        const grid = this.grid;
        if (!grid) return;
        if (grid.x !== water.x || grid.y !== water.y || grid.width !== water.width || grid.height !== water.height) {
            this.begin(water);
            return;
        }
        const size = grid.width * grid.height;
        const going = this.endedAt === undefined;
        for (let index = 0; index < size; index++) {
            const depth = water.depths[index];
            if (going && depth > this.highest[index]) this.highest[index] = depth;
            if (going && depth - this.before[index] > this.highestRise) this.highestRise = depth - this.before[index];
            const flooded = this.before[index] < FLOOD_WET_PX && this.highest[index] >= FLOOD_WET_PX;
            if (!flooded) continue;
            if (depth >= FLOOD_WET_PX) this.drewBack[index] = 0;
            else if (this.drewBack[index] === 0) this.drewBack[index] = now;
        }
    }

    /** How much higher the water stands over the cell than before the hurricane (map px); undefined if not followed. */
    public riseAt(cellX: number, cellY: number, depthNow: number): number | undefined {
        const index = this.indexOf(cellX, cellY);
        return index === undefined ? undefined : depthNow - this.before[index];
    }

    /** The most the water has risen over a cell of the map since the hurricane began (map px). */
    public highestRisePx(): number {
        return this.grid ? this.highestRise : 0;
    }

    /**
     * The marks the flood leaves now: the land it covered that is dry again, and the highest line it reached there
     * (a drowned cell next to one the water never reached), each fading over FLOOD_MARKS_MS from when the water
     * drew back from it.
     */
    public marks(now: number): FloodMark[] {
        const grid = this.grid;
        if (!grid) return [];
        const { width, height } = grid;
        const marks: FloodMark[] = [];
        // Off the grid is not land the water stopped short of: no line drawn along the edge of the grid.
        const reached = (column: number, row: number): boolean =>
            column < 0 ||
            row < 0 ||
            column >= width ||
            row >= height ||
            this.highest[row * width + column] >= FLOOD_WET_PX;
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                const index = row * width + column;
                const left = this.drewBack[index];
                if (left === 0) continue;
                const strength = 1 - (now - left) / FLOOD_MARKS_MS;
                if (!(strength > 0)) continue;
                const edge =
                    !reached(column - 1, row) ||
                    !reached(column + 1, row) ||
                    !reached(column, row - 1) ||
                    !reached(column, row + 1);
                marks.push({
                    cellX: column + grid.x,
                    cellY: row + grid.y,
                    kind: edge ? "wrack" : "drowned",
                    strength: Math.min(1, strength),
                });
            }
        }
        return marks;
    }

    private indexOf(cellX: number, cellY: number): number | undefined {
        const grid = this.grid;
        if (!grid) return undefined;
        const column = cellX - grid.x;
        const row = cellY - grid.y;
        if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) return undefined;
        return row * grid.width + column;
    }
}
