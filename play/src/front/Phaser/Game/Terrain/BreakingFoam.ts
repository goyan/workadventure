import { cellKey, cellOf, heightAt, steadyFlowSpeed, TERRAIN_CHUNK, waveSpeed } from "@workadventure/map-editor";
import type { TerrainData, WaterWallSides } from "@workadventure/map-editor";
import type { SettledWater } from "./TerrainWater";

/** Water thinner than this is a film: it neither breaks nor makes a front. */
const WET_PX = 0.5;
/**
 * A wave breaks when it is high for the water it runs in: its height (how far its surface stands over the lowest
 * water a few cells around) over the depth of that trough. Under the first share it is a swell, however high over
 * deep water (the long wave of an impact at sea: no foam); from the second on it is all foam: 0.78, the height at
 * which a wave breaks in shallow water (McCowan). So a swell starts foaming as the bottom rises under it.
 */
export const BREAKING_FROM = 0.3;
export const BREAKING_FULL = 0.78;
/** How far around a cell the trough of its wave is looked for, in cells (about a metre and a half). */
const TROUGH_REACH = 3;
/** A wave lower than this, in pixels (10 cm), is a ripple: it makes no foam. */
const LOWEST_WAVE_PX = 3;
/** A wave this high, in pixels (40 cm), makes all the foam its steepness asks for; a lower one, less of it. */
const FULL_WAVE_PX = 12;
/** The front of a flood: a cell that was dry and now holds this much water, come from a neighbour already wet. */
const FRONT_PX = 1;
const NEIGHBOUR_WET_PX = 2;
/**
 * White water: water that falls down a slope faster than its own waves run (a torrent down a steep bank, a
 * waterfall; the ratio of the two speeds is its Froude number). Foam from this ratio on, all of it at the second.
 * Water that creeps down the same slope makes none: the slope of the ground is not a wave.
 */
const RAPID_FROM = 1;
const RAPID_FULL = 2;
/** The foam left behind fades by half in this long, in ms. */
export const FOAM_HALF_LIFE_MS = 1800;
/** Foam fainter than this is gone. */
const GONE = 0.04;
/** The foam of a state comes in no longer than this, in ms: the longest the water takes to glide to a state. */
const LONGEST_RISE_MS = 1000;

/**
 * Whether the water cannot go from a cell of the map to its neighbour on a side: 0 east, 1 west, 2 south, 3 north.
 * With the walls it was made of (closedSidesOf): the foam reads them once a map, wall by wall.
 */
export type ClosedSide = ((cellX: number, cellY: number, side: number) => boolean) & {
    readonly walls?: WaterWallSides;
};

/** The sides the walls of a map close (and its doors, taken closed), as foamOfCell asks for them. */
export function closedSidesOf(walls: WaterWallSides): ClosedSide {
    const closed = (cellX: number, cellY: number, side: number): boolean =>
        side === 0
            ? walls.east.has(cellKey(cellX, cellY))
            : side === 1
              ? walls.east.has(cellKey(cellX - 1, cellY))
              : side === 2
                ? walls.south.has(cellKey(cellX, cellY))
                : walls.south.has(cellKey(cellX, cellY - 1));
    return Object.assign(closed, { walls });
}

/**
 * How much foam the water of a cell makes in this state, from 0 to 1: where a wave breaks (high for the water it
 * runs in: near the shores, over a shoal, where the rim of an impact falls back), where the water rushes (faster
 * than its own waves: a torrent down a steep slope, a waterfall), and at the front of a flood that reaches dry
 * ground. None on a swell over deep water, however high, nor on water that rises evenly (rain filling a pond),
 * nor on a sheet that creeps down a slope (the slope of the ground is not a wave), nor between two waters a wall
 * keeps at two levels (`closed`: the sides the water cannot cross).
 */
export function foamOfCell(
    water: SettledWater,
    terrain: TerrainData | undefined,
    column: number,
    row: number,
    closed?: ClosedSide,
): number {
    const { width, height, depths, before } = water;
    if (column < 0 || row < 0 || column >= width || row >= height) return 0;
    const index = row * width + column;
    const depth = depths[index];
    if (depth < WET_PX) return 0;
    const bed = heightAt(terrain, water.x + column, water.y + row);
    const surface = bed + depth;
    const timed = before.length === depths.length && Number.isFinite(water.seconds);
    // The front of a flood: dry a state ago, wet now, next to water that was already there.
    const arrived = timed && before[index] < WET_PX && depth >= FRONT_PX;
    // The lowest water around: the trough of the wave this cell is the crest of, if it is one.
    let trough = surface;
    let fed = false;
    // How far the surface drops to the next cell, at most (the slope the water runs down), and to the lowest water
    // it falls to.
    let drop = 0;
    let fall = 0;
    for (let side = 0; side < 4; side++) {
        const stepColumn = side === 0 ? 1 : side === 1 ? -1 : 0;
        const stepRow = side === 2 ? 1 : side === 3 ? -1 : 0;
        for (let away = 1; away <= TROUGH_REACH; away++) {
            const otherColumn = column + stepColumn * away;
            const otherRow = row + stepRow * away;
            if (otherColumn < 0 || otherRow < 0 || otherColumn >= width || otherRow >= height) break;
            // A wall ends the water that way: what stands behind it is another water, at its own level.
            if (closed?.(water.x + otherColumn - stepColumn, water.y + otherRow - stepRow, side)) break;
            const other = otherRow * width + otherColumn;
            if (away === 1 && arrived && before[other] >= NEIGHBOUR_WET_PX) fed = true;
            // Dry ground ends the water that way: a bank is not a trough.
            if (depths[other] < WET_PX) break;
            const otherSurface = heightAt(terrain, water.x + otherColumn, water.y + otherRow) + depths[other];
            if (away === 1 && surface - otherSurface > drop) drop = surface - otherSurface;
            if (surface - otherSurface > fall) fall = surface - otherSurface;
            // Water lower than the ground of this cell is water it runs down to, not the trough of a wave it
            // stands in: the slope of the ground is not a wave.
            if (otherSurface < bed) break;
            if (otherSurface < trough) trough = otherSurface;
        }
    }
    const wave = surface - trough;
    // The water left under the trough, where the wave runs: never less than a film.
    const under = Math.max(WET_PX, depth - wave);
    const high = wave >= LOWEST_WAVE_PX ? wave / under : 0;
    // A low wave that breaks in a film of water leaves a little foam, a high one a lot.
    const size = Math.max(0, Math.min(1, (wave - LOWEST_WAVE_PX) / (FULL_WAVE_PX - LOWEST_WAVE_PX)));
    const breaking =
        Math.max(0, Math.min(1, (high - BREAKING_FROM) / (BREAKING_FULL - BREAKING_FROM))) * (0.3 + 0.7 * size);
    // White water: water that falls as high as a wave that would foam, and runs faster than its own waves: as fast
    // as the server tells it runs; where it tells none (a water without inertia), as fast as it runs down the slope
    // of its surface.
    let rapid = 0;
    if (fall >= LOWEST_WAVE_PX) {
        const told = water.speedAt?.(water.x + column, water.y + row);
        const speed = told ? Math.hypot(told.x, told.y) : steadyFlowSpeed(drop, depth, false);
        const waves = waveSpeed(depth);
        const rush = waves > 0 ? speed / waves : 0;
        const fallen = Math.max(0, Math.min(1, (fall - LOWEST_WAVE_PX) / (FULL_WAVE_PX - LOWEST_WAVE_PX)));
        rapid = Math.max(0, Math.min(1, (rush - RAPID_FROM) / (RAPID_FULL - RAPID_FROM))) * (0.3 + 0.7 * fallen);
    }
    const made = Math.max(breaking, rapid);
    return arrived && fed ? Math.max(made, 0.6) : made;
}

/**
 * What a cell costs to read for its foam, in visits of cells: 1 to look at it (dry, or still: its foam is known), and
 * one more for each cell its wave is looked for in (four ways, TROUGH_REACH cells each) when it is worked out again.
 */
export const FOAM_LOOK_VISITS = 1;
export const FOAM_WORK_VISITS = 1 + 4 * TROUGH_REACH;
/**
 * The foam of a state is worked out over several images, no more than this many visits an image (BreakingFoam.advance):
 * measured at 1.8 ms an image at most on the map of Antoine in flood (153 600 cells, 85 000 under water, under fast
 * water), 13 to 28 images a state.
 */
export const FOAM_VISITS_PER_FRAME = 120_000;

/** The ground of the grid as the foam reads it, once a map: the bed of each cell, and the sides its walls close. */
interface FoamGround {
    x: number;
    y: number;
    width: number;
    height: number;
    terrain: TerrainData | undefined;
    closed: ClosedSide | undefined;
    beds: Float32Array;
    /** Bit 1 << side set where the water cannot go from this cell to its neighbour on that side. */
    walls: Uint8Array;
}

function groundOf(water: SettledWater, terrain: TerrainData | undefined, closed: ClosedSide | undefined): FoamGround {
    const { x, y, width, height } = water;
    const beds = new Float32Array(width * height);
    const walls = new Uint8Array(width * height);
    // The bed of each cell, chunk by chunk of the relief (as heightAt reads it, flat where there is none).
    for (const [key, chunk] of Object.entries(terrain?.chunks ?? {})) {
        const origin = cellOf(key);
        for (let at = 0; at < chunk.length; at++) {
            const column = origin.x * TERRAIN_CHUNK + (at % TERRAIN_CHUNK) - x;
            const row = origin.y * TERRAIN_CHUNK + Math.floor(at / TERRAIN_CHUNK) - y;
            if (column >= 0 && row >= 0 && column < width && row < height) beds[row * width + column] = chunk[at] ?? 0;
        }
    }
    // A wall on the east side of a cell closes it to the east, and its neighbour there to the west; the same south.
    const close = (cellX: number, cellY: number, side: number): void => {
        const column = cellX - x;
        const row = cellY - y;
        if (column >= 0 && row >= 0 && column < width && row < height) walls[row * width + column] |= 1 << side;
    };
    if (closed?.walls) {
        for (const key of closed.walls.east) {
            const cell = cellOf(key);
            close(cell.x, cell.y, 0);
            close(cell.x + 1, cell.y, 1);
        }
        for (const key of closed.walls.south) {
            const cell = cellOf(key);
            close(cell.x, cell.y, 2);
            close(cell.x, cell.y + 1, 3);
        }
    } else if (closed) {
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                for (let side = 0; side < 4; side++)
                    if (closed(x + column, y + row, side)) close(x + column, y + row, side);
            }
        }
    }
    return { x, y, width, height, terrain, closed, beds, walls };
}

/** A state of the water whose foam is being worked out, from `now` (ms) on, rising for `rise` ms. */
interface FoamJob {
    water: SettledWater;
    ground: FoamGround;
    now: number;
    rise: number;
    timed: boolean;
    /** The cells to work out again (their water or the water around them moved); undefined: all of them. */
    moved: Uint8Array | undefined;
    /** The depths the waves kept were worked out from, compared cell by cell first (the next cell to compare). */
    basis: Float32Array | undefined;
    compared: number;
    strongest: number;
}

/**
 * The foam of the waves of the water of the relief, as this browser draws it: born where a wave breaks or a flood
 * advances, it stays a moment behind the wave and fades. Read from the depths the server already sends; each
 * browser makes its own, a decor.
 *
 * The foam of a state does not come at once: the water is shown gliding from the state before to this one, and its
 * foam rises along with it, over the time between the two states. So a wave that breaks all along makes the same
 * foam, steadily, whether the water is told once or five times a second; told at once, it came in puffs.
 *
 * Working it out took a tenth of a second at each state on a large map, all at once: an image that long, every
 * second, for every player. It is now worked out over the images that follow a state (begin, then advance at each
 * image, FOAM_VISITS_PER_FRAME at most), cell after cell, and only where the water moved: a cell whose water and
 * whose water around, as far as its wave is looked for, stayed the same keeps the wave it had; the bed of each cell
 * and the walls are read once a map. A cell not yet reached shows the foam of the state before; reached, its new
 * foam glides on from what it showed then.
 */
export class BreakingFoam {
    /** The foam shown when the last state came, and the foam that state makes: the one glides to the other. */
    private from = new Float32Array(0);
    private to = new Float32Array(0);
    private grid = { x: 0, y: 0, width: 0, height: 0 };
    /**
     * When each cell took the foam of its state (ms), and how long that foam rises: a cell is worked out a few images
     * after its state came, and glides on from the foam it showed then, so that it never jumps.
     */
    private cellAt = new Float64Array(0);
    private cellRise = new Float32Array(0);
    /** When the last state was begun, the latest time a cell took its foam, and the longest rise of a foam. */
    private startedAt = 0;
    private latestAt = 0;
    private longestRise = 0;
    private strongest = 0;
    private ground: FoamGround | undefined;
    /** The wave of each cell when last worked out: how high it breaks, how far its water falls and drops. */
    private breaking = new Float32Array(0);
    private fall = new Float32Array(0);
    private drop = new Float32Array(0);
    /** The depths the waves above were worked out from; undefined: none yet. */
    private basis: Float32Array | undefined;
    private job: FoamJob | undefined;
    /** The next cell of the job. */
    private cursor = 0;
    /** The last state that came while a job was going on: worked out next. */
    private waiting:
        | { water: SettledWater; terrain: TerrainData | undefined; now: number; closed?: ClosedSide }
        | undefined;
    /** The cells visited by the last advance (the test of its budget). */
    public lastVisits = 0;

    /** A new state of the water at this time (ms): its foam, worked out at once (the tests). */
    public absorb(water: SettledWater, terrain: TerrainData | undefined, now: number, closed?: ClosedSide): void {
        this.begin(water, terrain, now, closed);
        while (this.job) this.advance(Number.POSITIVE_INFINITY);
    }

    /**
     * A new state of the water at this time (ms): its foam is worked out over the next images (advance). Another
     * state coming meanwhile waits for the one under way; only the last one waits.
     */
    public begin(water: SettledWater, terrain: TerrainData | undefined, now: number, closed?: ClosedSide): void {
        if (this.job) {
            this.waiting = { water, terrain, now, ...(closed ? { closed } : {}) };
            return;
        }
        this.start(water, terrain, now, closed);
    }

    /**
     * Works on the foam of the state under way, `budget` visits of cells at most (one cell at least), at this time
     * (ms): a state that waited starts now, not when it came, so that its foam rises from where it is worked out.
     */
    public advance(budget: number = FOAM_VISITS_PER_FRAME, now?: number): void {
        let visits = 0;
        while (this.job) {
            const job = this.job;
            const worked = Math.max(job.now, now ?? job.now);
            if (worked > this.latestAt) this.latestAt = worked;
            const size = job.water.width * job.water.height;
            // First where the water moved since the waves kept were worked out, then the foam cell by cell.
            while (job.compared < size) {
                const cost = compareCost(job, job.compared);
                if (visits > 0 && visits + cost > budget) {
                    this.lastVisits = visits;
                    return;
                }
                markMoved(job, job.compared);
                visits += cost;
                job.compared++;
            }
            while (this.cursor < size) {
                const cost = this.costOf(job, this.cursor);
                if (visits > 0 && visits + cost > budget) {
                    this.lastVisits = visits;
                    return;
                }
                this.work(job, this.cursor, worked);
                visits += cost;
                this.cursor++;
            }
            this.finish(job);
            const waiting = this.waiting;
            this.waiting = undefined;
            if (waiting) {
                this.start(waiting.water, waiting.terrain, Math.max(waiting.now, now ?? waiting.now), waiting.closed);
            }
        }
        this.lastVisits = visits;
    }

    /** Whether a state's foam is still being worked out. */
    public working(): boolean {
        return this.job !== undefined;
    }

    /** Whether any foam is left to draw at this time (as if the strongest foam had taken its state the latest). */
    public active(now: number): boolean {
        return this.strongest * this.fade(Math.max(0, now - this.latestAt - this.longestRise)) >= GONE;
    }

    /** The foam over a cell of the map at this time, from 0 to 1. */
    public foamAt(cellX: number, cellY: number, now: number): number {
        const column = cellX - this.grid.x;
        const row = cellY - this.grid.y;
        if (column < 0 || row < 0 || column >= this.grid.width || row >= this.grid.height) return 0;
        const index = row * this.grid.width + column;
        return this.shown(
            this.from[index],
            this.to[index],
            Math.max(0, now - this.cellAt[index]),
            this.cellRise[index],
        );
    }

    /** The foam the last state worked out makes over a cell, from 0 to 1 (before it fades). */
    public madeAt(cellX: number, cellY: number): number {
        const column = cellX - this.grid.x;
        const row = cellY - this.grid.y;
        if (column < 0 || row < 0 || column >= this.grid.width || row >= this.grid.height) return 0;
        return this.to[row * this.grid.width + column];
    }

    public clear(): void {
        this.from.fill(0);
        this.to.fill(0);
        this.strongest = 0;
        this.job = undefined;
        this.waiting = undefined;
        this.basis = undefined;
    }

    private start(water: SettledWater, terrain: TerrainData | undefined, now: number, closed?: ClosedSide): void {
        const size = water.width * water.height;
        const same =
            water.x === this.grid.x &&
            water.y === this.grid.y &&
            water.width === this.grid.width &&
            water.height === this.grid.height &&
            this.from.length === size;
        if (!same) {
            this.from = new Float32Array(size);
            this.to = new Float32Array(size);
            this.breaking = new Float32Array(size);
            this.fall = new Float32Array(size);
            this.drop = new Float32Array(size);
            this.cellAt = new Float64Array(size);
            this.cellRise = new Float32Array(size);
            this.grid = { x: water.x, y: water.y, width: water.width, height: water.height };
            this.strongest = 0;
            this.basis = undefined;
        }
        let ground = this.ground;
        if (
            !ground ||
            !same ||
            ground.terrain !== terrain ||
            ground.closed !== closed ||
            ground.x !== water.x ||
            ground.y !== water.y
        ) {
            ground = groundOf(water, terrain, closed);
            this.ground = ground;
            this.basis = undefined;
        }
        // The first state of a grid is shown at once, as its water is; the next ones are glided to, over the time
        // since the state before was (a state that came while another was worked out waited: it glides that long).
        const rise =
            same && Number.isFinite(water.seconds)
                ? Math.min(LONGEST_RISE_MS, Math.max(water.seconds * 1000, now - this.startedAt))
                : 0;
        this.startedAt = now;
        if (rise > this.longestRise) this.longestRise = rise;
        this.job = {
            water,
            ground,
            now,
            rise,
            timed: water.before.length === water.depths.length && Number.isFinite(water.seconds),
            moved: this.basis ? new Uint8Array(size) : undefined,
            basis: this.basis,
            compared: this.basis ? 0 : size,
            strongest: 0,
        };
        this.cursor = 0;
    }

    private finish(job: FoamJob): void {
        this.job = undefined;
        // Every cell has taken the foam of this state: the strongest of it is all there is.
        this.strongest = job.strongest;
        this.basis = Float32Array.from(job.water.depths);
    }

    /** What working on a cell costs, in visits. */
    private costOf(job: FoamJob, index: number): number {
        const depth = job.water.depths[index];
        if (depth < WET_PX) return FOAM_LOOK_VISITS;
        return this.needsWork(job, index, depth) ? FOAM_WORK_VISITS : FOAM_LOOK_VISITS;
    }

    private needsWork(job: FoamJob, index: number, depth: number): boolean {
        if (!job.moved || job.moved[index] === 1) return true;
        // The front of a flood looks at what was around it a state ago.
        return job.timed && job.water.before[index] < WET_PX && depth >= FRONT_PX;
    }

    /** The foam a cell makes in the state of the job, and what it shows from then on. */
    private work(job: FoamJob, index: number, now: number): void {
        const { water, ground } = job;
        const depth = water.depths[index];
        // What the cell shows now, of the foam of the state before: the foam of this state glides on from it.
        const shown = this.shown(
            this.from[index],
            this.to[index],
            Math.max(0, now - this.cellAt[index]),
            this.cellRise[index],
        );
        this.cellAt[index] = now;
        this.cellRise[index] = job.rise;
        // Dry cells are most of a map: nothing to look at there, and no foam is left on dry ground.
        if (depth < WET_PX) {
            this.from[index] = 0;
            this.to[index] = 0;
            this.breaking[index] = 0;
            this.fall[index] = 0;
            this.drop[index] = 0;
            return;
        }
        const width = water.width;
        const column = index % width;
        const row = (index - column) / width;
        let fed = false;
        if (this.needsWork(job, index, depth)) fed = this.waveOf(water, ground, index, column, row, depth, job.timed);
        const fall = this.fall[index];
        let rapid = 0;
        if (fall >= LOWEST_WAVE_PX) {
            const told = water.speedAt?.(water.x + column, water.y + row);
            const speed = told ? Math.hypot(told.x, told.y) : steadyFlowSpeed(this.drop[index], depth, false);
            const waves = waveSpeed(depth);
            const rush = waves > 0 ? speed / waves : 0;
            const fallen = Math.max(0, Math.min(1, (fall - LOWEST_WAVE_PX) / (FULL_WAVE_PX - LOWEST_WAVE_PX)));
            rapid = Math.max(0, Math.min(1, (rush - RAPID_FROM) / (RAPID_FULL - RAPID_FROM))) * (0.3 + 0.7 * fallen);
        }
        const madeHere = Math.max(this.breaking[index], rapid);
        const made = fed ? Math.max(madeHere, 0.6) : madeHere;
        const from = job.rise > 0 ? shown : Math.max(shown, made);
        const to = made < GONE ? 0 : made;
        this.from[index] = from;
        this.to[index] = to;
        if (from > job.strongest) job.strongest = from;
        if (to > job.strongest) job.strongest = to;
        if (job.strongest > this.strongest) this.strongest = job.strongest;
    }

    /**
     * The wave of a cell, as foamOfCell reads it (the bed and the walls from the ground of the grid): kept for the
     * states where nothing around it moves. Whether it is the front of a flood fed by water already there.
     */
    private waveOf(
        water: SettledWater,
        ground: FoamGround,
        index: number,
        column: number,
        row: number,
        depth: number,
        timed: boolean,
    ): boolean {
        const { width, height, depths, before } = water;
        const { beds, walls } = ground;
        const bed = beds[index];
        const surface = bed + depth;
        const arrived = timed && before[index] < WET_PX && depth >= FRONT_PX;
        let trough = surface;
        let fed = false;
        let drop = 0;
        let fall = 0;
        for (let side = 0; side < 4; side++) {
            const stepColumn = side === 0 ? 1 : side === 1 ? -1 : 0;
            const stepRow = side === 2 ? 1 : side === 3 ? -1 : 0;
            const step = stepRow * width + stepColumn;
            for (let away = 1; away <= TROUGH_REACH; away++) {
                const otherColumn = column + stepColumn * away;
                const otherRow = row + stepRow * away;
                if (otherColumn < 0 || otherRow < 0 || otherColumn >= width || otherRow >= height) break;
                const other = index + step * away;
                // A wall ends the water that way: what stands behind it is another water, at its own level.
                if ((walls[other - step] & (1 << side)) !== 0) break;
                if (away === 1 && arrived && before[other] >= NEIGHBOUR_WET_PX) fed = true;
                // Dry ground ends the water that way: a bank is not a trough.
                if (depths[other] < WET_PX) break;
                const otherSurface = beds[other] + depths[other];
                if (away === 1 && surface - otherSurface > drop) drop = surface - otherSurface;
                if (surface - otherSurface > fall) fall = surface - otherSurface;
                // Water lower than the ground of this cell is water it runs down to: the slope is not a wave.
                if (otherSurface < bed) break;
                if (otherSurface < trough) trough = otherSurface;
            }
        }
        const wave = surface - trough;
        const under = Math.max(WET_PX, depth - wave);
        const high = wave >= LOWEST_WAVE_PX ? wave / under : 0;
        const size = Math.max(0, Math.min(1, (wave - LOWEST_WAVE_PX) / (FULL_WAVE_PX - LOWEST_WAVE_PX)));
        this.breaking[index] =
            Math.max(0, Math.min(1, (high - BREAKING_FROM) / (BREAKING_FULL - BREAKING_FROM))) * (0.3 + 0.7 * size);
        this.fall[index] = fall;
        this.drop[index] = drop;
        return arrived && fed;
    }

    /**
     * The foam of a cell `elapsed` ms after its state came, that state rising for `rise` ms: what was there fades,
     * and what that state makes comes in as the water glides to it, then fades in its turn. The stronger of the two.
     */
    private shown(from: number, to: number, elapsed: number, rise: number): number {
        if (from <= 0 && to <= 0) return 0;
        const left = from * this.fade(elapsed);
        const come = elapsed >= rise ? to * this.fade(elapsed - rise) : from + ((to - from) * elapsed) / rise;
        const held = left > come ? left : come;
        return held < GONE ? 0 : held;
    }

    /** What is left of a foam after this long: half of it every FOAM_HALF_LIFE_MS. */
    private fade(elapsed: number): number {
        return Math.pow(0.5, elapsed / FOAM_HALF_LIFE_MS);
    }
}

/** What comparing a cell with the state before costs, in visits: one more for each cell it marks when it moved. */
function compareCost(job: FoamJob, index: number): number {
    return job.basis && job.basis[index] !== job.water.depths[index] ? 1 + 4 * TROUGH_REACH : 1;
}

/**
 * Marks the cells whose wave may have changed because this one moved: itself, and those that look as far as
 * TROUGH_REACH cells along a row or a column for their wave, onto it.
 */
function markMoved(job: FoamJob, index: number): void {
    const { moved, basis, water } = job;
    if (!moved || !basis || basis[index] === water.depths[index]) return;
    const { width, height } = water;
    const column = index % width;
    const row = (index - column) / width;
    const right = Math.min(width - 1, column + TROUGH_REACH);
    for (let other = Math.max(0, column - TROUGH_REACH); other <= right; other++) moved[row * width + other] = 1;
    const bottom = Math.min(height - 1, row + TROUGH_REACH);
    for (let other = Math.max(0, row - TROUGH_REACH); other <= bottom; other++) moved[other * width + column] = 1;
}
