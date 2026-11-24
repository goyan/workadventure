import { TERRAIN_CELL, TILE_AREA_M2, TILE_PX } from "@workadventure/map-editor";

/**
 * The sea the wind raises on the water of the map, drawn by the water shader (GroundSplat, WindSeaShader): short
 * waves that grow with the wind and with the stretch of water it has blown over (the fetch), and break at their
 * crests when they are too steep, leaving foam that lasts a few seconds and drifts downwind.
 *
 * Nothing of it is simulated by the server: these waves are shorter than a cell of the water (0.3 to 1.6 m against
 * 0.55 m cells), under what the simulation can carry, so drawing them alone tells nothing false about the water.
 *
 * The physics, and where it comes from:
 * - Waves limited by the fetch (Hasselmann et al. 1973, the JONSWAP report, eq. 2.4.3 to 2.4.7): with x = g X / U²
 *   (X the fetch, U the wind at 10 m), the peak frequency is f_p = 3.5 x^-0.33 g / U, the energy E = 1.6e-7 x U⁴ / g²
 *   (Hs = 4 √E), and the spectrum the JONSWAP one, alpha = 0.076 x^-0.22, gamma 3.3, sigma 0.07 and 0.09.
 * - Deep water (Airy): k = (2 pi f)² / g. True of these short waves wherever the water is deeper than half of them.
 * - Where the water is shallow, a wave higher than 0.8 times the depth breaks (Dean & Dalrymple 2002): the waves are
 *   no higher than that over the shallows.
 * - A wave breaks when it is steeper than H / L = 0.142 (Michell 1893, Miche 1944), that is a slope of pi x 0.142.
 * - Foam left by a breaking crest fades in a few seconds (Callaghan et al. 2012: 2 to 5 s) and drifts with the
 *   surface, at about 3 % of the wind (Wu 1983).
 * - How much of the water is white: the usual law of the whitecaps (Whitecaps.whitecapShare, capped past its data by
 *   whitecapWhite). The breaking slope above decides where the foam is; the law decides how much of it: the threshold
 *   the shader uses is the physical one times a factor measured against the law (breakingSlopeFor).
 */

/** Under this wind (km/h), no wind sea is drawn: the water is drawn as it always was. */
export const WIND_SEA_FROM_KMH = 10;
/** How many waves of fixed frequency and direction the shader sums. */
export const SEA_COMPONENTS = 12;
/** The width of a pixel of the map, in metres: a tile of 32 px is √1.2 m wide (Scale.ts). */
export const MAP_PX_METRES = Math.sqrt(TILE_AREA_M2) / TILE_PX;
/** The fetch is told to the shader in bytes of this many cells of the relief (1.1 m): up to 280 m. */
export const FETCH_UNIT_CELLS = 2;
export const FETCH_UNIT_METRES = FETCH_UNIT_CELLS * TERRAIN_CELL * MAP_PX_METRES;
export const FETCH_MOST_METRES = 255 * FETCH_UNIT_METRES;
/** Water at least this deep (map pixels) is open water the wind blows over; shallower, the fetch starts again. */
export const FETCH_WATER_PX = 4;
/**
 * A cell already open stays so until its water is thinner than this, one closed opens only past this: the water
 * that wavers about FETCH_WATER_PX (a wave, a source, the rain) does not move the shores, nor make the fetch again.
 */
export const FETCH_CLOSES_PX = 2;
export const FETCH_OPENS_PX = 6;
/** The steepest a wave stands (H / L, Michell 1893, Miche 1944), and the slope of a sine wave that steep. */
export const BREAKING_STEEPNESS = 0.142;
export const BREAKING_SLOPE = Math.PI * BREAKING_STEEPNESS;
/** How long the foam left by a crest takes to fade to 1/e, in seconds (Callaghan et al. 2012: 2 to 5 s). */
export const FOAM_DECAY_S = 3;
/** The foam drifts with the surface at this share of the wind (Wu 1983). */
export const FOAM_DRIFT_SHARE = 0.03;
/** The fetch the white of the water is measured at against the law: the open water of a large basin of a map. */
export const REFERENCE_FETCH_M = 200;
/** No wave shorter than this many map pixels is drawn: finer, it is noise; it fades in over as many more. */
export const SHORTEST_WAVE_PX = 4;

const G = 9.81;
/** The spreading of the directions of a wind sea, cos^2s(theta / 2) (Mitsuyasu et al. 1975; s = 10, Goda). */
const SPREADING = 10;
/** JONSWAP (Hasselmann et al. 1973). */
const PEAK_COEFFICIENT = 3.5;
const PEAK_POWER = -0.33;
const ENERGY_COEFFICIENT = 1.6e-7;
const ALPHA_COEFFICIENT = 0.076;
const ALPHA_POWER = -0.22;
const GAMMA = 3.3;
const SIGMA_BELOW = 0.07;
const SIGMA_ABOVE = 0.09;
/** Past this fetch (in g X / U²) the sea is fully grown (Pierson-Moskowitz, f_p U / g about 0.13): it grows no more. */
const FULLY_GROWN = Math.pow(PEAK_COEFFICIENT / 0.13, 1 / -PEAK_POWER);
/** The shortest fetch the law is read at (g X / U²): a few metres of water. */
const SHORTEST = 0.05;
/** A wave higher than this share of the depth breaks (Dean & Dalrymple 2002). */
const DEPTH_BREAKING = 0.8;
/** g² / (2 pi)⁴, the factor of the JONSWAP spectrum. */
const SPECTRUM_FACTOR = (G * G) / Math.pow(2 * Math.PI, 4);

/** The wind sea grown over a fetch: g X / U², peak frequency (Hz), alpha, Hs (m), peak period (s), peak length (m). */
export interface FetchSea {
    x: number;
    fp: number;
    alpha: number;
    hs: number;
    tp: number;
    lp: number;
}

/** The sea a wind of `windMs` (10 m up) raises over `fetchM` metres of water (JONSWAP 1973). */
export function fetchSea(windMs: number, fetchM: number): FetchSea {
    const u = Math.max(0.1, windMs);
    const x = Math.min(FULLY_GROWN, Math.max(SHORTEST, (G * Math.max(0, fetchM)) / (u * u)));
    const fp = (PEAK_COEFFICIENT * Math.pow(x, PEAK_POWER) * G) / u;
    const alpha = ALPHA_COEFFICIENT * Math.pow(x, ALPHA_POWER);
    const hs = 4 * Math.sqrt(ENERGY_COEFFICIENT * x) * ((u * u) / G);
    const tp = 1 / fp;
    return { x, fp, alpha, hs, tp, lp: (G * tp * tp) / (2 * Math.PI) };
}

/** The JONSWAP density of the sea at frequency f (m² / Hz), for its peak and alpha. */
export function jonswapDensity(f: number, fp: number, alpha: number): number {
    if (!(f > 0) || !(fp > 0)) return 0;
    const sigma = f <= fp ? SIGMA_BELOW : SIGMA_ABOVE;
    const peak = Math.exp(-((f - fp) ** 2) / (2 * sigma * sigma * fp * fp));
    const q = fp / f;
    return alpha * SPECTRUM_FACTOR * Math.pow(f, -5) * Math.exp(-1.25 * q * q * q * q) * Math.pow(GAMMA, peak);
}

/** One wave of the wind sea: fixed frequency and direction, its share of the spectrum read where it is drawn. */
export interface SeaComponent {
    /** Frequency (Hz), the width of its band (Hz), and how much of it is drawn: 0 under the pixels, 1 well over. */
    f: number;
    band: number;
    fade: number;
    /** Wave number along the map, in cycles a map pixel (for its phase) and radians a metre (for its slope). */
    cx: number;
    cy: number;
    kx: number;
    ky: number;
    /** Phase at the time 0 of the clock, in cycles. */
    phase0: number;
    /** Wavelength in map pixels. */
    lengthPx: number;
}

/** A deterministic spread of numbers over [0, 1): the golden ratio. */
const spread = (at: number, step: number): number => (at * step) % 1;

/** The angle (radians from the wind) under which a share q of cos^2s(theta / 2) lies: read from a table. */
const SPREAD_TABLE = ((): { angles: number[]; shares: number[] } => {
    const angles: number[] = [];
    const shares: number[] = [];
    let total = 0;
    const steps = 720;
    for (let at = 0; at <= steps; at++) {
        const theta = -Math.PI + (2 * Math.PI * at) / steps;
        total += Math.pow(Math.cos(theta / 2), 2 * SPREADING);
        angles.push(theta);
        shares.push(total);
    }
    return { angles, shares: shares.map((value) => value / total) };
})();

function spreadAngle(q: number): number {
    const { angles, shares } = SPREAD_TABLE;
    for (let at = 1; at < shares.length; at++) {
        if (shares[at] >= q) {
            const share = (q - shares[at - 1]) / Math.max(1e-12, shares[at] - shares[at - 1]);
            return angles[at - 1] + (angles[at] - angles[at - 1]) * share;
        }
    }
    return 0;
}

/**
 * The waves of the wind sea for a wind of `windKmh` blowing towards `heading` (map pixels, length 1): none under
 * WIND_SEA_FROM_KMH. Their frequencies span the seas the map can hold, from the longest fetch the shader is told
 * (FETCH_MOST_METRES) to a few metres, no shorter than SHORTEST_WAVE_PX; their directions follow the spreading of a
 * wind sea. Each carries the whole band of frequencies around it.
 */
export function seaComponents(windKmh: number | undefined, heading: { x: number; y: number }): SeaComponent[] {
    if (windKmh === undefined || !Number.isFinite(windKmh) || windKmh < WIND_SEA_FROM_KMH) return [];
    const u = windKmh / 3.6;
    const shortest = SHORTEST_WAVE_PX * MAP_PX_METRES;
    const highest = Math.sqrt(G / (2 * Math.PI * shortest));
    const low = 0.7 * fetchSea(u, FETCH_MOST_METRES).fp;
    const high = Math.max(low * 1.5, Math.min(highest, 2.5 * fetchSea(u, 5).fp));
    const ratio = Math.pow(high / low, 1 / (SEA_COMPONENTS - 1));
    const wind = Math.atan2(heading.y, heading.x);
    const components: SeaComponent[] = [];
    for (let at = 0; at < SEA_COMPONENTS; at++) {
        // A little off the regular steps: no two waves in a ratio that repeats a pattern.
        const f = low * Math.pow(ratio, at + (spread(at + 1, 0.7548777) - 0.5) * 0.3);
        // One side of the wind, then the other, as the frequency rises: the waves near the peak, which carry most
        // of the sea, cross each other on both sides of the wind (short crests across it), none leads alone.
        const side = at % 2 === 0 ? 1 : -1;
        const angle = wind + side * Math.abs(spreadAngle(0.5 + spread(at + 1, 0.618034) * 0.45));
        const k = (2 * Math.PI * f) ** 2 / G;
        const lengthM = (2 * Math.PI) / k;
        const lengthPx = lengthM / MAP_PX_METRES;
        const fade = Math.min(1, Math.max(0, (lengthPx - SHORTEST_WAVE_PX) / SHORTEST_WAVE_PX));
        components.push({
            f,
            band: f * Math.log(ratio),
            fade,
            cx: (Math.cos(angle) * MAP_PX_METRES) / lengthM,
            cy: (Math.sin(angle) * MAP_PX_METRES) / lengthM,
            kx: k * Math.cos(angle),
            ky: k * Math.sin(angle),
            phase0: spread(at + 1, 0.5698403),
            lengthPx,
        });
    }
    return components;
}

/** The phase of a wave at `seconds` of the clock, in cycles, brought into [0, 1): the shader reads it from here. */
export function seaPhase(component: SeaComponent, seconds: number): number {
    const phase = component.f * seconds - component.phase0;
    if (!Number.isFinite(phase)) return 0;
    return phase - Math.floor(phase);
}

/**
 * The amplitude of each wave (m) where the fetch is `fetchM` and the water `depthM` deep. The few bands sampled hold
 * the energy of the law (Hs = 4 √m0) once brought to it; then the waves too short for the pixels fade.
 */
export function seaAmplitudes(
    components: readonly SeaComponent[],
    windMs: number,
    fetchM: number,
    depthM: number,
    out: Float64Array = new Float64Array(components.length),
): Float64Array {
    const sea = fetchSea(windMs, Math.max(2, fetchM));
    const cap = Math.min(1, Math.max(0, (DEPTH_BREAKING * depthM) / Math.max(1e-4, sea.hs)));
    let sampled = 0;
    for (let at = 0; at < components.length; at++) {
        const component = components[at];
        out[at] = jonswapDensity(component.f, sea.fp, sea.alpha) * component.band;
        sampled += out[at];
    }
    const wanted = (sea.hs / 4) ** 2;
    const scale = sampled > 0 ? wanted / sampled : 0;
    for (let at = 0; at < components.length; at++) {
        out[at] = cap * components[at].fade * Math.sqrt(2 * out[at] * scale);
    }
    return out;
}

/** The surface at a point: its height (m) and its slope (east, south). */
export interface SeaPoint {
    eta: number;
    sx: number;
    sy: number;
}

/**
 * The surface of the wind sea at a map point (px), `back` seconds before the phases given (`phases`, cycles), for
 * the amplitudes given: the twin of seaAt in WindSeaShader, in 64-bit numbers.
 */
export function seaSurface(
    components: readonly SeaComponent[],
    amplitudes: ArrayLike<number>,
    phases: ArrayLike<number>,
    x: number,
    y: number,
    back = 0,
): SeaPoint {
    let eta = 0;
    let sx = 0;
    let sy = 0;
    for (let at = 0; at < components.length; at++) {
        const component = components[at];
        const turn = x * component.cx + y * component.cy - phases[at] + component.f * back;
        const angle = 2 * Math.PI * (turn - Math.floor(turn));
        const sin = Math.sin(angle);
        const a = amplitudes[at];
        eta += a * Math.cos(angle);
        sx += a * sin * component.kx;
        sy += a * sin * component.ky;
    }
    return { eta, sx: -sx, sy: -sy };
}

/**
 * The fetch over a grid: how far (m) the wind has blown over open water to reach each cell, from the shore upwind.
 * `open` is 1 on open water. Each cell takes the fetch of the point one cell upwind of it, read straight between the
 * four cells around that point, plus a cell: one pass, the cells taken in the order the wind meets them. The water
 * off the grid is land: a map is a closed basin.
 */
export function fetchGrid(
    open: Uint8Array,
    width: number,
    height: number,
    heading: { x: number; y: number },
    cellMetres = TERRAIN_CELL * MAP_PX_METRES,
    out: Float32Array = new Float32Array(width * height),
): Float32Array {
    const length = Math.hypot(heading.x, heading.y);
    const dx = length > 0 ? heading.x / length : 0;
    const dy = length > 0 ? heading.y / length : 1;
    const columns = dx >= 0 ? { from: 0, to: width, step: 1 } : { from: width - 1, to: -1, step: -1 };
    const rows = dy >= 0 ? { from: 0, to: height, step: 1 } : { from: height - 1, to: -1, step: -1 };
    const fetchAt = (column: number, row: number): number =>
        column < 0 || row < 0 || column >= width || row >= height ? 0 : out[row * width + column];
    for (let row = rows.from; row !== rows.to; row += rows.step) {
        for (let column = columns.from; column !== columns.to; column += columns.step) {
            const cell = row * width + column;
            if (!open[cell]) {
                out[cell] = 0;
                continue;
            }
            // The point one cell upwind, between the cells already met.
            const ux = column - dx;
            const uy = row - dy;
            const x0 = Math.floor(ux);
            const y0 = Math.floor(uy);
            const fx = ux - x0;
            const fy = uy - y0;
            const upwind =
                (fetchAt(x0, y0) * (1 - fx) + fetchAt(x0 + 1, y0) * fx) * (1 - fy) +
                (fetchAt(x0, y0 + 1) * (1 - fx) + fetchAt(x0 + 1, y0 + 1) * fx) * fy;
            out[cell] = upwind + cellMetres;
        }
    }
    return out;
}

/** The directions (degrees off the wind) and weights the effective fetch averages: cos² over ±45°. */
export const EFFECTIVE_FETCH_RAYS: readonly (readonly [number, number])[] = [-40, -20, 0, 20, 40].map((degrees) => [
    degrees,
    Math.cos((degrees * Math.PI) / 180) ** 2,
]);

/**
 * The effective fetch: the fetch of the wind and of directions around it, averaged with weights of cos² (the
 * effective fetch of the coastal engineers, over ±45°): a wind sea comes from all of them, so the calm in the lee of
 * an island narrows and fades downwind instead of running straight to the shore.
 */
export function effectiveFetchGrid(
    open: Uint8Array,
    width: number,
    height: number,
    heading: { x: number; y: number },
    cellMetres = TERRAIN_CELL * MAP_PX_METRES,
    out: Float32Array = new Float32Array(width * height),
): Float32Array {
    out.fill(0);
    const ray = new Float32Array(width * height);
    const wind = Math.atan2(heading.y, heading.x);
    let total = 0;
    for (const [degrees, weight] of EFFECTIVE_FETCH_RAYS) {
        const angle = wind + (degrees * Math.PI) / 180;
        fetchGrid(open, width, height, { x: Math.cos(angle), y: Math.sin(angle) }, cellMetres, ray);
        for (let cell = 0; cell < ray.length; cell++) out[cell] += weight * ray[cell];
        total += weight;
    }
    for (let cell = 0; cell < out.length; cell++) out[cell] /= total;
    return out;
}

/** The fetch of a cell as the shader is told it: a byte of FETCH_UNIT_METRES, at most FETCH_MOST_METRES. */
export function fetchByte(fetchM: number): number {
    if (!(fetchM > 0)) return 0;
    return Math.min(255, Math.round(fetchM / FETCH_UNIT_METRES));
}

/** The fetch is made again when the wind turns by more than this (degrees). */
export const FETCH_TURN_DEGREES = 5;
/** And when the water changed, no more often than this (ms): it moves five times a second, the shores seldom. */
export const FETCH_REFRESH_MS = 3000;

/** The water the fetch is made from: depths over a grid of cells (TerrainWater.settled). */
export interface FetchWater {
    x: number;
    y: number;
    width: number;
    height: number;
    depths: Float32Array;
}

/** One fetch being made, a ray at each image: the shores it is made for, the wind, and the rays done. */
interface FetchJob {
    grid: { x: number; y: number; width: number; height: number };
    open: Uint8Array;
    heading: { x: number; y: number };
    sum: Float32Array;
    ray: Float32Array;
    done: number;
    weights: number;
}

/**
 * The fetch of the wind over the water of the map: made again when the wind turns, or when the shores moved (the
 * water changed, at most every FETCH_REFRESH_MS, and the cells of open water are no longer the same). Made a ray of
 * the effective fetch at each image (advance), not all at once: up to a tenth of a second on a large map, it held an
 * image. Read cell by cell for what is drawn; `version` changes when a new fetch is ready.
 */
export class SeaFetch {
    public version = 0;
    private grid: { x: number; y: number; width: number; height: number } | undefined;
    private bytes = new Uint8Array(0);
    private open: Uint8Array = new Uint8Array(0);
    private heading: { x: number; y: number } | undefined;
    private checkedAt = Number.NEGATIVE_INFINITY;
    private waterVersion = -1;
    private job: FetchJob | undefined;

    /** Starts a new fetch if the wind turned, the grid changed, or the shores moved. Whether one was started. */
    public update(water: FetchWater, waterVersion: number, heading: { x: number; y: number }, now: number): boolean {
        const wanted = this.job?.heading ?? this.heading;
        const grid = this.job?.grid ?? this.grid;
        const resized =
            !grid ||
            grid.x !== water.x ||
            grid.y !== water.y ||
            grid.width !== water.width ||
            grid.height !== water.height;
        const turned =
            !wanted ||
            Math.abs(
                Math.atan2(wanted.x * heading.y - wanted.y * heading.x, wanted.x * heading.x + wanted.y * heading.y),
            ) >
                (FETCH_TURN_DEGREES * Math.PI) / 180;
        const changed = waterVersion !== this.waterVersion && now - this.checkedAt >= FETCH_REFRESH_MS;
        if (!resized && !turned && !changed) return false;
        this.waterVersion = waterVersion;
        this.checkedAt = now;
        const size = water.width * water.height;
        const open = new Uint8Array(size);
        const before = this.job?.open ?? this.open;
        const kept = !resized && before.length === size;
        for (let cell = 0; cell < size; cell++) {
            const depth = water.depths[cell];
            open[cell] = (kept && before[cell] ? depth >= FETCH_CLOSES_PX : depth >= FETCH_OPENS_PX) ? 1 : 0;
        }
        // The water moved but not its shores: the fetch is the same.
        const shores = this.job?.open ?? this.open;
        if (
            !resized &&
            !turned &&
            open.length === shores.length &&
            open.every((value, cell) => value === shores[cell])
        ) {
            return false;
        }
        this.job = {
            grid: { x: water.x, y: water.y, width: water.width, height: water.height },
            open,
            heading: { ...heading },
            sum: new Float32Array(size),
            ray: new Float32Array(size),
            done: 0,
            weights: 0,
        };
        return true;
    }

    /** Makes one more ray of the fetch under way; true when a new fetch is ready (read it from now on). */
    public advance(): boolean {
        const job = this.job;
        if (!job) return false;
        const [degrees, weight] = EFFECTIVE_FETCH_RAYS[job.done];
        const angle = Math.atan2(job.heading.y, job.heading.x) + (degrees * Math.PI) / 180;
        const { width, height } = job.grid;
        fetchGrid(job.open, width, height, { x: Math.cos(angle), y: Math.sin(angle) }, undefined, job.ray);
        for (let cell = 0; cell < job.sum.length; cell++) job.sum[cell] += weight * job.ray[cell];
        job.weights += weight;
        job.done++;
        if (job.done < EFFECTIVE_FETCH_RAYS.length) return false;
        if (this.bytes.length !== job.sum.length) this.bytes = new Uint8Array(job.sum.length);
        for (let cell = 0; cell < job.sum.length; cell++) this.bytes[cell] = fetchByte(job.sum[cell] / job.weights);
        this.grid = job.grid;
        this.open = job.open;
        this.heading = job.heading;
        this.job = undefined;
        this.version++;
        return true;
    }

    /** The fetch bytes over a rectangle of cells of the map (0 off the grid), into `out`. */
    public over(cellX: number, cellY: number, columns: number, rows: number, out: Uint8Array): Uint8Array {
        const grid = this.grid;
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const x = cellX + column - (grid?.x ?? 0);
                const y = cellY + row - (grid?.y ?? 0);
                out[row * columns + column] =
                    grid && x >= 0 && y >= 0 && x < grid.width && y < grid.height ? this.bytes[y * grid.width + x] : 0;
            }
        }
        return out;
    }
}
