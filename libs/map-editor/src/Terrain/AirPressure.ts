/**
 * The pressure of the air over the water, as a height of water: the inverted barometer. Under a low pressure the
 * sea stands higher, about 1 cm for each hPa (100 Pa over the weight of a cubic metre of water, ρ g: 1.02 cm in fresh
 * water; Pugh, Tides, Surges and Mean Sea-Level, 1987, ch. 7). The water runs down the slope of its surface plus this
 * height (WaterKernel.fluxPass): at rest, a dome under the low, the water drawn from where the pressure is higher.
 *
 * A vortex of the profile of Holland (1980): p(r) - p_far = -Δp (1 - exp(-(R/r)^B)), R the radius of its strongest
 * winds. Pure; WaterGrid fills its cells from it.
 */

import { TILE_PX } from "../types";
import { TILE_AREA_M2 } from "./Scale";

/** The air over the water: where its low is, how deep it is and how wide (map pixels), and its wind. */
export interface AirPressure {
    /** The centre of the low, map pixels. */
    x: number;
    y: number;
    /** How much higher the water stands under its centre than far from it, map pixels of water. */
    dropPx: number;
    /** The radius of the strongest winds R, map pixels, and the width of the profile B (Holland). */
    radiusPx: number;
    b: number;
    /** The wind at 10 m over a point of the map (map pixels), m/s towards the east and the south; none: still air. */
    wind?: (x: number, y: number) => { east: number; south: number };
    /** How many times its stress the wind pushes the water with (an exaggeration asked for): 1 when absent. */
    windGain?: number;
}

/** The density of fresh water (kg/m³) and the gravity (m/s²): a pressure as a height of water. */
const WATER_DENSITY = 1000;
const GRAVITY = 9.81;
/** Map pixels in a metre (Scale). */
const PX_PER_METRE = TILE_PX / Math.sqrt(TILE_AREA_M2);
/** The density of the air at the surface of the sea under a hurricane, kg/m³ (Holland 1980). */
const AIR_DENSITY = 1.15;

/** The height of water (m) a pressure (Pa) holds up: 1.02 cm for 1 hPa. */
export function waterHeightOfPressure(pascals: number): number {
    return pascals / (WATER_DENSITY * GRAVITY);
}

/** The share of the drop of its centre the low has at `distance` from it, in radii R: 1 at the centre, 0 far away. */
export function lowShare(distance: number, b: number): number {
    if (!(distance > 0)) return 1;
    return 1 - Math.exp(-(distance ** -b));
}

/**
 * The table of lowShare by distance (in radii R), TABLE_STEPS steps a radius up to TABLE_RADII radii, read straight
 * between its points: no power nor exponential for each cell. Past it, the share falls as (R/r)^B (its first term).
 */
const TABLE_STEPS = 64;
const TABLE_RADII = 64;
const tables = new Map<number, Float64Array>();
function tableOf(b: number): Float64Array {
    let table = tables.get(b);
    if (!table) {
        table = new Float64Array(TABLE_STEPS * TABLE_RADII + 2);
        for (let at = 0; at < table.length; at++) table[at] = lowShare(at / TABLE_STEPS, b);
        tables.set(b, table);
    }
    return table;
}

/** lowShare, read from its table: within a ten-thousandth of it. */
export function lowShareFast(distance: number, b: number): number {
    const table = tableOf(b);
    const at = distance * TABLE_STEPS;
    if (!(at >= 0)) return 1;
    if (at >= TABLE_STEPS * TABLE_RADII) return distance ** -b;
    const below = Math.floor(at);
    const share = at - below;
    return table[below] + (table[below + 1] - table[below]) * share;
}

/**
 * The height of water the pressure holds over each cell of a grid (map pixels, negative under the low): `x`, `y`
 * the first cell of the grid, `width` and `height` its cells, `cellPx` the side of a cell. Written in `out`.
 */
export function pressureHeads(
    pressure: AirPressure,
    x: number,
    y: number,
    width: number,
    height: number,
    cellPx: number,
    out: Float32Array,
): void {
    const { b, dropPx } = pressure;
    const over = 1 / pressure.radiusPx;
    for (let row = 0; row < height; row++) {
        const dy = (row + y + 0.5) * cellPx - pressure.y;
        for (let column = 0; column < width; column++) {
            const dx = (column + x + 0.5) * cellPx - pressure.x;
            out[row * width + column] = -dropPx * lowShareFast(Math.sqrt(dx * dx + dy * dy) * over, b);
        }
    }
}

/**
 * The drag coefficient of the sea surface for a wind of `speed` m/s at 10 m: 1.2e-3 up to 11 m/s, then growing with
 * the wind (Large and Pond, J. Phys. Oceanogr. 11, 1981: (0.49 + 0.065 U) 1e-3, measured to 25 m/s), and levelling
 * off at 2.5e-3 past about 31 m/s, where the spray and the foam of a hurricane keep the surface from getting rougher
 * (Powell, Vickery and Reinhold, Nature 422, 2003).
 */
export const MOST_DRAG = 2.5e-3;
export function seaDrag(speed: number): number {
    if (!(speed > 11)) return 1.2e-3;
    return Math.min(MOST_DRAG, (0.49 + 0.065 * speed) * 1e-3);
}

/** The stress of a wind of `speed` m/s on the water, Pa: ρ_air C_d U². */
export function windStress(speed: number): number {
    return speed > 0 ? AIR_DENSITY * seaDrag(speed) * speed * speed : 0;
}

/**
 * How hard a wind of (east, south) m/s pushes the water over a cell `cellPx` wide, as the flows of WaterKernel count
 * it: map pixels of water over a cell a second, a second (the depth a cell gains from a flow, per second). The stress
 * accelerates the water of a column of unit width: dq/dt = τ / ρ_w; a flow of a cell is q over its side, in pixels.
 * At rest in a closed basin it holds the surface aslant, dη/dx = τ / (ρ_w g h).
 */
export function windPush(east: number, south: number, cellPx: number): { east: number; south: number } {
    const speed = Math.hypot(east, south);
    if (!(speed > 0)) return { east: 0, south: 0 };
    const push = (windStress(speed) * PX_PER_METRE * PX_PER_METRE) / (WATER_DENSITY * cellPx);
    return { east: (push * east) / speed, south: (push * south) / speed };
}

/** The wind is read every this many cells each way, and straight between them: it changes over tens of cells. */
export const WIND_BLOCK_CELLS = 4;

/**
 * How hard the wind of `pressure` pushes the water over each cell of a grid (windPush), as pressureHeads lays its
 * heights: read at the corners of blocks of WIND_BLOCK_CELLS cells, straight between them. Zero without wind.
 */
export function windPushes(
    pressure: AirPressure,
    x: number,
    y: number,
    width: number,
    height: number,
    cellPx: number,
    outEast: Float32Array,
    outSouth: Float32Array,
): void {
    const wind = pressure.wind;
    if (!wind) {
        outEast.fill(0, 0, width * height);
        outSouth.fill(0, 0, width * height);
        return;
    }
    const gain = pressure.windGain !== undefined && Number.isFinite(pressure.windGain) ? pressure.windGain : 1;
    const block = WIND_BLOCK_CELLS;
    const across = Math.ceil(width / block) + 1;
    const down = Math.ceil(height / block) + 1;
    const cornersEast = new Float64Array(across * down);
    const cornersSouth = new Float64Array(across * down);
    for (let row = 0; row < down; row++) {
        for (let column = 0; column < across; column++) {
            const air = wind((x + column * block + 0.5) * cellPx, (y + row * block + 0.5) * cellPx);
            const push = windPush(air.east, air.south, cellPx);
            cornersEast[row * across + column] = push.east * gain;
            cornersSouth[row * across + column] = push.south * gain;
        }
    }
    for (let row = 0; row < height; row++) {
        const blockRow = Math.floor(row / block);
        const v = (row - blockRow * block) / block;
        for (let column = 0; column < width; column++) {
            const blockColumn = Math.floor(column / block);
            const u = (column - blockColumn * block) / block;
            const at = blockRow * across + blockColumn;
            const below = at + across;
            outEast[row * width + column] =
                (cornersEast[at] * (1 - u) + cornersEast[at + 1] * u) * (1 - v) +
                (cornersEast[below] * (1 - u) + cornersEast[below + 1] * u) * v;
            outSouth[row * width + column] =
                (cornersSouth[at] * (1 - u) + cornersSouth[at + 1] * u) * (1 - v) +
                (cornersSouth[below] * (1 - u) + cornersSouth[below + 1] * u) * v;
        }
    }
}
