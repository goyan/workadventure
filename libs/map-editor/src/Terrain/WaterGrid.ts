import { TERRAIN_CHUNK } from "../types";
import type { TerrainData } from "../types";
import { CELL_AREA_M2, LITRES_PER_M3, metresOf } from "./Scale";
import { cellKey, cellOf, dugCells, heightAt } from "./TerrainGrid";

/** Litres over one cell of the relief under one pixel of water. */
export const CELL_LITRES_PER_PX = CELL_AREA_M2 * -metresOf(-1) * LITRES_PER_M3;
/** Flat ground simulated around the relief and the water objects, in cells: room for a flood to spread. */
export const WATER_GRID_MARGIN = 48;
/** The largest grid, in cells a side: beyond it the grid is cut around its middle. */
const MAX_GRID_SIDE = 600;
/**
 * The highest the surface of the water gets above the ground of the map, in pixels: just over the depth where an
 * avatar swims (16 px, about half a metre), so a flood makes one swim, and far under the first raised floor of a
 * building (52 px), so one keeps dry feet upstairs. What a source pours beyond it is lost, and so is what the rain
 * or the running water would pile over it.
 */
export const MAX_WATER_SURFACE_PX = 18;
/** Under this depth a cell is dry: the water left by rounding does not keep the grid moving. */
const DRY_PX = 0.01;
/**
 * The share of a difference of level that moves to a lower neighbour in one step. With four neighbours a quarter is
 * the edge of stability: a checkerboard of wet and dry cells flips at each step and never fades. A fifth damps it.
 */
const FLOW_SHARE = 0.2;
/**
 * How far around its foot a sink takes water when it says nothing, in cells (a tile and a half): it empties what is
 * next to it, and the water further away has to run to it. A sink never dries a lake from afar.
 */
const SINK_RADIUS_CELLS = 3;
/** The largest radius of a source or a sink, in cells (ten tiles), and the cells of the disc it then covers. */
const MAX_RADIUS_CELLS = 20;
const MAX_DISC_CELLS = (2 * MAX_RADIUS_CELLS + 1) ** 2;
/** A source pours its water of one step in parcels of this many pixels at least, and in this many parcels at most. */
const PARCEL_PX = 1;
const MAX_PARCELS = 256;
/** How far a parcel runs down in one step, in cells. */
const PARCEL_REACH_CELLS = 512;
/** The water a parcel leaves in each dry cell it runs through: the bed of a river is wet. */
const BED_FILM_PX = 2;
/** Two surfaces this close are level: the water of the one runs to a sink in the other. */
const LEVEL_PX = 0.05;

/**
 * The walls the water cannot cross, as sides of cells of the relief (keys of cellKey): `east` holds the cells whose
 * east side is a wall (between the cell and the next one of its row), `south` those whose south side is one.
 */
export interface WaterWallSides {
    east: ReadonlySet<string>;
    south: ReadonlySet<string>;
}

/** The most moves the water makes around a sink in one step. */
export const MAX_FLOW_STEPS = 16;
/** How far a cell exchanges water with another of its stretch, in cells, over long distances. */
const FAR_STRIDES = [4, 16];
/** A cell with less water than this breaks a stretch: a film over a sill does not join two lakes. */
const FAR_MIN_DEPTH_PX = 2;
/** The share of a difference of level two distant cells of a stretch exchange in a step. */
const FAR_SHARE = 0.25;
/** How far around the disc of a sink the water moves again during a step, in cells: eight tiles. */
const SINK_RUSH_CELLS = 16;

/** The cells a water grid covers, in cells of the relief. */
export interface WaterGridBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The cells to simulate for a map: its relief and its sources and sinks (which may stand on flat ground), with a
 * margin of flat ground around for a flood to spread. Undefined for a map without any: nothing to simulate.
 */
export function gridBoundsOf(
    terrain: TerrainData | undefined,
    objects: readonly { cellX: number; cellY: number }[],
): WaterGridBounds | undefined {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const include = (x: number, y: number): void => {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
    };
    for (const key of Object.keys(terrain?.chunks ?? {})) {
        const { x, y } = cellOf(key);
        include(x * TERRAIN_CHUNK, y * TERRAIN_CHUNK);
        include(x * TERRAIN_CHUNK + TERRAIN_CHUNK - 1, y * TERRAIN_CHUNK + TERRAIN_CHUNK - 1);
    }
    // The chunks are coarser than the relief: the dug cells themselves, when there are few.
    const dug = dugCells(terrain);
    if (dug.size > 0) {
        left = top = Infinity;
        right = bottom = -Infinity;
        for (const key of dug.keys()) {
            const { x, y } = cellOf(key);
            include(x, y);
        }
    }
    for (const object of objects) include(object.cellX, object.cellY);
    if (!Number.isFinite(left)) return undefined;
    let width = right - left + 1 + 2 * WATER_GRID_MARGIN;
    let height = bottom - top + 1 + 2 * WATER_GRID_MARGIN;
    let x = left - WATER_GRID_MARGIN;
    let y = top - WATER_GRID_MARGIN;
    if (width > MAX_GRID_SIDE) {
        x += Math.floor((width - MAX_GRID_SIDE) / 2);
        width = MAX_GRID_SIDE;
    }
    if (height > MAX_GRID_SIDE) {
        y += Math.floor((height - MAX_GRID_SIDE) / 2);
        height = MAX_GRID_SIDE;
    }
    return { x, y, width, height };
}

/** What happens to the water during one step, in pixels of water over one cell each. */
export interface WaterStepInput {
    /** Rain falling on each dug cell (the runoff of the ground around included). */
    rainPx: number;
    /** Water lost by each wet cell in dry weather. */
    evaporationPx: number;
    /** Water the flat ground drinks from each wet cell that is not dug. */
    absorptionPx: number;
    /**
     * Sources (positive) and sinks (negative), each at a cell of the map. `radius` is the disc, in cells, a source
     * pours over (its cell only when absent) or a sink takes from (a tile and a half when absent).
     */
    flows: readonly { cellX: number; cellY: number; px: number; radius?: number }[];
    /**
     * How many times the water moves towards a sink that asks for more than it finds, during the step (1 when
     * absent, MAX_FLOW_STEPS at most): more on a map whose water goes faster than reality, so that it runs to the
     * sink as far as the step is long.
     */
    flowSteps?: number;
}

/** What came in and went out during one step, in pixels of water over one cell (CELL_LITRES_PER_PX litres each). */
export interface WaterTally {
    rainPx: number;
    sourcesPx: number;
    sinksPx: number;
    evaporationPx: number;
    absorptionPx: number;
    /** Water that left by the edge of the grid, or poured beyond the deepest water a cell holds. */
    lostPx: number;
    /** Whether any water moved or changed: a grid at rest needs no step. */
    moved: boolean;
}

/**
 * The water of a map, cell by cell: each cell has a depth of water, and at each step water moves from a cell to its
 * neighbours whose surface (ground and water) is lower. So a source makes a pool at its foot that runs down the
 * slope, a full hollow spills over its lowest edge, and a flood rises and advances on flat ground while water comes.
 * Blocked cells (walls) hold no water and let none through. Water reaching the edge of the grid is lost.
 *
 * The same code runs on the server, which alone decides, and can run in a browser: only sums, products and
 * comparisons, so the same inputs give the same water everywhere.
 */
export class WaterGrid {
    public readonly bounds: WaterGridBounds;
    private readonly ground: Float32Array;
    private readonly blocked: Uint8Array;
    /**
     * For each cell, the sides the water cannot cross (a wall between two cells, or a blocked neighbour): a bit for
     * each side, in the order east, west, south, north.
     */
    private readonly closed: Uint8Array;
    /** For the search of a sink: the cells of its queue, and the search that last saw each cell. */
    private readonly queue: Int32Array;
    private readonly seen: Uint32Array;
    private search = 0;
    /** For the levelling over long distances: the stretch of water each cell belongs to along a line. */
    private stretch = new Int32Array(0);
    private farTurn = false;
    private depth: Float32Array;
    private next: Float32Array;

    constructor(
        terrain: TerrainData | undefined,
        bounds: WaterGridBounds | undefined,
        blocked?: (cellX: number, cellY: number) => boolean,
        walls?: WaterWallSides,
    ) {
        this.bounds = bounds ?? { x: 0, y: 0, width: 0, height: 0 };
        const size = this.bounds.width * this.bounds.height;
        this.ground = new Float32Array(size);
        this.blocked = new Uint8Array(size);
        this.depth = new Float32Array(size);
        this.next = new Float32Array(size);
        this.queue = new Int32Array(Math.min(size, MAX_DISC_CELLS));
        this.seen = new Uint32Array(size);
        for (let row = 0; row < this.bounds.height; row++) {
            for (let column = 0; column < this.bounds.width; column++) {
                const index = row * this.bounds.width + column;
                const cellX = this.bounds.x + column;
                const cellY = this.bounds.y + row;
                this.ground[index] = heightAt(terrain, cellX, cellY);
                if (blocked?.(cellX, cellY)) this.blocked[index] = 1;
            }
        }
        this.closed = new Uint8Array(size);
        const { width, height } = this.bounds;
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                const index = row * width + column;
                const key = cellKey(this.bounds.x + column, this.bounds.y + row);
                // A wall on the east or the south side of a cell closes it for the cell and for its neighbour.
                if (column + 1 < width && (walls?.east.has(key) || this.blocked[index + 1] || this.blocked[index])) {
                    this.closed[index] |= 1;
                    this.closed[index + 1] |= 2;
                }
                if (row + 1 < height && (walls?.south.has(key) || this.blocked[index + width] || this.blocked[index])) {
                    this.closed[index] |= 4;
                    this.closed[index + width] |= 8;
                }
            }
        }
    }

    /** Pixels of water over a cell of the map: 0 outside the grid. */
    public depthAt(cellX: number, cellY: number): number {
        const index = this.indexOf(cellX, cellY);
        return index === undefined ? 0 : this.depth[index];
    }

    /**
     * Whether what swims in a cell can go to its neighbour on that side: no wall between them, and the neighbour in
     * the grid.
     */
    public canCross(cellX: number, cellY: number, side: "east" | "west" | "south" | "north"): boolean {
        const index = this.indexOf(cellX, cellY);
        if (index === undefined) return false;
        const column = cellX - this.bounds.x;
        const row = cellY - this.bounds.y;
        if (side === "east") return column + 1 < this.bounds.width && (this.closed[index] & 1) === 0;
        if (side === "west") return column > 0 && (this.closed[index] & 2) === 0;
        if (side === "south") return row + 1 < this.bounds.height && (this.closed[index] & 4) === 0;
        return row > 0 && (this.closed[index] & 8) === 0;
    }

    /** All the water of the grid, in pixels of water over one cell. */
    public totalPx(): number {
        let total = 0;
        for (let index = 0; index < this.depth.length; index++) total += this.depth[index];
        return total;
    }

    /** How many cells are under water. */
    public wetCells(): number {
        let wet = 0;
        for (let index = 0; index < this.depth.length; index++) if (this.depth[index] > DRY_PX) wet++;
        return wet;
    }

    /** One step: what comes in and goes out, then the water moves towards the lower neighbours. */
    public step(input: WaterStepInput): WaterTally {
        const tally: WaterTally = {
            rainPx: 0,
            sourcesPx: 0,
            sinksPx: 0,
            evaporationPx: 0,
            absorptionPx: 0,
            lostPx: 0,
            moved: false,
        };
        const amount = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);
        const rain = amount(input.rainPx);
        const evaporation = amount(input.evaporationPx);
        const absorption = amount(input.absorptionPx);
        const depth = this.depth;
        if (rain > 0 || evaporation > 0 || absorption > 0) {
            for (let index = 0; index < depth.length; index++) {
                if (this.blocked[index]) continue;
                const dug = this.ground[index] < 0;
                if (rain > 0 && dug) {
                    depth[index] += rain;
                    tally.rainPx += rain;
                    tally.moved = true;
                }
                if (depth[index] <= 0) continue;
                if (evaporation > 0) {
                    const taken = Math.min(depth[index], evaporation);
                    depth[index] -= taken;
                    tally.evaporationPx += taken;
                    tally.moved = true;
                }
                if (absorption > 0 && !dug && depth[index] > 0) {
                    const taken = Math.min(depth[index], absorption);
                    depth[index] -= taken;
                    tally.absorptionPx += taken;
                    tally.moved = true;
                }
            }
        }
        const sinks: { index: number; radius: number; left: number }[] = [];
        for (const flow of input.flows) {
            const index = this.indexOf(flow.cellX, flow.cellY);
            if (!Number.isFinite(flow.px) || flow.px === 0) continue;
            if (index === undefined || this.blocked[index]) {
                // A source outside the grid or in a wall pours nothing that stays.
                if (flow.px > 0) tally.lostPx += flow.px;
                continue;
            }
            if (flow.px > 0) {
                tally.sourcesPx += flow.px;
                tally.lostPx += flow.px - this.pour(index, flow.px, radiusOf(flow.radius, 0));
                tally.moved = true;
            } else {
                const radius = radiusOf(flow.radius, SINK_RADIUS_CELLS);
                const taken = this.drain(index, -flow.px, radius);
                tally.sinksPx += taken;
                // A sink with nothing to take does not keep a grid at rest awake.
                if (taken > 0) tally.moved = true;
                // What it still asks for: taken as the water runs to it, between the moves of this step.
                if (-flow.px - taken > 0) sinks.push({ index, radius, left: -flow.px - taken });
            }
        }
        if (this.flow(tally)) tally.moved = true;
        // On a map that goes faster than reality the water also levels over long distances: a lake would otherwise
        // take minutes to feel a sink or a source at its other end.
        // Every other step: half the cost for the server, and still far ahead of the moves from cell to cell.
        this.farTurn = !this.farTurn;
        if (this.farTurn && flowStepsOf(input.flowSteps) > 1 && this.flowFar()) tally.moved = true;
        // Around a sink that still asks for water, the water moves again, as many times as the step asks: on a map
        // that goes faster than reality a strong sink would otherwise empty its disc and wait for water that creeps
        // in one cell a step. Only around the sinks: moving the whole grid that often would cost too much.
        const moves = flowStepsOf(input.flowSteps);
        for (let move = 1; move < moves; move++) {
            let asking = false;
            for (const sink of sinks) {
                if (sink.left <= 0) continue;
                this.flowAround(sink.index, sink.radius + SINK_RUSH_CELLS, move % 2 === 1, tally);
                const taken = this.drain(sink.index, sink.left, sink.radius);
                sink.left -= taken;
                tally.sinksPx += taken;
                if (taken > 0) tally.moved = true;
                if (sink.left > 0) asking = true;
            }
            if (!asking) break;
        }
        return tally;
    }

    /** The water of another grid (the map before an edit), kept cell by cell where this grid has the cell. */
    public takeFrom(other: WaterGrid): void {
        for (let row = 0; row < other.bounds.height; row++) {
            for (let column = 0; column < other.bounds.width; column++) {
                const held = other.depth[row * other.bounds.width + column];
                if (held <= 0) continue;
                const index = this.indexOf(other.bounds.x + column, other.bounds.y + row);
                if (index !== undefined && !this.blocked[index]) this.depth[index] = held;
            }
        }
    }

    /** The depths as bytes: two for each cell, in eighths of a pixel. For saving and for sending. */
    public writeDepths(): Uint8Array {
        const bytes = new Uint8Array(this.depth.length * 2);
        for (let index = 0; index < this.depth.length; index++) {
            const eighths = Math.min(65535, Math.round(this.depth[index] * 8));
            bytes[index * 2] = eighths & 255;
            bytes[index * 2 + 1] = eighths >> 8;
        }
        return bytes;
    }

    /** Reads depths written by a grid of the same size; bytes of another size are left alone. */
    public readDepths(bytes: Uint8Array): boolean {
        if (bytes.length !== this.depth.length * 2) return false;
        for (let index = 0; index < this.depth.length; index++) {
            this.depth[index] = this.blocked[index] ? 0 : (bytes[index * 2] | (bytes[index * 2 + 1] << 8)) / 8;
        }
        return true;
    }

    private indexOf(cellX: number, cellY: number): number | undefined {
        const column = cellX - this.bounds.x;
        const row = cellY - this.bounds.y;
        if (column < 0 || row < 0 || column >= this.bounds.width || row >= this.bounds.height) return undefined;
        return row * this.bounds.width + column;
    }

    /**
     * Pours the water of a source standing at a cell, parcel by parcel: each parcel runs down the steepest slope of
     * the surface, wetting the dry cells of its way, and stays in the first hollow it finds. So a strong source feeds
     * the low ground at once instead of piling up where it stands and flooding all around; the ground around is
     * flooded when the hollows are full. Returns what stayed in the grid: a parcel that runs off the edge, or finds
     * the water at its highest level, is lost.
     */
    private pour(start: number, px: number, radius: number): number {
        const { width, height } = this.bounds;
        // The cells the source pours over: its own, or those of its disc, each in turn.
        const starts = radius > 0 ? this.discAround(start, radius) : undefined;
        const spread = starts ? starts.length : 1;
        const depth = this.depth;
        const ground = this.ground;
        const parcels = Math.min(MAX_PARCELS, Math.max(1, Math.ceil(px / PARCEL_PX), Math.min(spread, MAX_PARCELS)));
        const size = px / parcels;
        let kept = 0;
        for (let parcel = 0; parcel < parcels; parcel++) {
            let index = starts ? starts[Math.floor((parcel * spread) / parcels)] : start;
            let left = size;
            for (let move = 0; move < PARCEL_REACH_CELLS && left > 0; move++) {
                const surface = ground[index] + depth[index];
                const column = index % width;
                const row = (index - column) / width;
                let lowest = surface - LEVEL_PX;
                let next = index;
                let edge = false;
                for (let side = 0; side < 4; side++) {
                    const inside =
                        side === 0
                            ? column + 1 < width
                            : side === 1
                              ? column > 0
                              : side === 2
                                ? row + 1 < height
                                : row > 0;
                    if (!inside) {
                        // Water at the edge of the grid falls away, as when it flows.
                        if (depth[index] > DRY_PX) edge = true;
                        continue;
                    }
                    if (this.closed[index] & (1 << side)) continue;
                    const neighbour = index + (side === 0 ? 1 : side === 1 ? -1 : side === 2 ? width : -width);
                    const level = ground[neighbour] + depth[neighbour];
                    if (level < lowest) {
                        lowest = level;
                        next = neighbour;
                    }
                }
                if (edge) {
                    left = 0;
                    break;
                }
                if (next === index) break;
                if (depth[index] < BED_FILM_PX) {
                    const film = Math.min(left, BED_FILM_PX - depth[index]);
                    depth[index] += film;
                    kept += film;
                    left -= film;
                }
                index = next;
            }
            if (left <= 0) continue;
            const stays = Math.min(left, Math.max(0, MAX_WATER_SURFACE_PX - (ground[index] + depth[index])));
            depth[index] += stays;
            kept += stays;
        }
        return kept;
    }

    /**
     * The cells of the grid a source pours over: those within `radius` cells of its own that are reached from it
     * without crossing a wall, its own first.
     */
    private discAround(centre: number, radius: number): number[] {
        const { width, height } = this.bounds;
        const column = centre % width;
        const row = (centre - column) / width;
        this.search++;
        if (this.search === 0xffffffff) {
            this.seen.fill(0);
            this.search = 1;
        }
        const cells = [centre];
        this.seen[centre] = this.search;
        for (let head = 0; head < cells.length && cells.length < MAX_DISC_CELLS; head++) {
            const index = cells[head];
            const x = index % width;
            const y = (index - x) / width;
            for (let side = 0; side < 4; side++) {
                if (this.closed[index] & (1 << side)) continue;
                const nextX = x + (side === 0 ? 1 : side === 1 ? -1 : 0);
                const nextY = y + (side === 2 ? 1 : side === 3 ? -1 : 0);
                if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
                const neighbour = nextY * width + nextX;
                if (this.seen[neighbour] === this.search) continue;
                if ((nextX - column) ** 2 + (nextY - row) ** 2 > radius * radius) continue;
                this.seen[neighbour] = this.search;
                cells.push(neighbour);
            }
        }
        return cells;
    }

    /**
     * Takes up to `wanted` pixels of water for a sink standing at a cell: the water of its cell first, then the
     * water that would run to it within its radius (cells), nearest first (from cell to cell, never down to a lower
     * surface: the water below a sink stays). So a sink takes what a few cells hold and receive, not only what
     * happens to creep into one cell, and the water further away comes to it by running. Returns what it took.
     */
    private drain(start: number, wanted: number, radius: number): number {
        const { width, height } = this.bounds;
        const depth = this.depth;
        const queue = this.queue;
        if (queue.length === 0) return 0;
        this.search++;
        if (this.search === 0xffffffff) {
            this.seen.fill(0);
            this.search = 1;
        }
        const startColumn = start % width;
        const startRow = (start - startColumn) / width;
        let taken = 0;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        this.seen[start] = this.search;
        while (head < tail && taken < wanted) {
            const index = queue[head++];
            const surface = this.ground[index] + depth[index];
            const share = Math.min(depth[index], wanted - taken);
            depth[index] -= share;
            taken += share;
            const column = index % width;
            const row = (index - column) / width;
            for (let side = 0; side < 4 && tail < queue.length; side++) {
                const neighbour =
                    side === 0
                        ? column + 1 < width
                            ? index + 1
                            : -1
                        : side === 1
                          ? column > 0
                              ? index - 1
                              : -1
                          : side === 2
                            ? row + 1 < height
                                ? index + width
                                : -1
                            : row > 0
                              ? index - width
                              : -1;
                if (neighbour < 0 || this.seen[neighbour] === this.search) continue;
                if (this.closed[index] & (1 << side)) continue;
                const away = (neighbour % width) - startColumn;
                const down = Math.floor(neighbour / width) - startRow;
                if (away * away + down * down > radius * radius) continue;
                if (depth[neighbour] <= DRY_PX) continue;
                if (this.ground[neighbour] + depth[neighbour] < surface - LEVEL_PX) continue;
                this.seen[neighbour] = this.search;
                queue[tail++] = neighbour;
            }
        }
        return taken;
    }

    /**
     * Moves the water once more within `reach` cells of a cell, in place: each cell in turn gives to its lower
     * neighbours (`backwards` turns the order round, so that no direction is favoured over the moves). Cheap, for the
     * surroundings of a sink only; the whole grid moves with `flow`.
     */
    private flowAround(centre: number, reach: number, backwards: boolean, tally: WaterTally): void {
        const { width, height } = this.bounds;
        const depth = this.depth;
        const ground = this.ground;
        const closed = this.closed;
        const column = centre % width;
        const row = (centre - column) / width;
        const left = Math.max(0, column - reach);
        const right = Math.min(width - 1, column + reach);
        const top = Math.max(0, row - reach);
        const bottom = Math.min(height - 1, row + reach);
        const offsets = [1, -1, width, -width];
        const drops = [0, 0, 0, 0];
        const count = (right - left + 1) * (bottom - top + 1);
        for (let step = 0; step < count; step++) {
            const at = backwards ? count - 1 - step : step;
            const x = left + (at % (right - left + 1));
            const y = top + Math.floor(at / (right - left + 1));
            const index = y * width + x;
            const held = depth[index];
            if (held <= DRY_PX) continue;
            const surface = ground[index] + held;
            let total = 0;
            for (let side = 0; side < 4; side++) {
                const inside = side === 0 ? x + 1 < width : side === 1 ? x > 0 : side === 2 ? y + 1 < height : y > 0;
                let drop = 0;
                if (!inside) drop = held;
                else if (!(closed[index] & (1 << side))) {
                    drop = surface - (ground[index + offsets[side]] + depth[index + offsets[side]]);
                }
                drops[side] = drop > 0 ? drop : 0;
                total += drops[side];
            }
            if (total <= DRY_PX) continue;
            const scale = Math.min(FLOW_SHARE, held / total);
            for (let side = 0; side < 4; side++) {
                const out = drops[side] * scale;
                if (out <= 0) continue;
                depth[index] -= out;
                const inside = side === 0 ? x + 1 < width : side === 1 ? x > 0 : side === 2 ? y + 1 < height : y > 0;
                if (inside) depth[index + offsets[side]] += out;
                else tally.lostPx += out;
            }
            if (depth[index] < 0) depth[index] = 0;
        }
    }

    /**
     * Levels the water over long distances: along each row, then each column, a cell exchanges water with the cells
     * 4 and 16 cells further when an unbroken stretch of water joins them (no wall, no dry ground, not even a film
     * of water between them), a quarter of their difference of level. Water never leaves its stretch: it does what a
     * few moves from cell to cell would have done, sooner. Returns whether any moved.
     */
    private flowFar(): boolean {
        const { width, height } = this.bounds;
        const depth = this.depth;
        const ground = this.ground;
        const closed = this.closed;
        const size = width * height;
        if (this.stretch.length !== size) this.stretch = new Int32Array(size);
        const stretch = this.stretch;
        let moved = false;
        for (let axis = 0; axis < 2; axis++) {
            // The stretches of this direction: the same number for the cells of an unbroken run of water.
            const lines = axis === 0 ? height : width;
            const length = axis === 0 ? width : height;
            const along = axis === 0 ? 1 : width;
            const across = axis === 0 ? width : 1;
            const wall = axis === 0 ? 1 : 4;
            let id = 0;
            for (let line = 0; line < lines; line++) {
                let open = false;
                for (let place = 0; place < length; place++) {
                    const index = line * across + place * along;
                    if (depth[index] < FAR_MIN_DEPTH_PX) {
                        stretch[index] = 0;
                        open = false;
                        continue;
                    }
                    // A new stretch at the start of the line, after a break, or behind a wall.
                    if (!open || closed[index - along] & wall) id++;
                    stretch[index] = id;
                    open = true;
                }
            }
            for (const stride of FAR_STRIDES) {
                const jump = stride * along;
                for (let line = 0; line < lines; line++) {
                    for (let place = 0; place + stride < length; place++) {
                        const index = line * across + place * along;
                        const other = index + jump;
                        if (stretch[index] === 0 || stretch[index] !== stretch[other]) continue;
                        const drop = ground[index] + depth[index] - (ground[other] + depth[other]);
                        if (drop > -LEVEL_PX && drop < LEVEL_PX) continue;
                        // The giver keeps enough water to stay part of its stretch.
                        const giver = drop > 0 ? index : other;
                        const amount = Math.min(Math.abs(drop) * FAR_SHARE, depth[giver] - FAR_MIN_DEPTH_PX);
                        if (amount <= DRY_PX) continue;
                        depth[giver] -= amount;
                        depth[drop > 0 ? other : index] += amount;
                        moved = true;
                    }
                }
            }
        }
        return moved;
    }

    /** Moves the water one step. Returns whether any moved. */
    private flow(tally: WaterTally): boolean {
        const { width, height } = this.bounds;
        const depth = this.depth;
        const next = this.next;
        const ground = this.ground;
        const closed = this.closed;
        next.set(depth);
        let moved = false;
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                const index = row * width + column;
                const held = depth[index];
                if (held <= DRY_PX) continue;
                const surface = ground[index] + held;
                // The four neighbours: outside the grid the water falls away (-Infinity), a wall holds it (NaN).
                const levels = [
                    column + 1 < width ? index + 1 : -1,
                    column > 0 ? index - 1 : -1,
                    row + 1 < height ? index + width : -1,
                    row > 0 ? index - width : -1,
                ];
                let total = 0;
                const drops = [0, 0, 0, 0];
                for (let side = 0; side < 4; side++) {
                    const neighbour = levels[side];
                    let drop: number;
                    if (neighbour < 0) drop = held;
                    else if (closed[index] & (1 << side)) drop = 0;
                    else drop = surface - (ground[neighbour] + depth[neighbour]);
                    if (drop > 0) {
                        drops[side] = drop;
                        total += drop;
                    }
                }
                if (total <= DRY_PX) continue;
                // A share of each difference, never more water than the cell holds.
                const scale = Math.min(FLOW_SHARE, held / total);
                for (let side = 0; side < 4; side++) {
                    const out = drops[side] * scale;
                    if (out <= 0) continue;
                    next[index] -= out;
                    if (levels[side] < 0) tally.lostPx += out;
                    else next[levels[side]] += out;
                    if (out > DRY_PX / 4) moved = true;
                }
            }
        }
        for (let index = 0; index < next.length; index++) {
            if (next[index] < 0) next[index] = 0;
            // Water runs from a cell to the next one only so fast: where more comes than can run away (a hard rain
            // on a wide hollow), it would pile up into a dome, its surface sloping everywhere. What stands over the
            // highest level is lost instead, as when it is poured: the surface stays level and under that level.
            const over = ground[index] + next[index] - MAX_WATER_SURFACE_PX;
            if (over > 0 && next[index] > 0) {
                const taken = Math.min(over, next[index]);
                next[index] -= taken;
                tally.lostPx += taken;
                moved = true;
            }
        }
        this.depth = next;
        this.next = depth;
        return moved;
    }
}

/** The radius of a source or a sink in cells, within its bounds; `fallback` for one that gives none. */
function radiusOf(radius: number | undefined, fallback: number): number {
    if (radius === undefined || !Number.isFinite(radius) || radius < 0) return fallback;
    return Math.min(MAX_RADIUS_CELLS, radius);
}

/** The moves of the water in a step, within their bounds; one for a step that says nothing. */
function flowStepsOf(flowSteps: number | undefined): number {
    if (flowSteps === undefined || !Number.isFinite(flowSteps) || flowSteps < 1) return 1;
    return Math.min(MAX_FLOW_STEPS, Math.round(flowSteps));
}
