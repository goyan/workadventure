import { DEFAULT_WATER_SETTINGS, DEFAULT_WAVE_SETTINGS, MAX_WATER_MAX_SURFACE, TERRAIN_CHUNK } from "../types";
import type { TerrainData, WaveSettings } from "../types";
import { CELL_AREA_M2, LITRES_PER_M3, metresOf } from "./Scale";
import { DEFAULT_SOIL_ROUGHNESS, soilDrinks, soilRoughness } from "./Soils";
import { cellInMap, cellKey, cellOf, heightAt, reliefCells, soilAt } from "./TerrainGrid";
import type { MapCells } from "./TerrainGrid";

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
export const MAX_WATER_SURFACE_PX = DEFAULT_WATER_SETTINGS.maxSurface;

/**
 * For each cell, the level its water spills at: the lowest level a water standing there must reach to run away to
 * the edge of the grid, over the relief alone (the walls are not looked at). It is the level of the rim of the
 * hollow the cell is in (the ground of the map for a hollow dug in the plain, the rim of a crater on a mount), and
 * the ground of the cell itself where water cannot stay (the plain, a slope, the top of a mount). Never under the
 * ground of the map: what is dug under it is a hollow whatever is around.
 */
export function spillLevels(ground: Float32Array, width: number, height: number): Float32Array {
    const size = width * height;
    const spill = new Float32Array(size);
    const done = new Uint8Array(size);
    // A binary heap of cells, the lowest level first: the levels rise from the edge of the grid inwards.
    const heap = new Int32Array(size);
    let count = 0;
    const push = (index: number, level: number): void => {
        spill[index] = level;
        done[index] = 1;
        let at = count++;
        while (at > 0) {
            const parent = (at - 1) >> 1;
            if (spill[heap[parent]] <= level) break;
            heap[at] = heap[parent];
            at = parent;
        }
        heap[at] = index;
    };
    const pop = (): number => {
        const top = heap[0];
        const last = heap[--count];
        let at = 0;
        for (;;) {
            let child = 2 * at + 1;
            if (child >= count) break;
            if (child + 1 < count && spill[heap[child + 1]] < spill[heap[child]]) child++;
            if (spill[heap[child]] >= spill[last]) break;
            heap[at] = heap[child];
            at = child;
        }
        heap[at] = last;
        return top;
    };
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            if (row === 0 || column === 0 || row === height - 1 || column === width - 1) {
                const index = row * width + column;
                push(index, Math.max(0, ground[index]));
            }
        }
    }
    while (count > 0) {
        const index = pop();
        const column = index % width;
        const level = spill[index];
        const visit = (next: number): void => {
            if (!done[next]) push(next, Math.max(level, ground[next]));
        };
        if (column > 0) visit(index - 1);
        if (column + 1 < width) visit(index + 1);
        if (index >= width) visit(index - width);
        if (index + width < size) visit(index + width);
    }
    return spill;
}
/** Under this depth a cell is dry: the water left by rounding does not keep the grid moving. */
const DRY_PX = 0.01;
/**
 * The share of a difference of level that moves to a lower neighbour in one step. With four neighbours a quarter is
 * the edge of stability: a checkerboard of wet and dry cells flips at each step and never fades. A fifth damps it.
 */
const FLOW_SHARE = 0.2;
/** The water that creeps moves this many times a second (WATER_STEP_MS, in WaterInputs). */
const STEPS_PER_SECOND = 10;
/**
 * How far around its foot a sink takes water first when it says nothing, in cells (a tile and a half): it empties
 * what is next to it, then draws down the water joined to it (its basin) when it asks for more.
 */
const SINK_RADIUS_CELLS = 3;
/**
 * The most cells of its basin a sink lowers in one step: about ninety cells around it in open water. The water
 * further away has to run to it.
 */
const BASIN_CELLS = 16_384;
/** How many times the search of what each cell of a basin gives is halved. */
const BASIN_RATE_TURNS = 24;
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

/**
 * The cells of a grid that are indoors: those the water cannot reach from the edge of the grid without crossing one
 * of `walls` (the walls of the map with their doors closed: landWallsOf). A building the edge of the grid cuts is
 * outdoors: its rooms are not closed inside the grid.
 */
export function indoorCells(bounds: WaterGridBounds, walls: WaterWallSides | undefined): Uint8Array {
    const { x, y, width, height } = bounds;
    const size = width * height;
    const indoor = new Uint8Array(size);
    if (!walls || (walls.east.size === 0 && walls.south.size === 0) || size === 0) return indoor;
    // For each cell, its east (1) and south (2) sides that a wall closes.
    const closed = new Uint8Array(size);
    for (const [sides, bit] of [
        [walls.east, 1],
        [walls.south, 2],
    ] as const) {
        for (const key of sides) {
            const cell = cellOf(key);
            const column = cell.x - x;
            const row = cell.y - y;
            if (column >= 0 && row >= 0 && column < width && row < height) closed[row * width + column] |= bit;
        }
    }
    const reached = new Uint8Array(size);
    const queue = new Int32Array(size);
    let tail = 0;
    const visit = (index: number): void => {
        if (reached[index]) return;
        reached[index] = 1;
        queue[tail++] = index;
    };
    for (let column = 0; column < width; column++) {
        visit(column);
        visit((height - 1) * width + column);
    }
    for (let row = 0; row < height; row++) {
        visit(row * width);
        visit(row * width + width - 1);
    }
    for (let head = 0; head < tail; head++) {
        const index = queue[head];
        const column = index % width;
        if (column + 1 < width && !(closed[index] & 1)) visit(index + 1);
        if (column > 0 && !(closed[index - 1] & 1)) visit(index - 1);
        if (index + width < size && !(closed[index] & 2)) visit(index + width);
        if (index >= width && !(closed[index - width] & 2)) visit(index - width);
    }
    for (let index = 0; index < size; index++) indoor[index] = reached[index] ? 0 : 1;
    return indoor;
}

/** The most moves the water makes around a sink in one step. */
export const MAX_FLOW_STEPS = 16;
/** How far a cell exchanges water with another of its stretch, in cells, over long distances. */
const FAR_STRIDES = [4, 16];
/** A cell with less water than this breaks a stretch: a film over a sill does not join two lakes. */
const FAR_MIN_DEPTH_PX = 2;
/**
 * A cell with this much water joins the basin of a sink: half the film the sink leaves in each cell, so that the
 * water it left, which goes on running to it, still joins it to the rest of the lake at its next step.
 */
const BASIN_JOIN_PX = FAR_MIN_DEPTH_PX / 2;
/** The share of a difference of level two distant cells of a stretch exchange in a step. */
const FAR_SHARE = 0.25;
/** How far around the disc of a sink the water moves again during a step, in cells: eight tiles. */
const SINK_RUSH_CELLS = 16;

/**
 * The water with inertia: how fast the flow between two cells picks up, for each pixel of water that passes and
 * each pixel of difference of level, a second. It is the gravity at the scale of the map (a cell is about 0.55 m
 * wide, a pixel of water 3.4 cm): a wave runs at the square root of this times the depth, in cells a second (4.5
 * under 18 px of water, 17 under 256 px).
 */
const GRAVITY = (9.81 * -metresOf(-1)) / CELL_AREA_M2;
/**
 * The friction of the ground (Manning): the share of its flow the water loses a second is the square of the
 * roughness of the soil, times this, times the speed of the water (cells a second), over its depth (pixels) to the
 * power 4/3. Next to nothing under a swell in deep water, strong under a thin sheet that runs fast on land.
 */
const MANNING = (9.81 * Math.sqrt(CELL_AREA_M2)) / (-metresOf(-1)) ** (4 / 3);
/** A front whose surface drops less than this share of the water that passes is a swell: it does not break. */
const BREAKING_CALM = 0.1;
/** How hard a steeper front loses its flow, a second, for each share over that. */
const BREAKING_GAIN = 4;
/** Depths to the power -4/3, by eighths of a pixel up to this depth: computed once, read at each passage. */
const DEEPEST_TABLED_PX = 640;
const DEPTH_POWERS = Float32Array.from({ length: DEEPEST_TABLED_PX * 8 + 1 }, (_, eighths) =>
    Math.pow(Math.max(1, eighths) / 8, -4 / 3),
);
/** The water itself crosses no more than this share of a cell in one move. */
const FASTEST_CELLS_PER_MOVE = 0.5;
/**
 * A wave crosses no more than this share of a cell in one move. At half a cell
 * the computation rocks by itself (measured: a small basin never calms down); at a third it calms down.
 */
const WAVE_CELLS_PER_MOVE = 0.35;
/** How wide a cell of the relief is, in metres. */
export const CELL_METRES = Math.sqrt(CELL_AREA_M2);

/** How fast a wave runs in water that deep (pixels), in cells a second. */
export function waveSpeed(depthPx: number): number {
    return Number.isFinite(depthPx) && depthPx > 0 ? Math.sqrt(GRAVITY * depthPx) : 0;
}

/** No water is told faster than this, in cells a second (about 16 m/s): beyond it, it falls rather than runs. */
export const FASTEST_FLOW_CELLS = 30;

/**
 * How fast the water runs, in cells a second, where its surface goes down `slopePx` pixels a cell under `depthPx`
 * pixels of water: with inertia, the speed at which the friction (that of the ground, `roughness` being the n of
 * its soil, and the damping of the map) holds back what the slope gives, the flow of a passage once it is steady;
 * without, what a share of the difference of level a step carries. What a browser shows of the water, which it
 * only knows by its depths.
 */
export function steadyFlowSpeed(
    slopePx: number,
    depthPx: number,
    inertia: boolean,
    waves: Pick<WaveSettings, "roughness" | "damping"> = DEFAULT_WAVE_SETTINGS,
    roughness = DEFAULT_SOIL_ROUGHNESS,
): number {
    if (!Number.isFinite(slopePx) || !Number.isFinite(depthPx) || depthPx <= DRY_PX) return 0;
    const slope = Math.abs(slopePx);
    if (slope === 0) return 0;
    if (!inertia) return Math.min((FLOW_SHARE * slope * STEPS_PER_SECOND) / depthPx, FASTEST_FLOW_CELLS);
    // The slope gives GRAVITY x slope; the friction takes (damping + ground x speed) x speed: the speed where
    // the two are even.
    const ground = (roughness * roughness * waves.roughness * MANNING) / Math.pow(depthPx, 4 / 3);
    const given = GRAVITY * slope;
    const damping = waves.damping;
    let speed: number;
    if (ground > 0) speed = (-damping + Math.sqrt(damping * damping + 4 * ground * given)) / (2 * ground);
    else speed = damping > 0 ? given / damping : FASTEST_FLOW_CELLS;
    return Math.min(speed, FASTEST_FLOW_CELLS);
}

/**
 * The most moves of the water with inertia in a step. Deeper than what they bear (about 100 px of water), a wave
 * runs no faster than in that depth: one deep hole would otherwise make every step of the whole map twice as
 * long (measured on a map with a pit of 300 px).
 */
const MAX_INERTIA_MOVES = 3;

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
 * With the size of the map, the grid stops at its edges, and what was dug or put outside the map is left out.
 */
export function gridBoundsOf(
    terrain: TerrainData | undefined,
    objects: readonly { cellX: number; cellY: number }[],
    map?: MapCells,
): WaterGridBounds | undefined {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const include = (x: number, y: number): void => {
        if (!cellInMap(x, y, map)) return;
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
    // The chunks are coarser than the relief: the dug and the raised cells themselves, when there are few.
    const dug = reliefCells(terrain);
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
    if (map) {
        const endX = Math.min(map.width, x + width);
        const endY = Math.min(map.height, y + height);
        x = Math.max(0, x);
        y = Math.max(0, y);
        width = endX - x;
        height = endY - y;
    }
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

/**
 * What a source (positive) or a sink (negative) that holds a level gives or takes during a step: its flow, and no
 * more than what brings the water of its disc from `surface` to the level. Its flow when it holds none.
 */
export function heldFlow(px: number, level: number | undefined, surface: number, radius: number | undefined): number {
    if (level === undefined || !Number.isFinite(level)) return px;
    const gap = px > 0 ? level - surface : surface - level;
    if (gap <= 0) return 0;
    const cells = Math.max(1, Math.PI * (radius ?? 0) ** 2);
    return Math.sign(px) * Math.min(Math.abs(px), gap * cells);
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
     * Water the floor of a room takes away from each wet cell that is indoors and not dug (see indoorCells): the
     * drains of the buildings, counted with the sinks. None when absent.
     */
    indoorDrainPx?: number;
    /**
     * Sources (positive) and sinks (negative), each at a cell of the map. `radius` is the disc, in cells, a source
     * pours over (its cell only when absent) or a sink takes from (a tile and a half when absent). `level` is the
     * altitude of the water, in pixels, a source stops pouring at and a sink stops taking at: at each step it gives
     * or takes no more than what brings the water of its disc there.
     */
    flows: readonly { cellX: number; cellY: number; px: number; radius?: number; level?: number }[];
    /**
     * How many times the water moves towards a sink that asks for more than it finds, during the step (1 when
     * absent, MAX_FLOW_STEPS at most): more on a map whose water goes faster than reality, so that it runs to the
     * sink as far as the step is long.
     */
    flowSteps?: number;
    /**
     * Whether the water has inertia: the flow between two cells is kept from a step to the next, picks up with the
     * slope of the surface and slows down by friction, so waves run and a lake levels as fast as its depth allows.
     * Absent: the water creeps from cell to cell, a share of each difference of level a step.
     */
    inertia?: boolean;
    /** How long the step lasts, in seconds, for the water with inertia (a tenth of a second when absent). */
    seconds?: number;
    /** How the water with inertia makes its waves (WaterSettings.waves): the usual ones when absent. */
    waves?: WaveSettings;
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
    /** The level the water of each cell spills at (see spillLevels): a cell under it is in a hollow. */
    private readonly spill: Float32Array;
    /** The share of the absorption of the map the soil of each cell drinks (see soilDrinks). */
    private readonly drinks: Float32Array;
    private readonly blocked: Uint8Array;
    /** The cells indoors (see indoorCells): the floor of a room drains its water. */
    private readonly indoor: Uint8Array;
    /**
     * For each cell, the sides the water cannot cross (a wall between two cells, or a blocked neighbour): a bit for
     * each side, in the order east, west, south, north.
     */
    private readonly closed: Uint8Array;
    /** For the search of a sink: the cells of its queue, and the search that last saw each cell. */
    private readonly queue: Int32Array;
    /** The cells of the basin of a sink, while it is lowered. */
    private readonly basin: Int32Array;
    private readonly seen: Uint32Array;
    private search = 0;
    /** For each cell of the basin of a sink: the water it holds over the foot of the sink, and its weight. */
    private readonly basinAbove: Float32Array;
    private readonly basinWeights: Float32Array;
    /** The weights of the cells of a basin that could still give at the rate last tried. */
    private basinFree = 0;
    /** For the levelling over long distances: the stretch of water each cell belongs to along a line. */
    private stretch = new Int32Array(0);
    private farTurn = false;
    /**
     * The water with inertia: the flow from each cell to the next one of its row (`flowEast`) and of its column
     * (`flowSouth`), in pixels of water over one cell a second, negative the other way; and the share of what it
     * gives each cell can afford. Empty on a map whose water only creeps.
     */
    private flowEast = new Float32Array(0);
    private flowSouth = new Float32Array(0);
    private afford = new Float32Array(0);
    /** The speed of the water through each of those passages at the move before, for the momentum it carries. */
    private speedEast = new Float32Array(0);
    private speedSouth = new Float32Array(0);
    /** The same speeds as this move makes them: they take the place of the others when it ends. */
    private nextSpeedEast = new Float32Array(0);
    private nextSpeedSouth = new Float32Array(0);
    /** The friction of the ground of each cell: the square of the roughness of its soil, times MANNING. */
    private readonly rough: Float32Array;
    /**
     * The cells that lie in a hollow of the relief (a lake, a pond, the sea: their ground is under the level their
     * water spills at), as against the land that is dry but for a flood. A wave breaks, and the water carries its
     * momentum along, in a hollow only: on land the front of a flood is a sheet that advances, which the friction
     * of the ground alone holds back (measured: with them on land, the tsunami of a comet went 46 cells inland;
     * without, 209).
     */
    private readonly hollow: Uint8Array;
    private depth: Float32Array;
    /** How high the water of this map may stand over the level it spills at (see setMaxSurface). */
    private highest: number = MAX_WATER_SURFACE_PX;
    private next: Float32Array;

    constructor(
        terrain: TerrainData | undefined,
        bounds: WaterGridBounds | undefined,
        blocked?: (cellX: number, cellY: number) => boolean,
        walls?: WaterWallSides,
        /** The walls that close the rooms (doors closed): what they close is indoors. No room when absent. */
        rooms?: WaterWallSides,
    ) {
        this.bounds = bounds ?? { x: 0, y: 0, width: 0, height: 0 };
        const size = this.bounds.width * this.bounds.height;
        this.ground = new Float32Array(size);
        this.blocked = new Uint8Array(size);
        this.depth = new Float32Array(size);
        this.next = new Float32Array(size);
        this.queue = new Int32Array(Math.min(size, MAX_DISC_CELLS));
        this.basin = new Int32Array(Math.min(size, BASIN_CELLS));
        this.basinAbove = new Float32Array(this.basin.length);
        this.basinWeights = new Float32Array(this.basin.length);
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
        this.spill = spillLevels(this.ground, this.bounds.width, this.bounds.height);
        this.indoor = indoorCells(this.bounds, rooms);
        this.drinks = new Float32Array(size);
        this.rough = new Float32Array(size);
        this.hollow = new Uint8Array(size);
        for (let row = 0; row < this.bounds.height; row++) {
            for (let column = 0; column < this.bounds.width; column++) {
                const index = row * this.bounds.width + column;
                const soil = soilAt(terrain, this.bounds.x + column, this.bounds.y + row);
                this.rough[index] = soilRoughness(soil) ** 2 * MANNING;
                this.hollow[index] = this.ground[index] < this.spill[index] ? 1 : 0;
                this.drinks[index] = soilDrinks(soil, this.ground[index] < this.spill[index]);
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

    /**
     * How high the water may stand over the level it spills at, in pixels: what the map sets, never under the usual
     * height nor over the highest a map may set (the usual one for a height that is not a number). What stands over
     * a height that was lowered is lost at the next step.
     */
    public setMaxSurface(px: number): void {
        this.highest = Number.isFinite(px)
            ? Math.min(MAX_WATER_MAX_SURFACE, Math.max(MAX_WATER_SURFACE_PX, px))
            : MAX_WATER_SURFACE_PX;
    }

    public maxSurface(): number {
        return this.highest;
    }

    /**
     * Empties the disc of `radius` cells around a cell (never behind a wall) and returns the water taken, with how
     * many cells the disc has. Undefined outside the grid or in a wall.
     */
    public takeDisc(cellX: number, cellY: number, radius: number): { takenPx: number; cells: number } | undefined {
        const centre = this.indexOf(cellX, cellY);
        if (centre === undefined || this.blocked[centre]) return undefined;
        const disc = this.discAround(centre, radius, discLimit(radius));
        let takenPx = 0;
        for (const index of disc) {
            takenPx += this.depth[index];
            this.depth[index] = 0;
        }
        return { takenPx, cells: disc.length };
    }

    /**
     * Lays up to `px` of water on the ring around a cell: the cells further than `inner` cells from it and no further
     * than `outer`, reached from it without crossing a wall (all the disc when `inner` is negative). Each cell takes
     * an even share, never over its highest level, and a cell already `deepPx` deep no more than `crestPx`: open water
     * only swells as a wave goes by, the ground around it is flooded. Returns what was laid.
     */
    public layRing(
        cellX: number,
        cellY: number,
        inner: number,
        outer: number,
        px: number,
        crestPx = Infinity,
        deepPx = Infinity,
    ): number {
        const centre = this.indexOf(cellX, cellY);
        if (centre === undefined || this.blocked[centre] || px <= 0) return 0;
        const { width } = this.bounds;
        const column = centre % width;
        const row = (centre - column) / width;
        const cells: number[] = [];
        const rooms: number[] = [];
        for (const index of this.discAround(centre, outer, discLimit(outer))) {
            const x = index % width;
            const y = (index - x) / width;
            if (inner >= 0 && (x - column) ** 2 + (y - row) ** 2 <= inner * inner) continue;
            let room = this.spill[index] + this.highest - (this.ground[index] + this.depth[index]);
            if (this.depth[index] >= deepPx) room = Math.min(room, crestPx);
            if (room <= 0) continue;
            cells.push(index);
            rooms.push(room);
        }
        let left = px;
        // Even shares, and what a full cell cannot take goes to the others: a few rounds settle it.
        for (let round = 0; round < 4 && left > LEVEL_PX; round++) {
            let open = 0;
            for (const room of rooms) if (room > 0) open++;
            if (open === 0) break;
            const share = left / open;
            for (let cell = 0; cell < cells.length; cell++) {
                if (rooms[cell] <= 0) continue;
                const stays = Math.min(share, rooms[cell]);
                this.depth[cells[cell]] += stays;
                rooms[cell] -= stays;
                left -= stays;
            }
        }
        return px - left;
    }

    /**
     * Rain falls on the cells within `radius` cells of a cell (on every cell of the grid when `radius` is
     * undefined): `px` on each, never over its highest level, nothing in a wall. It falls from the sky, so no wall
     * stops it, and its centre may be outside the grid. Returns what was laid.
     */
    public rainOn(cellX: number, cellY: number, radius: number | undefined, px: number): number {
        if (!Number.isFinite(px) || px <= 0) return 0;
        const { x, y, width, height } = this.bounds;
        const reach = radius === undefined ? undefined : Math.max(0, radius);
        const fromRow = reach === undefined ? 0 : Math.max(0, Math.floor(cellY - reach) - y);
        const toRow = reach === undefined ? height - 1 : Math.min(height - 1, Math.ceil(cellY + reach) - y);
        const fromColumn = reach === undefined ? 0 : Math.max(0, Math.floor(cellX - reach) - x);
        const toColumn = reach === undefined ? width - 1 : Math.min(width - 1, Math.ceil(cellX + reach) - x);
        let laid = 0;
        for (let row = fromRow; row <= toRow; row++) {
            for (let column = fromColumn; column <= toColumn; column++) {
                if (reach !== undefined && (column + x - cellX) ** 2 + (row + y - cellY) ** 2 > reach * reach) continue;
                const index = row * width + column;
                if (this.blocked[index]) continue;
                const room = this.spill[index] + this.highest - (this.ground[index] + this.depth[index]);
                if (room <= 0) continue;
                const stays = Math.min(px, room);
                this.depth[index] += stays;
                laid += stays;
            }
        }
        return laid;
    }

    /**
     * A drain takes water from the cells of the disc of `radiusCells` cells around a cell: up to `centrePx` from the
     * one in its middle, down to `rimPx` from those at its rim, evenly in between. Nothing from a wall, and only from
     * the cells of the grid: a disc that goes past its edge, or whose middle lies outside, takes what it covers.
     * Returns what was taken.
     */
    public drainDisc(cellX: number, cellY: number, radiusCells: number, centrePx: number, rimPx: number): number {
        if (!Number.isFinite(centrePx) || !Number.isFinite(rimPx) || !Number.isFinite(radiusCells)) return 0;
        if (radiusCells < 0 || (centrePx <= 0 && rimPx <= 0)) return 0;
        const { x, y, width, height } = this.bounds;
        const reach = Math.ceil(radiusCells);
        const fromRow = Math.max(0, cellY - reach - y);
        const toRow = Math.min(height - 1, cellY + reach - y);
        const fromColumn = Math.max(0, cellX - reach - x);
        const toColumn = Math.min(width - 1, cellX + reach - x);
        let taken = 0;
        for (let row = fromRow; row <= toRow; row++) {
            for (let column = fromColumn; column <= toColumn; column++) {
                const away = Math.hypot(column + x - cellX, row + y - cellY);
                if (away > radiusCells) continue;
                const index = row * width + column;
                if (this.blocked[index]) continue;
                const share = radiusCells > 0 ? away / radiusCells : 0;
                const goes = Math.min(Math.max(0, centrePx + (rimPx - centrePx) * share), this.depth[index]);
                this.depth[index] -= goes;
                taken += goes;
            }
        }
        return taken;
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
        const indoorDrain = amount(input.indoorDrainPx ?? 0);
        const depth = this.depth;
        if (rain > 0 || evaporation > 0 || absorption > 0 || indoorDrain > 0) {
            for (let index = 0; index < depth.length; index++) {
                if (this.blocked[index]) continue;
                // In a hollow: dug under the ground of the map, or under the rim of a crater on a mount.
                const dug = this.ground[index] < this.spill[index];
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
                if (absorption > 0 && this.drinks[index] > 0 && depth[index] > 0) {
                    const taken = Math.min(depth[index], absorption * this.drinks[index]);
                    depth[index] -= taken;
                    tally.absorptionPx += taken;
                    tally.moved = true;
                }
                // The floor of a room drains, never a pool dug in it.
                if (indoorDrain > 0 && this.indoor[index] && !dug && depth[index] > 0) {
                    const taken = Math.min(depth[index], indoorDrain);
                    depth[index] -= taken;
                    tally.sinksPx += taken;
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
            // A source or a sink that holds a level: no more than what brings the water of its disc there.
            const px = heldFlow(flow.px, flow.level, this.ground[index] + depth[index], flow.radius);
            if (px === 0) continue;
            if (px > 0) {
                tally.sourcesPx += px;
                tally.lostPx += px - this.pour(index, px, radiusOf(flow.radius, 0));
                tally.moved = true;
            } else {
                const radius = radiusOf(flow.radius, SINK_RADIUS_CELLS);
                let taken = this.drain(index, -px, radius);
                // Its disc did not hold what it asks: the rest comes from the water joined to it. A sink that holds
                // a level takes from its disc only: the lake runs to it by itself.
                if (taken < -px && flow.level === undefined) taken += this.lowerBasin(index, -px - taken, radius);
                tally.sinksPx += taken;
                // A sink with nothing to take does not keep a grid at rest awake.
                if (taken > 0) tally.moved = true;
                // What it still asks for: taken as the water runs to it, between the moves of this step.
                if (-px - taken > 0 && flow.level === undefined) sinks.push({ index, radius, left: -px - taken });
            }
        }
        if (input.inertia) {
            if (this.flowWithInertia(tally, input.seconds, input.waves)) tally.moved = true;
        } else {
            // A map that went back to the water that creeps: its water forgets the way it was going.
            if (this.flowEast.length > 0) this.forgetFlows();
            if (this.flow(tally)) tally.moved = true;
        }
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
        this.forgetFlows();
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
            const stays = Math.min(
                left,
                Math.max(0, this.spill[index] + this.highest - (ground[index] + depth[index])),
            );
            depth[index] += stays;
            kept += stays;
        }
        return kept;
    }

    /**
     * The cells of the grid a source pours over: those within `radius` cells of its own that are reached from it
     * without crossing a wall, its own first.
     */
    private discAround(centre: number, radius: number, maxCells = MAX_DISC_CELLS): number[] {
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
        for (let head = 0; head < cells.length && cells.length < maxCells; head++) {
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
     * Takes up to `wanted` pixels of water for a sink from its basin: the water joined to its disc by an unbroken
     * stretch of water (no wall, no dry ground, not even a film of water), nearest first and BASIN_CELLS cells at
     * most. Each cell gives the more the nearer it is to the sink (in proportion to 1 / (1 + its distance in cells)):
     * the water goes down in a cone around the sink, so its surface slopes towards the sink all over the basin, and
     * the current carries what floats to it. None is taken under the foot of the sink (the water lower than a sink
     * never runs to it), and beyond its disc each cell keeps a film of water. A sink would otherwise wait for the water to creep in from cell to cell, and take a
     * fraction of what it asks. Returns what it took.
     */
    private lowerBasin(start: number, wanted: number, radius: number): number {
        const { width, height } = this.bounds;
        const depth = this.depth;
        const ground = this.ground;
        const cells = this.basin;
        if (cells.length === 0 || wanted <= 0) return 0;
        this.search++;
        if (this.search === 0xffffffff) {
            this.seen.fill(0);
            this.search = 1;
        }
        const startColumn = start % width;
        const startRow = (start - startColumn) / width;
        const foot = ground[start];
        const above = this.basinAbove;
        const weights = this.basinWeights;
        let count = 0;
        let held = 0;
        // The most a cell of weight 1 could give: over it every cell gives all it holds.
        let steepest = 0;
        cells[count++] = start;
        this.seen[start] = this.search;
        for (let head = 0; head < count; head++) {
            const index = cells[head];
            const surface = ground[index] + depth[index];
            const column = index % width;
            const row = (index - column) / width;
            // The nearer the sink, the more a cell gives: the water goes down in a cone around the sink, as around
            // a well, and its surface slopes towards the sink from afar.
            const far = Math.hypot(column - startColumn, row - startRow);
            const weight = 1 / (1 + far);
            // Beyond its disc the sink leaves the film that keeps a stretch of water whole: a sink that asks for a
            // lot digs a hole around itself, it does not cut itself off the rest of the lake.
            const kept = far > radius ? FAR_MIN_DEPTH_PX : 0;
            const over = Math.max(0, Math.min(depth[index] - kept, surface - foot));
            above[head] = over;
            weights[head] = weight;
            held += over;
            if (over / weight > steepest) steepest = over / weight;
            for (let side = 0; side < 4 && count < cells.length; side++) {
                const inside =
                    side === 0 ? column + 1 < width : side === 1 ? column > 0 : side === 2 ? row + 1 < height : row > 0;
                if (!inside || this.closed[index] & (1 << side)) continue;
                const neighbour = index + (side === 0 ? 1 : side === 1 ? -1 : side === 2 ? width : -width);
                if (this.seen[neighbour] === this.search) continue;
                const away = (neighbour % width) - startColumn;
                const down = Math.floor(neighbour / width) - startRow;
                // The disc of the sink was just emptied: the search goes through it, wet or dry. Beyond it, through
                // the water that stands over the foot of the sink only.
                if (away * away + down * down > radius * radius) {
                    if (depth[neighbour] < BASIN_JOIN_PX) continue;
                    if (ground[neighbour] + depth[neighbour] <= foot + LEVEL_PX) continue;
                }
                this.seen[neighbour] = this.search;
                cells[count++] = neighbour;
            }
        }
        if (held <= 0) return 0;
        // Each cell gives in proportion to its weight, never more than it holds over the foot of the sink: `rate`
        // is the water a cell of weight 1 gives. All of it when the sink asks for all there is.
        let rate = Infinity;
        if (held > wanted) {
            const given = (at: number): number => {
                let sum = 0;
                let free = 0;
                for (let place = 0; place < count; place++) {
                    const share = at * weights[place];
                    if (share < above[place]) {
                        sum += share;
                        free += weights[place];
                    } else sum += above[place];
                }
                this.basinFree = free;
                return sum;
            };
            let low = 0;
            let high = steepest;
            for (let turn = 0; turn < BASIN_RATE_TURNS; turn++) {
                const middle = (low + high) / 2;
                if (given(middle) > wanted) high = middle;
                else low = middle;
            }
            // What is still missing at this rate, shared between the cells that can still give.
            const missing = wanted - given(low);
            rate = this.basinFree > 0 ? low + missing / this.basinFree : low;
        }
        let taken = 0;
        for (let place = 0; place < count; place++) {
            const out = Math.min(above[place], rate * weights[place]);
            if (out <= 0) continue;
            depth[cells[place]] -= out;
            taken += out;
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

    /** The water stops where it is: what it was doing a step before no longer counts. */
    private forgetFlows(): void {
        this.flowEast.fill(0);
        this.flowSouth.fill(0);
        this.speedEast.fill(0);
        this.speedSouth.fill(0);
    }

    /**
     * Moves the water one step, with inertia: the flow between two cells picks up with the difference of their
     * surfaces and the water that passes between them, and never takes from a cell more than it holds. What holds
     * it back depends on where it runs (`waves`): the friction of the ground, slight in deep water and strong under
     * a thin sheet on land, rougher on some soils; a damping; and, where the front of a wave is steep for the water
     * it runs in, the wave breaks. The water also carries its momentum along: a wave that reaches a shore throws
     * itself up it. A deep or a fast water is moved in several shorter moves, so that it stays within what the
     * computation bears. The walls and the edge of the grid are those of `flow`; the waves are never cut at the
     * highest level the map sets, only at the highest a map may set. Returns whether any moved.
     */
    private flowWithInertia(tally: WaterTally, seconds: number | undefined, waves: WaveSettings | undefined): boolean {
        const { width, height } = this.bounds;
        const size = width * height;
        if (this.flowEast.length !== size) {
            this.flowEast = new Float32Array(size);
            this.flowSouth = new Float32Array(size);
            this.afford = new Float32Array(size);
            this.speedEast = new Float32Array(size);
            this.speedSouth = new Float32Array(size);
            this.nextSpeedEast = new Float32Array(size);
            this.nextSpeedSouth = new Float32Array(size);
        }
        const figure = (value: number | undefined, fallback: number): number =>
            value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
        const roughness = figure(waves?.roughness, DEFAULT_WAVE_SETTINGS.roughness);
        const damping = figure(waves?.damping, DEFAULT_WAVE_SETTINGS.damping);
        const breaking = figure(waves?.breaking, DEFAULT_WAVE_SETTINGS.breaking) * BREAKING_GAIN;
        const carried = Math.min(1, figure(waves?.momentum, DEFAULT_WAVE_SETTINGS.momentum));
        const step = seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 1) : 0.1;
        let deepest = 0;
        for (let index = 0; index < size; index++) if (this.depth[index] > deepest) deepest = this.depth[index];
        if (deepest <= DRY_PX) return false;
        const moves = Math.min(
            MAX_INERTIA_MOVES,
            Math.max(1, Math.ceil((Math.sqrt(GRAVITY * deepest) * step) / WAVE_CELLS_PER_MOVE)),
        );
        const dt = step / moves;
        // No water crosses more than half a cell in one move: a torrent down a cliff would otherwise ask for
        // shorter moves for the whole map (measured: one strong source on a mount doubled the cost of every step).
        const swiftest = Math.min(FASTEST_FLOW_CELLS, FASTEST_CELLS_PER_MOVE / dt);
        const depth = this.depth;
        const ground = this.ground;
        const closed = this.closed;
        const east = this.flowEast;
        const south = this.flowSouth;
        const afford = this.afford;
        let speedEast = this.speedEast;
        let speedSouth = this.speedSouth;
        let nextSpeedEast = this.nextSpeedEast;
        let nextSpeedSouth = this.nextSpeedSouth;
        const rough = this.rough;
        const hollow = this.hollow;
        const powers = DEPTH_POWERS;
        const lastPower = powers.length - 1;
        const pull = dt * GRAVITY;
        // The deepest water whose waves these moves bear: deeper, the slope pulls as on that depth.
        const pulled = (WAVE_CELLS_PER_MOVE / dt) ** 2 / GRAVITY;
        // What a cell at the edge of the grid loses by each of its open sides, as when the water creeps.
        const edgeShare = FLOW_SHARE / moves;
        // The highest the water may stand: a wave is not cut at the level the map sets for its floods.
        const top = Math.max(this.highest, MAX_WATER_MAX_SURFACE);
        let moved = false;
        for (let move = 0; move < moves; move++) {
            // The flows pick up and slow down.
            for (let row = 0; row < height; row++) {
                for (let column = 0; column < width; column++) {
                    const index = row * width + column;
                    const held = depth[index];
                    const bed = ground[index];
                    const surface = bed + held;
                    if (column + 1 < width) {
                        const other = index + 1;
                        const otherHeld = depth[other];
                        nextSpeedEast[index] = 0;
                        if ((held <= 0 && otherHeld <= 0) || closed[index] & 1) east[index] = 0;
                        else {
                            const otherBed = ground[other];
                            const otherSurface = otherBed + otherHeld;
                            // The water that passes: what stands over the higher of the two grounds.
                            const passing =
                                (surface > otherSurface ? surface : otherSurface) - (bed > otherBed ? bed : otherBed);
                            if (passing <= DRY_PX) east[index] = 0;
                            else {
                                const drop = surface - otherSurface;
                                const inWater = hollow[index] === 1 && hollow[other] === 1;
                                let flow = east[index] + pull * (passing > pulled ? pulled : passing) * drop;
                                if (carried > 0 && inWater) {
                                    // The water brings the speed it had upstream, along the row and across it.
                                    const along = speedEast[index];
                                    const alongChange =
                                        along > 0
                                            ? along - (column > 0 ? speedEast[index - 1] : 0)
                                            : (column + 2 < width ? speedEast[other] : 0) - along;
                                    const across =
                                        0.25 *
                                        (speedSouth[index] +
                                            speedSouth[other] +
                                            (row > 0 ? speedSouth[index - width] + speedSouth[other - width] : 0));
                                    const acrossChange =
                                        across > 0
                                            ? along - (row > 0 ? speedEast[index - width] : along)
                                            : (row + 1 < height ? speedEast[index + width] : along) - along;
                                    flow -= carried * dt * passing * (along * alongChange + across * acrossChange);
                                }
                                const speed = (flow < 0 ? -flow : flow) / passing;
                                const eighths = (passing * 8) | 0;
                                let rate =
                                    damping +
                                    roughness *
                                        0.5 *
                                        (rough[index] + rough[other]) *
                                        speed *
                                        powers[eighths > lastPower ? lastPower : eighths];
                                if (breaking > 0 && inWater) {
                                    const steep = (drop < 0 ? -drop : drop) / passing - BREAKING_CALM;
                                    if (steep > 0) rate += breaking * steep;
                                }
                                flow /= 1 + dt * rate;
                                if (flow > swiftest * passing) flow = swiftest * passing;
                                else if (flow < -swiftest * passing) flow = -swiftest * passing;
                                east[index] = flow;
                                // The speed the next move carries along: none through a film.
                                if (passing > 0.05) nextSpeedEast[index] = flow / passing;
                            }
                        }
                    }
                    if (row + 1 < height) {
                        const other = index + width;
                        const otherHeld = depth[other];
                        nextSpeedSouth[index] = 0;
                        if ((held <= 0 && otherHeld <= 0) || closed[index] & 4) south[index] = 0;
                        else {
                            const otherBed = ground[other];
                            const otherSurface = otherBed + otherHeld;
                            const passing =
                                (surface > otherSurface ? surface : otherSurface) - (bed > otherBed ? bed : otherBed);
                            if (passing <= DRY_PX) south[index] = 0;
                            else {
                                const drop = surface - otherSurface;
                                const inWater = hollow[index] === 1 && hollow[other] === 1;
                                let flow = south[index] + pull * (passing > pulled ? pulled : passing) * drop;
                                if (carried > 0 && inWater) {
                                    const along = speedSouth[index];
                                    const alongChange =
                                        along > 0
                                            ? along - (row > 0 ? speedSouth[index - width] : 0)
                                            : (row + 2 < height ? speedSouth[other] : 0) - along;
                                    const across =
                                        0.25 *
                                        (speedEast[index] +
                                            speedEast[other] +
                                            (column > 0 ? speedEast[index - 1] + speedEast[other - 1] : 0));
                                    const acrossChange =
                                        across > 0
                                            ? along - (column > 0 ? speedSouth[index - 1] : along)
                                            : (column + 1 < width ? speedSouth[index + 1] : along) - along;
                                    flow -= carried * dt * passing * (along * alongChange + across * acrossChange);
                                }
                                const speed = (flow < 0 ? -flow : flow) / passing;
                                const eighths = (passing * 8) | 0;
                                let rate =
                                    damping +
                                    roughness *
                                        0.5 *
                                        (rough[index] + rough[other]) *
                                        speed *
                                        powers[eighths > lastPower ? lastPower : eighths];
                                if (breaking > 0 && inWater) {
                                    const steep = (drop < 0 ? -drop : drop) / passing - BREAKING_CALM;
                                    if (steep > 0) rate += breaking * steep;
                                }
                                flow /= 1 + dt * rate;
                                if (flow > swiftest * passing) flow = swiftest * passing;
                                else if (flow < -swiftest * passing) flow = -swiftest * passing;
                                south[index] = flow;
                                if (passing > 0.05) nextSpeedSouth[index] = flow / passing;
                            }
                        }
                    }
                }
            }
            // The speeds of this move are those the next one carries along.
            const wasEast = speedEast;
            const wasSouth = speedSouth;
            speedEast = nextSpeedEast;
            speedSouth = nextSpeedSouth;
            nextSpeedEast = wasEast;
            nextSpeedSouth = wasSouth;
            // A cell never gives more than it holds: what it gives is cut down, by all its sides alike.
            for (let row = 0; row < height; row++) {
                for (let column = 0; column < width; column++) {
                    const index = row * width + column;
                    let out = 0;
                    if (column + 1 < width && east[index] > 0) out += east[index];
                    if (column > 0 && east[index - 1] < 0) out -= east[index - 1];
                    if (row + 1 < height && south[index] > 0) out += south[index];
                    if (row > 0 && south[index - width] < 0) out -= south[index - width];
                    afford[index] = out * dt > depth[index] ? depth[index] / (out * dt) : 1;
                }
            }
            for (let row = 0; row < height; row++) {
                for (let column = 0; column < width; column++) {
                    const index = row * width + column;
                    if (column + 1 < width && east[index] !== 0) {
                        east[index] *= east[index] > 0 ? afford[index] : afford[index + 1];
                        if (east[index] * dt > DRY_PX / 4 || east[index] * dt < -DRY_PX / 4) moved = true;
                    }
                    if (row + 1 < height && south[index] !== 0) {
                        south[index] *= south[index] > 0 ? afford[index] : afford[index + width];
                        if (south[index] * dt > DRY_PX / 4 || south[index] * dt < -DRY_PX / 4) moved = true;
                    }
                }
            }
            // The depths follow the flows.
            for (let row = 0; row < height; row++) {
                for (let column = 0; column < width; column++) {
                    const index = row * width + column;
                    let net = 0;
                    let outside = 0;
                    if (column + 1 < width) net -= east[index];
                    else outside++;
                    if (column > 0) net += east[index - 1];
                    else outside++;
                    if (row + 1 < height) net -= south[index];
                    else outside++;
                    if (row > 0) net += south[index - width];
                    else outside++;
                    let held = depth[index] + net * dt;
                    if (held < 0) held = 0;
                    if (held > 0) {
                        // Water at the edge of the grid falls away.
                        if (outside > 0 && held > DRY_PX) {
                            const gone = Math.min(held, held * edgeShare * outside);
                            held -= gone;
                            tally.lostPx += gone;
                            if (gone > DRY_PX / 4) moved = true;
                        }
                        // What stands over the highest level a map may set is lost.
                        const over = ground[index] + held - (this.spill[index] + top);
                        if (over > 0) {
                            const gone = Math.min(over, held);
                            held -= gone;
                            tally.lostPx += gone;
                            moved = true;
                        }
                    }
                    depth[index] = held;
                }
            }
        }
        this.speedEast = speedEast;
        this.speedSouth = speedSouth;
        this.nextSpeedEast = nextSpeedEast;
        this.nextSpeedSouth = nextSpeedSouth;
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
            const over = ground[index] + next[index] - (this.spill[index] + this.highest);
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
/** How many cells a disc of that radius holds at most: the wave of an impact goes further than a source pours. */
function discLimit(radius: number): number {
    return Math.max(MAX_DISC_CELLS, (2 * Math.ceil(radius) + 1) ** 2);
}

function radiusOf(radius: number | undefined, fallback: number): number {
    if (radius === undefined || !Number.isFinite(radius) || radius < 0) return fallback;
    return Math.min(MAX_RADIUS_CELLS, radius);
}

/** The moves of the water in a step, within their bounds; one for a step that says nothing. */
function flowStepsOf(flowSteps: number | undefined): number {
    if (flowSteps === undefined || !Number.isFinite(flowSteps) || flowSteps < 1) return 1;
    return Math.min(MAX_FLOW_STEPS, Math.round(flowSteps));
}
