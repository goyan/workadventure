import {
    MIN_WATER_MAX_SURFACE,
    DEFAULT_WAVE_SETTINGS,
    MAX_WATER_MAX_SURFACE,
    TERRAIN_CELL,
    TERRAIN_CHUNK,
    TILE_PX,
} from "../types";
import type { TerrainData, WaveSettings } from "../types";
import { TSUNAMI_BACKWASH_MS } from "../Catastrophe/Tsunami";
import { CELL_AREA_M2, LITRES_PER_M3, metresOf } from "./Scale";
import { DEFAULT_SOIL_ROUGHNESS, soilDrinks, soilRoughness } from "./Soils";
import { cellInMap, cellKey, cellOf, heightAt, reliefCells, soilAt } from "./TerrainGrid";
import type { MapCells } from "./TerrainGrid";
import { ballColumn, ballHalfHeight } from "./WaterBall";
import type { WaterBall } from "./WaterBall";
import { affordPass, depthsPass, DRY_PX, fluxPass, scalePass } from "./WaterKernel";
import type { InertiaMove } from "./WaterKernel";
import { pressureHeads, windPushes } from "./AirPressure";
import type { AirPressure } from "./AirPressure";
import { ordinaryWaterArrays, setWaterArrays, sharedWaterArrays, waterArrays, waterArraysFor } from "./WaterArrays";
import { WasmWaterKernel } from "./WaterKernelWasm";
import { waterPassRunner } from "./WaterBands";
import type { WaterArrays, WaterArraysSource } from "./WaterArrays";
import { LAND_DEPTH_BITS, lifeDepthClass, restLevelOf, SWIM_DEPTH_BITS, WATER_FILM_PX } from "./WaterView";
import type {
    RestLevelFields,
    RestLevelSearch,
    WaterCells,
    WaterCrossings,
    WaterSnapshot,
    WaterView,
} from "./WaterView";

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
export const MAX_WATER_SURFACE_PX = MIN_WATER_MAX_SURFACE;

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
/** How far a drain standing on a floor of the "Map" tool dries it, in cells (12 tiles): the corridors and the rooms around it. */
const FLOOR_DRAIN_REACH_CELLS = (12 * TILE_PX) / TERRAIN_CELL;
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
/** A column a ball closed stays closed while its water is within this of the underside of the ball, in pixels. */
const BALL_TOUCH_PX = 0.01;
/** The water a ball pushes away is laid within this many cells past the ball. */
const PUSH_BEYOND_CELLS = 8;
/** The most balls a grid takes. */
const MOST_BALLS = 255;

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
const FAR_MIN_DEPTH_PX = WATER_FILM_PX;
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
/** The heights of the pressure and the push of the wind over the water are made again at least this often (steps). */
const FILL_HEADS_STEPS = 10;
/**
 * The speed of the water with inertia is told to the browsers by blocks of this many cells a side, one byte for
 * each of its two parts (east, south), in this many units a cell a second: within about 32 cells a second, to a
 * quarter of a cell a second.
 */
export const SPEED_BLOCK_CELLS = 4;
export const SPEED_UNITS = 4;
/**
 * The water slower than half of one of those units (told 0) is told apart, block by block, in this many units a
 * cell a second (two signed bytes a block, 0 where the speeds above say more): the slow currents of a pond a source
 * feeds, to about 2 mm a second. Linear: the range is that of half a quarter of a cell a second (from 5 to 31
 * units), a law that spreads it would gain nothing; few values, so that it zips well.
 */
export const SLOW_SPEED_UNITS = 250;

/** How wide a cell of the relief is, in metres. */
export const CELL_METRES = Math.sqrt(CELL_AREA_M2);

/**
 * The slowest water whose speed is told, in metres a second: slower, it is told still (it costs no byte), and the
 * view of the flows draws no arrow there.
 */
export const SLOWEST_TOLD_METRES = 0.01;
/** The same, in cells a second. */
export const SLOWEST_TOLD_CELLS = SLOWEST_TOLD_METRES / CELL_METRES;

/** The byte of a slow speed (cells a second, as seen): 0 under SLOWEST_TOLD_CELLS, or where the speeds tell it. */
export function slowSpeedByte(speed: number): number {
    if (!Number.isFinite(speed) || Math.abs(speed) < SLOWEST_TOLD_CELLS) return 0;
    if (Math.round(speed * SPEED_UNITS) !== 0) return 0;
    const units = Math.round(speed * SLOW_SPEED_UNITS);
    return (units > 127 ? 127 : units < -127 ? -127 : units) & 255;
}

/** The speed, in cells a second, a byte of the slow speeds tells. */
export function slowSpeedOf(byte: number): number {
    return ((byte << 24) >> 24) / SLOW_SPEED_UNITS;
}

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
 * The most moves of the water with inertia in a step, on a map that says nothing, and the most a map may ask for.
 * Deeper than what its moves bear (about 100 px of water for three), a wave runs no faster than in that depth, and
 * no water crosses more than half a cell in a move: one deep hole or one torrent would otherwise make every step of
 * the whole map longer (measured on a map with a pit of 300 px and a source of 50 m³/s).
 */
const USUAL_INERTIA_MOVES = 3;
const MOST_INERTIA_MOVES = 8;

/**
 * How long the water a tsunami left on a map is taken away once its sea is down, in seconds of the steps of the water
 * (of its time on a map faster than reality; its flow pace aside): the backwash of the tsunami (TSUNAMI_BACKWASH_MS),
 * twenty seconds. That is a game's choice, shorter than reality: a backwash runs at 2 to 5 m/s on land (flows at Banda
 * Aceh in 2004, Fritz et al. 2006, GRL 33, L24605; outflows up to 11 m/s at Kesennuma in 2011, Fritz et al. 2012,
 * GRL 39, L00G23), so it takes about a minute to cross a map of a couple of hundred metres; and what it leaves in
 * the low land stays far longer.
 *
 * What the backwash alone takes back by the coast is only part of it: on the map of Antoine, with the water it had
 * saved, two fifths of the water left by a tsunami of 8 m in a minute, seven tenths in three (measured
 * without evaporation nor a ground that drinks; a thin sheet on land runs slowly, held back by the ground). In
 * reality what stays in the low land stays for weeks: in 2011 the land around the airport of Sendai was drained by
 * pump trucks, from the 20th of March on, nine days after the tsunami (MLIT River Bureau, "A First Step to Revive
 * Sendai Airport", 27 March 2011). Here all of it goes in those twenty seconds, as those pumps took it in weeks: a
 * game's shortcut, not physics. Nothing of the water the map held before the tsunami goes with it (see
 * WaterGrid.ebbSea).
 */
export const SEA_EBB_SECONDS = TSUNAMI_BACKWASH_MS / 1000;

/**
 * Over how long the way the water of a map changes by itself (a river filling a hollow, a rain, a lake losing by an
 * edge) is averaged, in seconds of its time: what it would have gone on doing had no tsunami come (SeaFlood).
 */
const REST_RATE_SECONDS = 30;

/**
 * What a tsunami brought to a map, followed from the first step of its sea (WaterGrid.setSea): the depths before it
 * and their total (pixels), how fast that total changed by itself then (pixels a second) and the seconds of the
 * water since, what came in by the coast and went back out by it, what was taken away after it, and where its sea
 * is: rising (a crest coming in), ebbing (down to rest or gone, what it left being taken away, for `secondsLeft`
 * more), or ebbed (all taken, the sea still at rest at the coast).
 */
interface SeaFlood {
    before: Float32Array;
    beforePx: number;
    ratePx: number;
    seconds: number;
    inPx: number;
    outPx: number;
    takenPx: number;
    ebb: "rising" | "ebbing" | "ebbed";
    secondsLeft: number;
}

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
    /**
     * Rain falling on each sealed cell (see seal): the rain alone, without the runoff of the ground around, which
     * the coping of a pool keeps out. `rainPx` when absent.
     */
    sealedRainPx?: number;
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
    /** `adaptive` false: a sink on a floor keeps its flow and its disc instead of drying the floor. */
    flows: readonly { cellX: number; cellY: number; px: number; radius?: number; level?: number; adaptive?: false }[];
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
    /** The most moves the water with inertia makes in this step (WaterSettings.precision): three when absent. */
    moves?: number;
    /** How fast the water with inertia flows next to reality (WaterSettings.flowPace): 1 when absent. */
    pace?: number;
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
 * What computes the moves of the water with inertia: the passes written in TypeScript (WaterKernel.ts), or the
 * same passes compiled to WebAssembly (WaterKernelWasm.ts), about 1.6 times as fast. Both give the same water, to
 * the bit; a grid that asks for the compiled ones and cannot have them computes in TypeScript.
 */
export type WaterKernelKind = "typescript" | "wasm";

let usualKernel: WaterKernelKind = "typescript";
let usualShared = false;

/**
 * The kernel the grids made from now on, on this thread, compute with, and whether their arrays are in a memory
 * threads share (for the bands of the water): it sets where they keep their arrays (setWaterArrays), a compiled
 * kernel being a memory of its own for each grid.
 */
export function setWaterKernel(kind: WaterKernelKind, shared = false): void {
    usualKernel = kind;
    usualShared = shared;
    if (kind === "wasm") setWaterArrays(() => new WasmWaterKernel({ shared }));
    else setWaterArrays(shared ? sharedWaterArrays : ordinaryWaterArrays);
}

export function waterKernel(): WaterKernelKind {
    return usualKernel;
}

/**
 * What the grids made now really compute with: the usual kernel, or the TypeScript one when the compiled one was
 * asked for and cannot be had here, with the reason (`fallback`).
 */
export function waterKernelInUse(): { kernel: WaterKernelKind; fallback?: string } {
    if (usualKernel !== "wasm") return { kernel: "typescript" };
    const fallback = WasmWaterKernel.unavailable(usualShared);
    return fallback === undefined ? { kernel: "wasm" } : { kernel: "typescript", fallback };
}

/** The kernel a setting names (an environment variable, a key of the browser): the TypeScript one unless it says "wasm". */
export function waterKernelNamed(setting: string | null | undefined): WaterKernelKind {
    return setting === "wasm" ? "wasm" : "typescript";
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
export class WaterGrid implements WaterView {
    public readonly bounds: WaterGridBounds;
    /** Where the arrays the passes of its moves read and write are kept. */
    private readonly arrays: WaterArrays;
    private readonly ground: Float32Array;
    /** The level the water of each cell spills at (see spillLevels): a cell under it is in a hollow. */
    private readonly spill: Float32Array;
    /** The share of the absorption of the map the soil of each cell drinks (see soilDrinks). */
    private readonly drinks: Float32Array;
    private readonly blocked: Uint8Array;
    /** The cells indoors (see indoorCells): the floor of a room drains its water. */
    private readonly indoor: Uint8Array;
    /** The cells a floor of the "Map" tool covers (1): what a drain standing on it dries, its pools aside (sealed). */
    private floor = new Uint8Array(0);
    /** The floor each drain standing on one dries (floorAreaOf), by the cell it stands on: made once, kept. */
    private readonly floorAreas = new Map<number, Int32Array>();
    /**
     * For each cell, the sides the water cannot cross (a wall between two cells, or a blocked neighbour): a bit for
     * each side, in the order east, west, south, north.
     */
    private readonly closed: Uint8Array;
    /** The same sides as the walls alone close them: the doors that are closed are added to them (setClosedDoors). */
    private readonly wallClosed: Uint8Array;
    /** For the search of a sink: the cells of its queue, and the search that last saw each cell. */
    private readonly queue: Int32Array;
    /** The cells of the basin of a sink, while it is lowered. */
    private readonly basin: Int32Array;
    private readonly seen: Uint32Array;
    private search = 0;
    /** For the search of the level a water rests at (restLevelAt): sized when first asked. */
    private restSearch: RestLevelSearch = { seen: new Uint32Array(0), search: 0 };
    /** Counts the changes of what a snapshot copies seldom: the ground under the balls, the sides the doors close. */
    private shape = 0;
    /** For `crossings`: the depths of each cell that count for the life as last looked at, and the two numbers. */
    private lifeClass = new Uint8Array(0);
    private swimCrossings = 0;
    private landCrossings = 0;
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
    private flowEast: Float32Array = new Float32Array(0);
    private flowSouth: Float32Array = new Float32Array(0);
    private afford: Float32Array = new Float32Array(0);
    /** The water each row lost at the last move of the water with inertia (see depthsPass). */
    private rowLost: Float64Array = new Float64Array(0);
    /** The speed of the water through each of those passages at the move before, for the momentum it carries. */
    private speedEast: Float32Array = new Float32Array(0);
    private speedSouth: Float32Array = new Float32Array(0);
    /** The same speeds as this move makes them: they take the place of the others when it ends. */
    private nextSpeedEast: Float32Array = new Float32Array(0);
    private nextSpeedSouth: Float32Array = new Float32Array(0);
    /**
     * The pressure of the air over each cell as a height of water (AirPressure.pressureHeads), for the water with
     * inertia; and the low it was made for (undefined: none, the flows as without it).
     */
    private head: Float32Array = new Float32Array(0);
    /** How hard the wind over the water pushes it over each cell (AirPressure.windPushes), east and south. */
    private windEast: Float32Array = new Float32Array(0);
    private windSouth: Float32Array = new Float32Array(0);
    private pressure: AirPressure | undefined;
    private headFor:
        | { pressure: AirPressure; x: number; y: number; width: number; height: number; steps: number }
        | undefined;
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
    /** The compiled kernel of this grid, when it computes with one: its arrays live in its memory. */
    private readonly wasm: WasmWaterKernel | undefined;
    /** The cells the runoff does not reach (see seal): 1 for a sealed cell. */
    private readonly sealed: Uint8Array;
    /** How high the water of this map may stand over the level it spills at (see setMaxSurface). */
    private highest: number = MAX_WATER_SURFACE_PX;
    /** The sea at the east edge (setSea), and the ceiling of the water it raised, which comes down after it. */
    private sea: { levelPx: number; topPx: number } | undefined;
    private seaTop = 0;
    /** What the sea of a tsunami brought, from its first step until it was taken back (see setSea, ebbSea). */
    private flood: SeaFlood | undefined;
    /**
     * How fast all the water of the grid changed by itself over the last REST_RATE_SECONDS while no sea stood
     * (pixels a second): what came in less what went, from the tallies of its steps.
     */
    private restRate = 0;
    /** Over how many seconds that rate is averaged yet: REST_RATE_SECONDS once the grid has stepped that long. */
    private restSeconds = 0;
    /**
     * The moves the water with inertia made at its last step, and the share of the real speed of its fastest waves
     * they bore (1: all of it): fewer moves than the depth asks for bear the waves of `pulled` pixels of water only.
     */
    private lastMoves = 0;
    private lastCelerity = 1;
    private next: Float32Array;
    /**
     * The balls standing in the water (setBalls), and what they changed. A ball is a solid: where it touches the
     * water of a column, the water it leaves no room for stands on its top (`ground` and `spill` are raised to it
     * for that column, so every move of the water reads it as a ground), and the water that fits under it is put
     * aside (`under`) until the ball goes. None of these arrays exists on a map where no ball ever stood.
     */
    private balls: Required<WaterBall>[] = [];
    /** The cells the balls reach, and how high each stands there over the altitude 0 (see ballHalfHeight). */
    private ballCells: number[] = [];
    private ballHalf: Float32Array = new Float32Array(0);
    /** For each of those cells, which ball stands the highest there: the one that pushes its water away. */
    private ballOwner: Uint8Array = new Uint8Array(0);
    /** And the level that ball is held at. */
    private ballLevel: Float32Array = new Float32Array(0);
    /** The cells a ball closed: 1 where the ground is raised to its top. */
    private ballClosed: Uint8Array = new Uint8Array(0);
    /** The water put aside under a ball, in each cell it closed. */
    private under: Float32Array = new Float32Array(0);
    /** The ground and the level the water spills at, as they are without any ball. */
    private bareGround: Float32Array = new Float32Array(0);
    private bareSpill: Float32Array = new Float32Array(0);

    constructor(
        terrain: TerrainData | undefined,
        bounds: WaterGridBounds | undefined,
        blocked?: (cellX: number, cellY: number) => boolean,
        walls?: WaterWallSides,
        /** The walls that close the rooms (doors closed): what they close is indoors. No room when absent. */
        rooms?: WaterWallSides,
        /**
         * Where the arrays the passes of its moves read and write are kept (WaterArrays), or what makes
         * that place for the size of the grid: where the grids of this thread usually are (ordinary memory, unless
         * setWaterArrays said otherwise) when absent.
         */
        where: WaterArraysSource = waterArrays(),
    ) {
        this.bounds = bounds ?? { x: 0, y: 0, width: 0, height: 0 };
        const size = this.bounds.width * this.bounds.height;
        // The place is made for the size of the grid: a memory sized once knows what it will be asked for.
        const arrays = waterArraysFor(where, size, this.bounds.height);
        this.arrays = arrays;
        this.ground = arrays.floats(size);
        // A compiled kernel is where its grid keeps its arrays: loaded, it runs the passes of its moves.
        this.wasm = arrays instanceof WasmWaterKernel && arrays.ready() ? arrays : undefined;
        this.blocked = new Uint8Array(size);
        this.depth = arrays.floats(size);
        this.sealed = new Uint8Array(size);
        // The depths and these change places at each step of the water that creeps: kept where the depths are.
        this.next = arrays.floats(size);
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
        this.spill = arrays.floats(size);
        this.spill.set(spillLevels(this.ground, this.bounds.width, this.bounds.height));
        this.indoor = indoorCells(this.bounds, rooms);
        this.drinks = new Float32Array(size);
        this.rough = arrays.floats(size);
        this.hollow = arrays.bytes(size);
        for (let row = 0; row < this.bounds.height; row++) {
            for (let column = 0; column < this.bounds.width; column++) {
                const index = row * this.bounds.width + column;
                const soil = soilAt(terrain, this.bounds.x + column, this.bounds.y + row);
                this.rough[index] = soilRoughness(soil) ** 2 * MANNING;
                this.hollow[index] = this.ground[index] < this.spill[index] ? 1 : 0;
                this.drinks[index] = soilDrinks(soil, this.ground[index] < this.spill[index]);
            }
        }
        this.closed = arrays.bytes(size);
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
        this.wallClosed = Uint8Array.from(this.closed);
    }

    /**
     * The floors of the "Map" tool laid on the ground (tile keys, see pavedTilesOf): a drain standing on one is the
     * drain of a building, and keeps its floor dry (see step). A pool dug in the floor is not floor.
     */
    public setFloors(tiles: ReadonlySet<string>): void {
        const { x, y, width, height } = this.bounds;
        const floor = new Uint8Array(width * height);
        const cellsATile = TILE_PX / TERRAIN_CELL;
        for (const key of tiles) {
            const tile = cellOf(key);
            for (let dy = 0; dy < cellsATile; dy++) {
                for (let dx = 0; dx < cellsATile; dx++) {
                    const column = tile.x * cellsATile + dx - x;
                    const row = tile.y * cellsATile + dy - y;
                    if (column < 0 || row < 0 || column >= width || row >= height) continue;
                    const index = row * width + column;
                    if (!this.blocked[index]) floor[index] = 1;
                }
            }
        }
        this.floor = floor;
        this.floorAreas.clear();
    }

    /**
     * The doors that are closed now: the water does not cross their sides (keys of cellKey, as the walls), on top
     * of the walls the grid was built with. An open door is simply not told: the water goes through it.
     */
    public setClosedDoors(doors: WaterWallSides | undefined): void {
        const { x, y, width, height } = this.bounds;
        this.shape++;
        // A door that closes or opens joins or cuts bodies of water.
        this.swimCrossings++;
        this.closed.set(this.wallClosed);
        if (!doors) return;
        for (const key of doors.east) {
            const cell = cellOf(key);
            const column = cell.x - x;
            const row = cell.y - y;
            if (column < 0 || row < 0 || column + 1 >= width || row >= height) continue;
            const index = row * width + column;
            this.closed[index] |= 1;
            this.closed[index + 1] |= 2;
        }
        for (const key of doors.south) {
            const cell = cellOf(key);
            const column = cell.x - x;
            const row = cell.y - y;
            if (column < 0 || row < 0 || column >= width || row + 1 >= height) continue;
            const index = row * width + column;
            this.closed[index] |= 4;
            this.closed[index + width] |= 8;
        }
    }

    /**
     * These cells are sealed (the basin of a pool, behind its coping): the runoff of the ground around does not
     * come into them, they take the rain that falls on them only (WaterStepInput.sealedRainPx). The cells sealed
     * before are forgotten.
     */
    public seal(cells: readonly { cellX: number; cellY: number }[]): void {
        this.sealed.fill(0);
        // The floors the drains dry go round the pools: made again with these ones.
        this.floorAreas.clear();
        for (const { cellX, cellY } of cells) {
            const index = this.indexOf(cellX, cellY);
            if (index !== undefined) this.sealed[index] = 1;
        }
    }

    /** What computes the moves of the water with inertia of this grid. */
    public kernelName(): WaterKernelKind {
        return this.wasm ? "wasm" : "typescript";
    }

    /** Pixels of water over a cell of the map: 0 outside the grid. */
    public depthAt(cellX: number, cellY: number): number {
        const index = this.indexOf(cellX, cellY);
        return index === undefined ? 0 : this.depth[index];
    }

    /**
     * How far the water of a cell stands over what it held before the sea of a tsunami came (pixels), while what
     * the sea brought is followed (seaFlood): what lifts the ice of a lake. 0 otherwise, and where it stands lower.
     */
    public seaRiseAt(cellX: number, cellY: number): number {
        const flood = this.flood;
        const index = this.indexOf(cellX, cellY);
        if (!flood || index === undefined || flood.before.length !== this.depth.length) return 0;
        const held = this.depth[index] + (this.under.length === this.depth.length ? this.under[index] : 0);
        return Math.max(0, held - flood.before[index]);
    }

    public cells(): WaterCells {
        return { depth: this.depth, closed: this.closed };
    }

    /**
     * What changed of this water for what lives in it (WaterCrossings), looked at when asked: each cell is compared
     * with what it was the last time, by the depths that count for the life.
     */
    public crossings(): WaterCrossings {
        const depth = this.depth;
        if (this.lifeClass.length !== depth.length) {
            // The first look: nothing to compare with, the numbers stay where they are.
            this.lifeClass = new Uint8Array(depth.length);
            for (let index = 0; index < depth.length; index++) this.lifeClass[index] = lifeDepthClass(depth[index]);
            return { swim: this.swimCrossings, land: this.landCrossings };
        }
        const classes = this.lifeClass;
        let changed = 0;
        for (let index = 0; index < depth.length; index++) {
            const now = lifeDepthClass(depth[index]);
            if (now === classes[index]) continue;
            changed |= now ^ classes[index];
            classes[index] = now;
        }
        if (changed & SWIM_DEPTH_BITS) this.swimCrossings++;
        if (changed & LAND_DEPTH_BITS) this.landCrossings++;
        return { swim: this.swimCrossings, land: this.landCrossings };
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
        // The water a ball holds under itself is still water of the map.
        for (const index of this.ballCells) total += this.under[index];
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
    /**
     * The low of the air over the water (a hurricane) and its wind, or none: the water with inertia runs down the
     * slope of its surface plus the height of water the pressure holds (the inverted barometer), and the wind pushes
     * it (its stress on the surface). Read at the next step.
     */
    public setPressure(pressure: AirPressure | undefined): void {
        this.pressure =
            pressure &&
            Number.isFinite(pressure.x) &&
            Number.isFinite(pressure.y) &&
            pressure.dropPx >= 0 &&
            (pressure.dropPx > 0 || pressure.wind !== undefined) &&
            pressure.radiusPx > 0 &&
            pressure.b > 0
                ? pressure
                : undefined;
    }

    /**
     * The sea beyond the east edge of the grid, or none (read by the water with inertia only: the water that creeps
     * would lose it again by the edge at once): its level (pixels of altitude), and how high the water may
     * stand over the level it spills at while it is there (`topPx`). The last column of the grid is then the coast:
     * before each move of the water, each of its cells holds the water the sea puts there (none where its ground
     * stands over the sea), and the moves carry it inland, or back to the sea, as they carry any water; what crosses
     * the coast is counted as a source coming in and as a sink going out, not as water lost by the edge. Read at the
     * next step. Once the sea is gone, the higher ceiling comes down with the water that stands over the usual one,
     * never under it: nothing is cut that the sea brought.
     */
    public setSea(sea: { levelPx: number; topPx: number; ebbing?: boolean } | undefined): void {
        if (sea && Number.isFinite(sea.levelPx) && Number.isFinite(sea.topPx)) {
            this.sea = { levelPx: sea.levelPx, topPx: Math.max(0, sea.topPx) };
            this.seaTop = Math.max(this.seaTop, this.sea.topPx);
        } else this.sea = undefined;
        this.followFlood(sea !== undefined && this.sea !== undefined, sea?.ebbing === true);
    }

    /**
     * What the sea brought and what it takes back. Its first step keeps the water of the map as it stands (its
     * lakes, its pools, its rivers): what the map goes back to. While the sea rises, a new crest included, nothing
     * is taken; once it is down (its backwash, `ebbing`) or gone (a tsunami stopped), the water it left is taken
     * away over SEA_EBB_SECONDS (ebbSea), and the state before is then forgotten once the sea is gone.
     */
    private followFlood(standing: boolean, ebbing: boolean): void {
        const flood = this.flood;
        if (standing && !ebbing) {
            if (!flood || flood.before.length !== this.depth.length) this.flood = this.floodFromNow();
            // A new crest over what the last one left: nothing is taken while it rises, the state before is kept.
            else flood.ebb = "rising";
            return;
        }
        if (!flood) return;
        if (flood.ebb === "rising") {
            flood.ebb = "ebbing";
            flood.secondsLeft = SEA_EBB_SECONDS;
        } else if (flood.ebb === "ebbed" && !standing) this.flood = undefined;
    }

    /** The water of the map before the sea came: what it goes back to (see SeaFlood). */
    private floodFromNow(): SeaFlood {
        const before = Float32Array.from(this.depth);
        // The water a ball holds under itself is of the map too: it comes back to its column when the ball goes.
        for (const index of this.ballCells) before[index] += this.under[index];
        let beforePx = 0;
        for (let index = 0; index < before.length; index++) beforePx += before[index];
        return {
            before,
            beforePx,
            ratePx: this.restRate,
            seconds: 0,
            inPx: 0,
            outPx: 0,
            takenPx: 0,
            ebb: "rising",
            secondsLeft: 0,
        };
    }

    /**
     * The water a map that had no tsunami would hold now (pixels): what it held before the sea came, going on as it
     * went then (a river filling a hollow, a rain, a lake losing by an edge). What an ebb brings the map back to.
     */
    private floodExpectedPx(flood: SeaFlood): number {
        return flood.beforePx + flood.ratePx * flood.seconds;
    }

    /**
     * After each step, how the water changed by itself, while no sea stands; with a sea, the time it has stood.
     * `tally` absent: a step the grid was not moved, at rest (WaterSimulation does not step a still grid).
     */
    private followRate(seconds: number, tally?: WaterTally): void {
        if (this.flood) {
            this.flood.seconds += seconds;
            return;
        }
        const net = tally
            ? tally.rainPx + tally.sourcesPx - tally.sinksPx - tally.evaporationPx - tally.absorptionPx - tally.lostPx
            : 0;
        // The mean over what the grid lived yet, then over the last REST_RATE_SECONDS.
        this.restSeconds = Math.min(REST_RATE_SECONDS, this.restSeconds + seconds);
        this.restRate += (net / seconds - this.restRate) * Math.min(1, seconds / this.restSeconds);
    }

    /** A step of the water left out because it is at rest (see followRate): nothing changed for `seconds`. */
    public stillFor(seconds: number): void {
        if (Number.isFinite(seconds) && seconds > 0) this.followRate(seconds);
    }

    /**
     * What the sea of the last tsunami brought, while it is followed (from its first step until what it left is
     * taken away, its sea gone): in by the coast, back out by it, and taken away after it (pixels of water over a
     * cell); whether it is being taken away. Undefined otherwise.
     */
    public seaFlood():
        | { inPx: number; outPx: number; takenPx: number; beforePx: number; expectedPx: number; ebbing: boolean }
        | undefined {
        const flood = this.flood;
        if (!flood) return undefined;
        const { inPx, outPx, takenPx, beforePx } = flood;
        return {
            inPx,
            outPx,
            takenPx,
            beforePx,
            expectedPx: this.floodExpectedPx(flood),
            ebbing: flood.ebb === "ebbing",
        };
    }

    /** Whether the water a tsunami left is being taken away: the grid keeps stepping while it is. */
    public seaEbbing(): boolean {
        return this.flood?.ebb === "ebbing";
    }

    /**
     * After a step, a share of what the sea left: the water over what each cell held before it came, never more
     * than what the sea brought and did not take back, nor more than the map holds over what it would hold without
     * it (floodExpectedPx: what the ground drank, the drains took or an edge lost of it is gone already; what a river
     * or a rain brought meanwhile stays). Each cell over its depth before gives
     * by the share of its excess: the water of a lake, a pool or a river is never taken, and a hollow the sea
     * filled is emptied with the land. The share is what the time left of the ebb asks: what remains goes evenly
     * over it, the last of it at its last step. Returns what it took.
     */
    private ebbSea(seconds: number): number {
        const flood = this.flood;
        if (!flood || flood.ebb !== "ebbing") return 0;
        const depth = this.depth;
        const before = flood.before;
        if (before.length !== depth.length) {
            this.flood = undefined;
            return 0;
        }
        // What a cell holds, the water a ball keeps under itself included (as in the state before).
        const under = this.under.length === depth.length ? this.under : undefined;
        let excess = 0;
        let total = 0;
        for (let index = 0; index < depth.length; index++) {
            const held = depth[index] + (under ? under[index] : 0);
            total += held;
            if (held > before[index]) excess += held - before[index];
        }
        const left = Math.min(flood.inPx - flood.outPx - flood.takenPx, total - this.floodExpectedPx(flood));
        const last = flood.secondsLeft <= seconds;
        const asked = last ? left : (left * seconds) / flood.secondsLeft;
        const share = asked > 0 && excess > 0 ? Math.min(1, asked / excess) : 0;
        let taken = 0;
        if (share > 0) {
            for (let index = 0; index < depth.length; index++) {
                const held = depth[index];
                const kept = under ? under[index] : 0;
                const over = held + kept - before[index];
                if (over <= 0) continue;
                // Under a ball, only what stands over it may go: what it keeps under itself stays.
                depth[index] = Math.max(0, share >= 1 ? before[index] - kept : held - over * share);
                taken += held - depth[index];
            }
        }
        flood.takenPx += taken;
        flood.secondsLeft -= seconds;
        if (last) {
            flood.ebb = "ebbed";
            // The sea gone, nothing is followed any more; while it stands at rest, a new crest is told apart.
            if (!this.sea) this.flood = undefined;
        }
        return taken;
    }

    /** The moves the water with inertia made at its last step: 0 when it made none. */
    public movesMade(): number {
        return this.lastMoves;
    }

    /**
     * The share of the real speed of its fastest waves (those of its deepest water) the last step of the water with
     * inertia bore: under 1 when it made fewer moves than that depth asks for (`pulled`), as on a server that eased.
     */
    public celerityShare(): number {
        return this.lastCelerity;
    }

    /**
     * The highest the water may stand over the level it spills at, as the last step of the water with inertia had it
     * (pixels): the usual ceiling, or the higher one of the sea of a tsunami while the water it brought stands over it.
     */
    public ceilingPx(): number {
        return Math.max(this.highest, MAX_WATER_MAX_SURFACE, this.seaTop);
    }

    /** Whether the sea stands at the east edge (setSea). */
    public hasSea(): boolean {
        return this.sea !== undefined;
    }

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
     * Takes a share of the water of the ring around a cell: of each cell further than `inner` cells from it and no
     * further than `outer`, reached from it without crossing a wall, the share `share` gives for its distance (0 to
     * 1). Returns the water taken; undefined outside the grid or in a wall.
     */
    public takeRing(
        cellX: number,
        cellY: number,
        inner: number,
        outer: number,
        share: (distanceCells: number) => number,
    ): number | undefined {
        const centre = this.indexOf(cellX, cellY);
        if (centre === undefined || this.blocked[centre]) return undefined;
        const { width } = this.bounds;
        const column = centre % width;
        const row = (centre - column) / width;
        let takenPx = 0;
        for (const index of this.discAround(centre, outer, discLimit(outer))) {
            if (this.depth[index] <= 0) continue;
            const x = index % width;
            const distance = Math.hypot(x - column, (index - x) / width - row);
            if (distance <= inner) continue;
            const part = share(distance);
            if (!Number.isFinite(part) || part <= 0) continue;
            const taken = this.depth[index] * Math.min(1, part);
            this.depth[index] -= taken;
            takenPx += taken;
        }
        return takenPx;
    }

    /**
     * Lays up to `px` of water on the ring around a cell: the cells further than `inner` cells from it and no further
     * than `outer`, reached from it without crossing a wall (all the disc when `inner` is negative). Each cell takes
     * an even share, never over its highest level, and a cell already `deepPx` deep no more than `crestPx`: open water
     * only swells as a wave goes by, the ground around it is flooded. `overFlood` lets the water stand over the
     * level the map sets for its floods, up to the highest a map may set: the rim an impact throws up. Returns what
     * was laid.
     */
    public layRing(
        cellX: number,
        cellY: number,
        inner: number,
        outer: number,
        px: number,
        crestPx = Infinity,
        deepPx = Infinity,
        overFlood = false,
    ): number {
        const centre = this.indexOf(cellX, cellY);
        if (centre === undefined || this.blocked[centre] || px <= 0) return 0;
        const { width } = this.bounds;
        const column = centre % width;
        const row = (centre - column) / width;
        const top = overFlood ? Math.max(this.highest, MAX_WATER_MAX_SURFACE) : this.highest;
        const cells: number[] = [];
        const rooms: number[] = [];
        for (const index of this.discAround(centre, outer, discLimit(outer))) {
            const x = index % width;
            const y = (index - x) / width;
            if (inner >= 0 && (x - column) ** 2 + (y - row) ** 2 <= inner * inner) continue;
            let room = this.spill[index] + top - (this.ground[index] + this.depth[index]);
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

    /**
     * The balls standing on the map now (none: an empty list). A ball is a solid sphere whose centre is at the
     * altitude 0 (see WaterBall): in each column it reaches, it fills the heights between its underside and its
     * top, but for what of it is in the ground. Water lower than its underside is not touched and goes on running
     * under it. Where the water reaches it, the column is closed: what fits under the ball stays there, and the
     * ground of the column is, for the water, the top of the ball. The water the ball leaves no room for is handed
     * to the first open column away from the centre of the ball (see pushAway): a solid that moves pushes the
     * water in front of it, as fast as it moves and no faster. So a ball pushes away exactly the water of the part
     * of it that is in the water (Archimedes), no water is made nor lost, and the water comes back by itself once
     * the ball is gone. A column whose ground the ball rests on is closed even dry: the ball is in the way of a
     * water that comes.
     *
     * To be told at each step: a column the water has since risen in is closed then. Returns whether anything
     * changed for the water (a grid at rest has to move again).
     */
    public setBalls(balls: readonly WaterBall[]): boolean {
        const size = this.bounds.width * this.bounds.height;
        if (size === 0 || (balls.length === 0 && this.balls.length === 0)) return false;
        const { x, y, width, height } = this.bounds;
        const same =
            balls.length === this.balls.length &&
            balls.every(
                (ball, at) =>
                    ball.x === this.balls[at].x &&
                    ball.y === this.balls[at].y &&
                    ball.radiusPx === this.balls[at].radiusPx &&
                    (ball.levelPx ?? 0) === this.balls[at].levelPx,
            );
        if (this.ballHalf.length !== size) {
            this.ballHalf = new Float32Array(size);
            this.ballOwner = new Uint8Array(size);
            this.ballLevel = new Float32Array(size);
            this.ballClosed = new Uint8Array(size);
            this.under = new Float32Array(size);
            this.bareGround = Float32Array.from(this.ground);
            this.bareSpill = Float32Array.from(this.spill);
        }
        const half = this.ballHalf;
        const owner = this.ballOwner;
        const levels = this.ballLevel;
        let cells = this.ballCells;
        if (!same) {
            // The cells the balls reached before are looked at again with those they reach now.
            const before = cells;
            cells = [];
            for (const index of before) half[index] = -1;
            this.balls = balls.slice(0, MOST_BALLS).map((ball) => ({
                x: ball.x,
                y: ball.y,
                radiusPx: ball.radiusPx,
                levelPx: ball.levelPx ?? 0,
            }));
            for (let at = 0; at < this.balls.length; at++) {
                const ball = this.balls[at];
                if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y) || !(ball.radiusPx > 0)) continue;
                if (!Number.isFinite(ball.levelPx)) continue;
                const level = ball.levelPx;
                const fromRow = Math.max(0, Math.floor((ball.y - ball.radiusPx) / TERRAIN_CELL) - y);
                const toRow = Math.min(height - 1, Math.floor((ball.y + ball.radiusPx) / TERRAIN_CELL) - y);
                const fromColumn = Math.max(0, Math.floor((ball.x - ball.radiusPx) / TERRAIN_CELL) - x);
                const toColumn = Math.min(width - 1, Math.floor((ball.x + ball.radiusPx) / TERRAIN_CELL) - x);
                for (let row = fromRow; row <= toRow; row++) {
                    for (let column = fromColumn; column <= toColumn; column++) {
                        const index = row * width + column;
                        if (this.blocked[index]) continue;
                        const stands = ballHalfHeight(ball, column + x, row + y);
                        if (stands <= 0) continue;
                        // Where two balls meet, the one whose top is the higher fills the column.
                        if (half[index] <= 0) cells.push(index);
                        else if (stands + level <= half[index] + levels[index]) continue;
                        half[index] = stands;
                        levels[index] = level;
                        owner[index] = at;
                    }
                }
            }
            // A cell no ball reaches any more is told so once, then forgotten.
            for (const index of before) {
                if (half[index] >= 0) continue;
                half[index] = 0;
                cells.push(index);
            }
        }
        const depth = this.depth;
        const under = this.under;
        const closed = this.ballClosed;
        let changed = false;
        let kept = 0;
        for (const index of cells) {
            const bed = this.bareGround[index];
            const column = ballColumn(bed, half[index], levels[index]);
            const was = closed[index] === 1;
            // A closed column whose ball did not move keeps its water as it is: nothing to share again.
            if (same && was) {
                cells[kept++] = index;
                continue;
            }
            const water = depth[index] + under[index];
            // The water reaches the ball, or the ball rests on the ground: the column is closed. One that was
            // closed stays so while its water still touches the ball.
            const closes =
                column !== undefined &&
                (column.underPx <= 0 || (was ? water >= column.underPx - BALL_TOUCH_PX : water > column.underPx));
            if (column !== undefined && closes) {
                const surface = this.ground[index] + depth[index];
                const below = Math.fround(Math.min(water, column.underPx));
                // The surface of a column does not rise because a ball moved: only the water that already stood
                // over the top of the ball stays on it. The rest is pushed away.
                const stays = Math.min(water - below, Math.max(0, surface - column.topPx));
                const pushed = water - below - stays;
                if (!was || this.ground[index] !== column.topPx || pushed > 0) changed = true;
                under[index] = below;
                depth[index] = stays;
                this.ground[index] = column.topPx;
                this.spill[index] = this.bareSpill[index] + (column.topPx - bed);
                closed[index] = 1;
                // What finds no way out stands on the ball, and runs off it by itself.
                if (pushed > 0) depth[index] += this.pushAway(index, this.balls[owner[index]], pushed, surface);
            } else if (was) {
                under[index] = 0;
                depth[index] = water;
                this.ground[index] = bed;
                this.spill[index] = this.bareSpill[index];
                closed[index] = 0;
                changed = true;
            }
            if (half[index] > 0) cells[kept++] = index;
        }
        cells.length = kept;
        this.ballCells = cells;
        if (changed) this.shape++;
        return changed;
    }

    /**
     * Hands `px` of water a ball pushes out of a column to the open water in front of it: the first column that no
     * ball closes, going straight away from the centre of the ball, never through a wall nor off the grid. A column
     * takes no more than what brings it to the highest level of the map: the rest goes on to the next one. The water
     * is pushed aside, not up: the way ends at a ground higher than `level`, the level the water stood at. Returns
     * what found no room.
     */
    private pushAway(from: number, ball: WaterBall, px: number, level: number): number {
        const { x, y, width, height } = this.bounds;
        let column = from % width;
        let row = (from - column) / width;
        let dx = (column + x + 0.5) * TERRAIN_CELL - ball.x;
        let dy = (row + y + 0.5) * TERRAIN_CELL - ball.y;
        const away = Math.hypot(dx, dy);
        // The column under the centre of the ball has no way that is straight away: any will do.
        if (away < 1e-6) {
            dx = 1;
            dy = 0;
        } else {
            dx /= away;
            dy /= away;
        }
        // The way goes from side to side of the cells, in turn: how far along it the next side of each kind is.
        const perColumn = dx === 0 ? Infinity : Math.abs(1 / dx);
        const perRow = dy === 0 ? Infinity : Math.abs(1 / dy);
        let nextColumn = perColumn / 2;
        let nextRow = perRow / 2;
        let index = from;
        let left = px;
        const reach = Math.ceil((2 * ball.radiusPx) / TERRAIN_CELL) + PUSH_BEYOND_CELLS;
        for (let move = 0; move < reach && left > 0; move++) {
            let side: number;
            if (nextColumn <= nextRow) {
                side = dx > 0 ? 0 : 1;
                nextColumn += perColumn;
            } else {
                side = dy > 0 ? 2 : 3;
                nextRow += perRow;
            }
            column += side === 0 ? 1 : side === 1 ? -1 : 0;
            row += side === 2 ? 1 : side === 3 ? -1 : 0;
            if (column < 0 || row < 0 || column >= width || row >= height) break;
            if (this.closed[index] & (1 << side)) break;
            index = row * width + column;
            if (this.blocked[index]) break;
            if (this.ballClosed[index]) continue;
            if (this.ground[index] > level) break;
            const room = this.spill[index] + this.highest - (this.ground[index] + this.depth[index]);
            if (room <= 0) continue;
            const laid = Math.min(left, room);
            this.depth[index] += laid;
            left -= laid;
        }
        return left;
    }

    /**
     * The level of the water a point of the map stands in, in pixels of altitude: the median surface of the water
     * joined to that cell (over the few thousand cells nearest to it), so that neither a wave nor the water a ball
     * piles up changes it much; the ground of the cell where there is no water. The cells a
     * ball closes are looked through: under a ball, it is the level of the water around it. So are the dry cells
     * within `reachCells` of the point: a bed a ball just swept dry is still in its lake, at the level of the water
     * around the hole. A water lower than the ground of the point is not the water it stands in: on a shore, it is
     * the ground. Undefined outside the grid. It is where a ball held there is half in the water.
     */
    public restLevelAt(cellX: number, cellY: number, reachCells = 0): number | undefined {
        if (this.restSearch.seen.length !== this.depth.length) {
            this.restSearch = { seen: new Uint32Array(this.depth.length), search: 0 };
        }
        return restLevelOf(this.restFields(), this.restSearch, cellX, cellY, reachCells);
    }

    /** What the level of a water at rest is read from, in this grid. */
    private restFields(): RestLevelFields {
        const balls = this.ballClosed.length > 0;
        return {
            bounds: this.bounds,
            depth: this.depth,
            ground: this.ground,
            bareGround: balls ? this.bareGround : undefined,
            ballClosed: balls ? this.ballClosed : undefined,
            closed: this.closed,
        };
    }

    /**
     * Copies the water of this grid into a snapshot, for readers that are not where it is computed (WaterSnapshotView):
     * its depths each time, its ground and its closed sides when a ball or a door changed them. `version` is the
     * number that changes whenever the water does.
     */
    public publish(snapshot: WaterSnapshot, version: number): void {
        snapshot.write(this.restFields(), this.shape, version, this.crossings());
    }

    /** Whether a ball closes the column of a cell of the map: its water is on the ball, or held under it. */
    public ballAt(cellX: number, cellY: number): boolean {
        const index = this.indexOf(cellX, cellY);
        return index !== undefined && this.ballClosed.length > 0 && this.ballClosed[index] === 1;
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
        const sealedRain = input.sealedRainPx === undefined ? rain : amount(input.sealedRainPx);
        const evaporation = amount(input.evaporationPx);
        const absorption = amount(input.absorptionPx);
        const indoorDrain = amount(input.indoorDrainPx ?? 0);
        const depth = this.depth;
        if (rain > 0 || evaporation > 0 || absorption > 0 || indoorDrain > 0) {
            for (let index = 0; index < depth.length; index++) {
                if (this.blocked[index]) continue;
                // In a hollow: dug under the ground of the map, or under the rim of a crater on a mount.
                const dug = this.ground[index] < this.spill[index];
                const falling = this.sealed[index] ? sealedRain : rain;
                if (falling > 0 && dug) {
                    depth[index] += falling;
                    tally.rainPx += falling;
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
        let floorDrains: { area: Int32Array; level: number | undefined }[] = [];
        for (const flow of input.flows) {
            const index = this.indexOf(flow.cellX, flow.cellY);
            if (!Number.isFinite(flow.px) || flow.px === 0) continue;
            if (index === undefined || this.blocked[index]) {
                // A source outside the grid or in a wall pours nothing that stays.
                if (flow.px > 0) tally.lostPx += flow.px;
                continue;
            }
            // The drain of a building takes what reaches its floor, whatever its flow: it dries it at the end of the step.
            const area = flow.px < 0 && flow.adaptive !== false ? this.floorAreaOf(index) : undefined;
            if (area) {
                floorDrains = [...floorDrains, { area, level: flow.level }];
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
            if (this.flowWithInertia(tally, input.seconds, input.waves, input.moves, input.pace)) tally.moved = true;
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
        // Last, once the water moved: the floor of each drain of a building is dried, all that came in this step taken
        // (down to the level the drain holds, if it holds one).
        for (const { area, level } of floorDrains) {
            const taken = this.dryFloor(area, level);
            tally.sinksPx += taken;
            if (taken > 0) tally.moved = true;
        }
        // The seconds this step lived, as many as asked (a room catching up on the time it was empty lives minutes).
        const seconds =
            input.seconds !== undefined && Number.isFinite(input.seconds) && input.seconds > 0 ? input.seconds : 0.1;
        this.followRate(seconds, tally);
        // Once the sea of a tsunami is down, what it left goes, a share a step: counted with the sinks.
        if (this.flood?.ebb === "ebbing") {
            const taken = this.ebbSea(seconds);
            tally.sinksPx += taken;
            if (taken > 0) tally.moved = true;
        }
        return tally;
    }

    /**
     * The floor a drain standing at `index` keeps dry: the cells of the floor it stands on, joined to it without
     * crossing a wall (a door joins them: it is of the building), up to FLOOR_DRAIN_REACH_CELLS away. Undefined where
     * the drain stands on no floor: it is a drain of the ground, with its flow and its disc.
     */
    private floorAreaOf(index: number): Int32Array | undefined {
        if (this.floor[index] !== 1 || this.sealed[index]) return undefined;
        const known = this.floorAreas.get(index);
        if (known) return known;
        const { width, height } = this.bounds;
        const startColumn = index % width;
        const startRow = (index - startColumn) / width;
        const side = 2 * FLOOR_DRAIN_REACH_CELLS + 1;
        const queue = new Int32Array(side * side);
        const reached = new Uint8Array(width * height);
        queue[0] = index;
        reached[index] = 1;
        let tail = 1;
        for (let head = 0; head < tail; head++) {
            const cell = queue[head];
            const column = cell % width;
            const row = (cell - column) / width;
            const closed = this.wallClosed[cell];
            const neighbours = [
                { open: column + 1 < width && !(closed & 1), next: cell + 1, column: column + 1, row },
                { open: column > 0 && !(closed & 2), next: cell - 1, column: column - 1, row },
                { open: row + 1 < height && !(closed & 4), next: cell + width, column, row: row + 1 },
                { open: row > 0 && !(closed & 8), next: cell - width, column, row: row - 1 },
            ];
            for (const neighbour of neighbours) {
                // A pool dug in the floor (sealed, see seal) keeps its water: the floor goes round it.
                if (
                    !neighbour.open ||
                    reached[neighbour.next] ||
                    this.floor[neighbour.next] !== 1 ||
                    this.sealed[neighbour.next]
                ) {
                    continue;
                }
                const far = Math.max(Math.abs(neighbour.column - startColumn), Math.abs(neighbour.row - startRow));
                if (far > FLOOR_DRAIN_REACH_CELLS) continue;
                reached[neighbour.next] = 1;
                queue[tail++] = neighbour.next;
            }
        }
        const area = queue.slice(0, tail);
        this.floorAreas.set(index, area);
        return area;
    }

    /** Takes the water standing on `area`, down to `level` (pixels of altitude) when one is held. Returns what it took. */
    private dryFloor(area: Int32Array, level: number | undefined): number {
        const depth = this.depth;
        let taken = 0;
        for (const cell of area) {
            const kept = level === undefined ? 0 : Math.max(0, level - this.ground[cell]);
            const excess = depth[cell] - kept;
            if (excess <= 0) continue;
            depth[cell] = kept;
            taken += excess;
        }
        return taken;
    }

    /** The water of another grid (the map before an edit), kept cell by cell where this grid has the cell. */
    public takeFrom(other: WaterGrid): void {
        for (let row = 0; row < other.bounds.height; row++) {
            for (let column = 0; column < other.bounds.width; column++) {
                // The water a ball of the other grid held under itself comes along: this grid has no ball yet.
                const from = row * other.bounds.width + column;
                const held = other.depth[from] + (other.under.length > 0 ? other.under[from] : 0);
                if (held <= 0) continue;
                const index = this.indexOf(other.bounds.x + column, other.bounds.y + row);
                if (index !== undefined && !this.blocked[index]) this.depth[index] = held;
            }
        }
        this.takeFloodFrom(other);
    }

    /**
     * What the other grid followed of a tsunami, and how its water changed by itself: a map edited while a tsunami
     * goes on still goes back to its water before. The state before is kept cell by cell where this grid has the
     * cell (none where it is new, or a wall now).
     */
    private takeFloodFrom(other: WaterGrid): void {
        this.restRate = other.restRate;
        this.restSeconds = other.restSeconds;
        const flood = other.flood;
        if (!flood || flood.before.length !== other.depth.length) return;
        const before = new Float32Array(this.depth.length);
        let beforePx = 0;
        for (let row = 0; row < other.bounds.height; row++) {
            for (let column = 0; column < other.bounds.width; column++) {
                const held = flood.before[row * other.bounds.width + column];
                if (held <= 0) continue;
                const index = this.indexOf(other.bounds.x + column, other.bounds.y + row);
                if (index === undefined || this.blocked[index]) continue;
                before[index] = held;
                beforePx += held;
            }
        }
        this.flood = { ...flood, before, beforePx };
    }

    /**
     * The speed of the water, block by block (SPEED_BLOCK_CELLS cells a side, row by row): two signed bytes a
     * block, how fast it runs towards the east then towards the south, in SPEED_UNITS units a cell a second, as it
     * is seen (`pace` times its real speed, see WaterSettings.flowPace). It is what the block carries over the
     * water it holds. Undefined for a water that has no inertia: it keeps no flow to tell.
     */
    public writeSpeeds(pace = 1): Uint8Array | undefined {
        return this.writeSpeedBytes(pace)?.speeds;
    }

    /**
     * The speeds of writeSpeeds, and the slow ones apart (`slow`, in SLOW_SPEED_UNITS, for the blocks those speeds
     * tell still): the two are read together, the second by the browsers that know it. No `slow` when no water is
     * slow enough and fast enough for it: none is sent.
     */
    public writeSpeedBytes(pace = 1): { speeds: Uint8Array; slow?: Uint8Array } | undefined {
        const { width, height } = this.bounds;
        const size = width * height;
        if (this.flowEast.length !== size || size === 0) return undefined;
        const seen = Number.isFinite(pace) && pace > 0 ? pace : 1;
        const columns = Math.ceil(width / SPEED_BLOCK_CELLS);
        const rows = Math.ceil(height / SPEED_BLOCK_CELLS);
        const bytes = new Uint8Array(columns * rows * 2);
        const slow = new Uint8Array(columns * rows * 2);
        const depth = this.depth;
        const east = this.flowEast;
        const south = this.flowSouth;
        const byte = (speed: number): number => {
            const units = Math.round(speed * seen * SPEED_UNITS);
            return (units > 127 ? 127 : units < -127 ? -127 : units) & 255;
        };
        // Told only where `byte` says 0 (under half a unit): within 32 units, a signed byte.
        const slowByte = (speed: number): number => slowSpeedByte(speed * seen);
        for (let blockRow = 0; blockRow < rows; blockRow++) {
            for (let blockColumn = 0; blockColumn < columns; blockColumn++) {
                let held = 0;
                let towardsEast = 0;
                let towardsSouth = 0;
                const lastRow = Math.min(height, (blockRow + 1) * SPEED_BLOCK_CELLS);
                const lastColumn = Math.min(width, (blockColumn + 1) * SPEED_BLOCK_CELLS);
                for (let row = blockRow * SPEED_BLOCK_CELLS; row < lastRow; row++) {
                    for (let column = blockColumn * SPEED_BLOCK_CELLS; column < lastColumn; column++) {
                        const index = row * width + column;
                        if (depth[index] <= DRY_PX) continue;
                        held += depth[index];
                        // What crosses the cell: the mean of what comes in by one side and goes out by the other.
                        towardsEast += (east[index] + (column > 0 ? east[index - 1] : 0)) / 2;
                        towardsSouth += (south[index] + (row > 0 ? south[index - width] : 0)) / 2;
                    }
                }
                if (held <= DRY_PX) continue;
                const at = (blockRow * columns + blockColumn) * 2;
                bytes[at] = byte(towardsEast / held);
                bytes[at + 1] = byte(towardsSouth / held);
                // Both parts of a slow block: one of them may be fast enough for the speeds above.
                if (bytes[at] === 0 && bytes[at + 1] === 0) {
                    slow[at] = slowByte(towardsEast / held);
                    slow[at + 1] = slowByte(towardsSouth / held);
                }
            }
        }
        // No slow current: nothing to tell (a browser reads the speeds alone, as from a server that tells none).
        return slow.some((value) => value !== 0) ? { speeds: bytes, slow } : { speeds: bytes };
    }

    /**
     * How fast the water runs over a tile of the map (TILE_PX, its cells of the relief), in metres a second of the
     * map: as a block of writeSpeedBytes reads it, what its cells carry over the water they hold, on a finer square.
     * 0 where it is dry, out of the grid, and for a water without inertia (it keeps no flow). The speed is that of the
     * water itself, not as it is seen (flowPace).
     */
    public tileSpeedAt(tileX: number, tileY: number): number {
        const { width } = this.bounds;
        if (this.flowEast.length !== this.depth.length || this.depth.length === 0) return 0;
        const cells = TILE_PX / TERRAIN_CELL;
        const depth = this.depth;
        const east = this.flowEast;
        const south = this.flowSouth;
        let held = 0;
        let towardsEast = 0;
        let towardsSouth = 0;
        for (let dy = 0; dy < cells; dy++) {
            for (let dx = 0; dx < cells; dx++) {
                const cellX = tileX * cells + dx;
                const cellY = tileY * cells + dy;
                const index = this.indexOf(cellX, cellY);
                if (index === undefined || depth[index] <= DRY_PX) continue;
                const column = cellX - this.bounds.x;
                const row = cellY - this.bounds.y;
                held += depth[index];
                // What crosses the cell: the mean of what comes in by one side and goes out by the other.
                towardsEast += (east[index] + (column > 0 ? east[index - 1] : 0)) / 2;
                towardsSouth += (south[index] + (row > 0 ? south[index - width] : 0)) / 2;
            }
        }
        if (held <= DRY_PX) return 0;
        return (Math.hypot(towardsEast, towardsSouth) / held) * CELL_METRES;
    }

    /**
     * The depths as bytes: two for each cell, in eighths of a pixel. For sending: the water as it is seen, without
     * what a ball hides under itself. For saving (`whole`): all the water of each cell, so that the water under a
     * ball is not lost by a restart.
     */
    public writeDepths(whole = false): Uint8Array {
        const bytes = new Uint8Array(this.depth.length * 2);
        const under = whole && this.under.length > 0 ? this.under : undefined;
        for (let index = 0; index < this.depth.length; index++) {
            // Rounded to the nearest eighth, as Math.round does for a depth (never negative, and exact in eighths
            // before the half is added), four times faster.
            const scaled = (this.depth[index] + (under ? under[index] : 0)) * 8;
            const eighths = scaled >= 65535 ? 65535 : (scaled + 0.5) | 0;
            bytes[index * 2] = eighths & 255;
            bytes[index * 2 + 1] = eighths >> 8;
        }
        return bytes;
    }

    /** Reads depths written by a grid of the same size; bytes of another size are left alone. */
    public readDepths(bytes: Uint8Array): boolean {
        if (bytes.length !== this.depth.length * 2) return false;
        // The depths read are those of a map without any ball: the next step puts the balls back.
        this.setBalls([]);
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
    private flowWithInertia(
        tally: WaterTally,
        seconds: number | undefined,
        waves: WaveSettings | undefined,
        asked?: number,
        pace?: number,
    ): boolean {
        const { width, height } = this.bounds;
        const size = width * height;
        if (this.flowEast.length !== size) {
            this.flowEast = this.arrays.floats(size);
            this.flowSouth = this.arrays.floats(size);
            this.afford = this.arrays.floats(size);
            this.speedEast = this.arrays.floats(size);
            this.speedSouth = this.arrays.floats(size);
            this.nextSpeedEast = this.arrays.floats(size);
            this.nextSpeedSouth = this.arrays.floats(size);
            this.head = this.arrays.floats(size);
            this.windEast = this.arrays.floats(size);
            this.windSouth = this.arrays.floats(size);
            this.headFor = undefined;
        }
        const pressed = this.pressure !== undefined;
        if (this.pressure) this.fillHeads(this.pressure);
        const figure = (value: number | undefined, fallback: number): number =>
            value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
        const roughness = figure(waves?.roughness, DEFAULT_WAVE_SETTINGS.roughness);
        const damping = figure(waves?.damping, DEFAULT_WAVE_SETTINGS.damping);
        const breaking = figure(waves?.breaking, DEFAULT_WAVE_SETTINGS.breaking) * BREAKING_GAIN;
        const carried = Math.min(1, figure(waves?.momentum, DEFAULT_WAVE_SETTINGS.momentum));
        // The time the water lives through in this step: the real one, times the pace the map sets for its flow.
        const paced = pace !== undefined && Number.isFinite(pace) && pace > 0 ? Math.min(pace, 4) : 1;
        const step =
            (seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 1) : 0.1) * paced;
        const most =
            asked !== undefined && Number.isFinite(asked) && asked >= 1
                ? Math.min(MOST_INERTIA_MOVES, Math.round(asked))
                : USUAL_INERTIA_MOVES;
        const sea = this.sea;
        let deepest = 0;
        for (let index = 0; index < size; index++) if (this.depth[index] > deepest) deepest = this.depth[index];
        // The water the sea will lay on the coast counts: its bore needs the moves its depth asks for.
        if (sea) deepest = Math.max(deepest, this.seaDepth(sea.levelPx));
        this.lastMoves = 0;
        this.lastCelerity = 1;
        if (deepest <= DRY_PX) {
            // Nothing stands over the usual ceiling of a dry grid: the one the sea raised is down again.
            if (!sea) this.seaTop = 0;
            return false;
        }
        const moves = Math.min(
            most,
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
        // The table of powers as the passes read it: in the memory of the compiled kernel when there is one.
        const powers = this.wasm?.table(DEPTH_POWERS) ?? DEPTH_POWERS;
        const pull = dt * GRAVITY;
        // The deepest water whose waves these moves bear: deeper, the slope pulls as on that depth.
        const pulled = (WAVE_CELLS_PER_MOVE / dt) ** 2 / GRAVITY;
        this.lastMoves = moves;
        this.lastCelerity = deepest > pulled ? Math.sqrt(pulled / deepest) : 1;
        // What a cell at the edge of the grid loses by each of its open sides, as when the water creeps.
        const edgeShare = FLOW_SHARE / moves;
        // The highest the water may stand: a wave is not cut at the level the map sets for its floods.
        const top = Math.max(this.highest, MAX_WATER_MAX_SURFACE, this.seaCeiling(MAX_WATER_MAX_SURFACE));
        const move: InertiaMove = {
            width,
            height,
            depth,
            ground,
            spill: this.spill,
            closed,
            hollow,
            rough,
            powers,
            east,
            south,
            afford,
            speedEast,
            speedSouth,
            nextSpeedEast,
            nextSpeedSouth,
            dt,
            swiftest,
            pull,
            pulled,
            edgeShare,
            top,
            roughness,
            damping,
            breaking,
            carried,
            head: this.head,
            pressed: pressed ? 1 : 0,
            windEast: this.windEast,
            windSouth: this.windSouth,
            compiled: this.wasm,
        };
        if (this.rowLost.length !== height) this.rowLost = this.arrays.doubles(height);
        const rowLost = this.rowLost;
        // Several threads share the passes when this thread has what runs them and the arrays are theirs too.
        const runner = this.arrays.shared ? waterPassRunner() : undefined;
        if (this.wasm && !runner && !sea) {
            // The same passes, compiled: all the moves of the step in one call.
            const stepped = this.wasm.step(move, moves, tally.lostPx, rowLost);
            tally.lostPx = stepped.lost;
            // The speeds of a move take the place of those of the move before: an odd number of moves swaps them.
            if (moves % 2 === 1) {
                this.speedEast = nextSpeedEast;
                this.speedSouth = nextSpeedSouth;
                this.nextSpeedEast = speedEast;
                this.nextSpeedSouth = speedSouth;
            }
            return stepped.moved;
        }
        let moved = false;
        runner?.begin(this, move, rowLost);
        for (let step = 0; step < moves; step++) {
            // The sea lays its water on the coast before each move: the move carries it inland, or back.
            const laid = sea ? this.laySea(sea.levelPx) : undefined;
            if (sea && this.wasm && !runner) {
                // The compiled passes, one move at a time, so that the sea is laid between two moves.
                const stepped = this.wasm.step(move, 1, tally.lostPx, rowLost);
                tally.lostPx = stepped.lost;
                if (stepped.moved) moved = true;
                // The speeds of this move took the place of those of the move before.
                const wasEast = speedEast;
                const wasSouth = speedSouth;
                speedEast = move.speedEast = nextSpeedEast;
                speedSouth = move.speedSouth = nextSpeedSouth;
                nextSpeedEast = move.nextSpeedEast = wasEast;
                nextSpeedSouth = move.nextSpeedSouth = wasSouth;
                if (laid !== undefined) this.settleSea(laid, dt, tally);
                continue;
            }
            if (runner) runner.run(0);
            else fluxPass(move, 0, height);
            // The speeds of this move are those the next one carries along.
            const wasEast = speedEast;
            const wasSouth = speedSouth;
            speedEast = move.speedEast = nextSpeedEast;
            speedSouth = move.speedSouth = nextSpeedSouth;
            nextSpeedEast = move.nextSpeedEast = wasEast;
            nextSpeedSouth = move.nextSpeedSouth = wasSouth;
            if (runner) {
                runner.run(1);
                if (runner.run(2)) moved = true;
                if (runner.run(3)) moved = true;
            } else {
                affordPass(move, 0, height);
                if (scalePass(move, 0, height)) moved = true;
                if (depthsPass(move, 0, height, rowLost)) moved = true;
            }
            // The water lost, row after row: the same sum whoever computed which rows.
            for (let row = 0; row < height; row++) tally.lostPx += rowLost[row];
            if (laid !== undefined) this.settleSea(laid, dt, tally);
        }
        this.speedEast = speedEast;
        this.speedSouth = speedSouth;
        this.nextSpeedEast = nextSpeedEast;
        this.nextSpeedSouth = nextSpeedSouth;
        // The sea keeps the water moving for as long as it stands at the coast.
        return moved || sea !== undefined;
    }

    /** The deepest water the sea lays on the coast at that level (pixels): none on a grid of one column. */
    private seaDepth(levelPx: number): number {
        const { width, height } = this.bounds;
        if (width < 2) return 0;
        let deepest = 0;
        for (let row = 0; row < height; row++) {
            const index = row * width + width - 1;
            if (!this.blocked[index]) deepest = Math.max(deepest, levelPx - this.ground[index]);
        }
        return deepest;
    }

    /**
     * The sea lays its water on the coast (the last column): each cell holds what brings it to the level of the sea,
     * none where its ground stands over it. Returns the water it gave (taken, when negative) and the water then on
     * the coast; undefined on a grid of one column, which has no coast.
     */
    private laySea(levelPx: number): { givenPx: number; heldPx: number } | undefined {
        const { width, height } = this.bounds;
        if (width < 2) return undefined;
        const depth = this.depth;
        let givenPx = 0;
        let heldPx = 0;
        for (let row = 0; row < height; row++) {
            const index = row * width + width - 1;
            if (this.blocked[index]) continue;
            const held = Math.max(0, levelPx - this.ground[index]);
            givenPx += held - depth[index];
            heldPx += held;
            depth[index] = held;
        }
        return { givenPx, heldPx };
    }

    /**
     * After a move, what crossed the coast: the move counted as lost what the coast gave away by the edge of the grid
     * (into the sea); it is the sea's. The sea's give of the move (what it laid, less what came back to it) is
     * counted as a source, or as a sink when the water goes back to the sea.
     */
    private settleSea(laid: { givenPx: number; heldPx: number }, dt: number, tally: WaterTally): void {
        const { width, height } = this.bounds;
        const depth = this.depth;
        let after = 0;
        let seaward = 0;
        for (let row = 0; row < height; row++) {
            const index = row * width + width - 1;
            if (this.blocked[index]) continue;
            after += depth[index];
            // The flow from the land to the coast (eastwards), through the side of the cell before.
            seaward += this.flowEast[index - 1];
        }
        // What the coast lost by the edge of the grid (and over the highest level): its water before the move and
        // what came from the land, less what it holds now. Its cells give each other only what they take.
        const toSea = Math.max(0, laid.heldPx + seaward * dt - after);
        tally.lostPx -= toSea;
        const given = laid.givenPx - toSea;
        if (given > 0) tally.sourcesPx += given;
        else tally.sinksPx -= given;
        // What the sea brought, and what went back to it: what is taken away once it is down (ebbSea).
        if (this.flood) {
            if (given > 0) this.flood.inPx += given;
            else this.flood.outPx -= given;
        }
    }

    /**
     * The highest the water may stand over the level it spills at while the sea is there, or after it while the
     * water it brought stands over `usual`: that ceiling comes down with the water, so that nothing the sea brought
     * is cut. 0 once the water is under `usual` again.
     */
    private seaCeiling(usual: number): number {
        if (this.sea) return this.seaTop;
        if (this.seaTop <= 0) return 0;
        let over = 0;
        for (let index = 0; index < this.depth.length; index++) {
            if (this.depth[index] <= 0) continue;
            const above = this.ground[index] + this.depth[index] - this.spill[index];
            if (above > over) over = above;
        }
        this.seaTop = over > usual ? Math.min(this.seaTop, Math.ceil(over) + 1) : 0;
        return this.seaTop;
    }

    /**
     * The heights the pressure holds over the cells, made again when the low has moved by half a cell, its drop
     * changed by a hundredth, or the grid changed: the low of a hurricane crosses a cell in about half a second, so
     * every third step or so, and every FILL_HEADS_STEPS steps whatever (1.5 ms for the heights, 1.2 ms for the
     * wind, on 480 x 320 cells, measured on the Mac of the study).
     */
    private fillHeads(pressure: AirPressure): void {
        const { x, y, width, height } = this.bounds;
        const last = this.headFor;
        if (last) last.steps++;
        if (
            last &&
            // Made again every second at least: the wind over the water may turn while the low stays (its eye passing).
            last.steps < FILL_HEADS_STEPS &&
            last.x === x &&
            last.y === y &&
            last.width === width &&
            last.height === height &&
            last.pressure.radiusPx === pressure.radiusPx &&
            last.pressure.b === pressure.b &&
            last.pressure.windGain === pressure.windGain &&
            Math.abs(last.pressure.x - pressure.x) < TERRAIN_CELL / 2 &&
            Math.abs(last.pressure.y - pressure.y) < TERRAIN_CELL / 2 &&
            Math.abs(last.pressure.dropPx - pressure.dropPx) <= 0.01 * last.pressure.dropPx
        ) {
            return;
        }
        pressureHeads(pressure, x, y, width, height, TERRAIN_CELL, this.head);
        windPushes(pressure, x, y, width, height, TERRAIN_CELL, this.windEast, this.windSouth);
        this.headFor = { pressure, x, y, width, height, steps: 0 };
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
