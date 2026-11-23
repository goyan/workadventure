/**
 * The pressure of the air over the water, as a height of water: the inverted barometer. Under a low pressure the
 * sea stands higher, about 1 cm for each hPa (100 Pa over the weight of a cubic metre of water, ρ g: 1.02 cm in fresh
 * water; Pugh, Tides, Surges and Mean Sea-Level, 1987, ch. 7). The water runs down the slope of its surface plus this
 * height (WaterKernel.fluxPass): at rest, a dome under the low, the water drawn from where the pressure is higher.
 *
 * A vortex of the profile of Holland (1980): p(r) - p_far = -Δp (1 - exp(-(R/r)^B)), R the radius of its strongest
 * winds. Pure; WaterGrid fills its cells from it.
 */

/** The air over the water: where its low is, how deep it is and how wide (map pixels). */
export interface AirPressure {
    /** The centre of the low, map pixels. */
    x: number;
    y: number;
    /** How much higher the water stands under its centre than far from it, map pixels of water. */
    dropPx: number;
    /** The radius of the strongest winds R, map pixels, and the width of the profile B (Holland). */
    radiusPx: number;
    b: number;
}

/** The density of fresh water (kg/m³) and the gravity (m/s²): a pressure as a height of water. */
const WATER_DENSITY = 1000;
const GRAVITY = 9.81;

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
