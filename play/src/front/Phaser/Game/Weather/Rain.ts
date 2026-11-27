import { hash01 } from "../Autumn/LeafPalette";
import type { WeatherView } from "./WeatherFrame";
import { PX_PER_METRE } from "./Snowfall";
import { COPY_SALT, copyShown, shownCopiesBound } from "./ParticleDensity";
import { fallHash, fallSeconds } from "./FallHash";

/**
 * How hard the rain falls on the screen, 0 to 1, for a rate in mm an hour: light rain (up to 2.5 mm/h), moderate (up to
 * 7.6) and heavy (over), the classes of the AMS glossary. The curve between them is a choice: most real rains are
 * light, so the light ones are spread over half of the scale. Never nothing while it rains.
 */
const RATE_LEVELS: readonly (readonly [rate: number, level: number])[] = [
    [0, 0.15],
    [0.4, 0.2],
    [1.2, 0.4],
    [2.5, 0.55],
    [7.6, 0.8],
    [20, 1],
];

/** The rate (mm an hour) a rain of this intensity (0 to 1) falls at: the inverse of rainIntensity (no storm). */
export function rainRateOfLevel(level: number): number {
    if (!Number.isFinite(level) || level <= RATE_LEVELS[0][1]) return RATE_LEVELS[0][0];
    for (let index = 1; index < RATE_LEVELS.length; index++) {
        const [rate0, level0] = RATE_LEVELS[index - 1];
        const [rate1, level1] = RATE_LEVELS[index];
        if (level <= level1) return rate0 + ((rate1 - rate0) * (level - level0)) / (level1 - level0);
    }
    return RATE_LEVELS[RATE_LEVELS.length - 1][0];
}

/** A rain whose rate is unknown (a fixed or automatic weather): a steady rain, between light and moderate. */
export const USUAL_RAIN = 0.5;
/** A storm never falls lighter than this, and falls this hard when its rate is unknown. */
export const STORM_RAIN = 0.85;

export function rainIntensity(rate: number | undefined, storm = false): number {
    if (rate === undefined || !Number.isFinite(rate)) return storm ? STORM_RAIN : USUAL_RAIN;
    let level = RATE_LEVELS[RATE_LEVELS.length - 1][1];
    for (let index = 1; index < RATE_LEVELS.length; index++) {
        const [rate0, level0] = RATE_LEVELS[index - 1];
        const [rate1, level1] = RATE_LEVELS[index];
        if (rate <= rate1) {
            level = level0 + ((level1 - level0) * Math.max(0, rate - rate0)) / (rate1 - rate0);
            break;
        }
    }
    return storm ? Math.max(STORM_RAIN, level) : level;
}

/** The wind near the ground, map pixels a second (x east, y south): groundWind, the same as for the snow. */
export type RainWind = { x: number; y: number };

/**
 * How fast the drops of each plane fall, m/s: drops of 1.4, 3 and 5 mm by the fit of Atlas, Srivastava and Sekhon
 * (Rev. Geophys. 11, 1973) to the measures of Gunn and Kinzer (J. Meteor. 6, 1949), v = 9.65 - 10.3 exp(-0.6 D).
 * The planes pass on the screen at these speeds, the near one 1.25 times faster (closer to the eye): its slant, the
 * wind over its fall, is the same seen near or far.
 */
export const RAIN_FALL_SPEEDS: readonly number[] = [1.4, 3, 5].map(
    (diameter) => 9.65 - 10.3 * Math.exp(-0.6 * diameter),
);
/**
 * The steepest a drop falls aslant, pixels across for one down: a drop of 1.4 mm in a wind of about 90 km/h. A bound
 * (a choice), so that a storm wind keeps the rain readable and the drops looked at few.
 */
export const MAX_RAIN_SLANT = 3;

/**
 * How a drop of a plane goes for each pixel it falls: `x` across and `y` down or up, on top of its fall, the wind over
 * the speed of its fall, the way the wind blows (both of its parts, as the snow and the clouds). A drop goes with the
 * air within a second (followWind): its slant is the ratio of the two speeds.
 */
export function rainSlant(wind: RainWind, layer: number): { x: number; y: number } {
    const speed = RAIN_FALL_SPEEDS[layer] * PX_PER_METRE;
    const x = Number.isFinite(wind.x) ? wind.x / speed : 0;
    const y = Number.isFinite(wind.y) ? wind.y / speed : 0;
    const length = Math.hypot(x, y);
    if (length <= MAX_RAIN_SLANT) return { x: x + 0, y: y + 0 };
    return { x: (x * MAX_RAIN_SLANT) / length, y: (y * MAX_RAIN_SLANT) / length };
}

/**
 * Seconds a drop takes to go with a new wind: its speed over the gravity, from half a second for a small drop to
 * nearly one for a big one; the rain catches a change of the wind over this long instead of jumping.
 */
const DROP_RESPONSE_S = 0.7;

/** The wind the drops go with, `seconds` after it was `current`, the wind blowing `target`. */
export function followWind(current: RainWind, target: RainWind, seconds: number): RainWind {
    if (!(seconds > 0)) return current;
    if (!Number.isFinite(seconds)) return target;
    const share = 1 - Math.exp(-seconds / DROP_RESPONSE_S);
    return { x: current.x + (target.x - current.x) * share, y: current.y + (target.y - current.y) * share };
}

export interface RainDrop {
    /** The head of the drop (its lowest point), map pixels. */
    x: number;
    y: number;
    /** Height of its streak for a drop falling straight, map pixels. */
    length: number;
    /** Where its streak goes from the head, for one of its length: up its way through the air (back along its fall). */
    dx: number;
    dy: number;
    alpha: number;
    /** 0 far, 1 middle, 2 near. */
    layer: number;
}

export interface RainLayer {
    /** Cells of this layer for one cell of the base grid, each way. */
    split: number;
    /** Map pixels a second. */
    speed: number;
    /** How far a drop falls before the next one of its cell starts, map pixels: about a second of fall. */
    fall: number;
    length: number;
    alpha: number;
    /** Intensity from which its drops start to show, and at which all of them do. */
    from: number;
    full: number;
}

/**
 * Three planes of drops, each with its own grid and speed, fixed whatever the intensity: the intensity only says which
 * drops show (a position multiplied by the time must never depend on a value that changes, or every drop would jump).
 */
/** The screen speeds of the planes (map pixels a second), for the tests: their drops' speeds seen at their distance. */
export function rainScreenSpeeds(): number[] {
    return RAIN_LAYERS.map((layer) => layer.speed);
}

const RAIN_LAYERS: readonly RainLayer[] = [
    { split: 2, speed: 150, fall: 160, length: 6, alpha: 0.45, from: 0, full: 0.9 },
    { split: 2, speed: 230, fall: 240, length: 10, alpha: 0.7, from: 0.05, full: 0.7 },
    { split: 1, speed: 330, fall: 320, length: 16, alpha: 0.9, from: 0.45, full: 1 },
];

/**
 * How many drops rainDrops draws over the view at this intensity, on the mean (no local factor): what the rain in
 * perspective draws too, the same density of water on the screen.
 */
export function rainDropsExpected(view: WeatherView, intensity: number): number {
    const base = rainCell(view);
    return RAIN_LAYERS.reduce((sum, layer) => {
        const shown = Math.max(0, Math.min(1, (Math.min(1, intensity) - layer.from) / (layer.full - layer.from)));
        const cell = base / layer.split;
        return sum + ((view.width * view.height) / (cell * cell)) * shown;
    }, 0);
}

/**
 * How much harder or lighter the rain falls at a point of the map than on the whole (1: the same): more under the
 * thick of a rain cloud, less in a gap between two.
 */
export type RainLocal = (x: number, y: number) => number;

/** The local factor under a rain cloud of this thickness (0 none, 1 its thickest). */
export function rainUnderCloud(thickness: number, effect = 1): number {
    return 1 + effect * (UNDER_CLOUD_THICKEST * Math.max(0, Math.min(1, thickness)) - UNDER_CLOUD_GAP);
}

/** rainUnderCloud: 1 + effect × (UNDER_CLOUD_THICKEST × thickness − UNDER_CLOUD_GAP), for the graphics card too. */
export const UNDER_CLOUD_THICKEST = 0.9;
export const UNDER_CLOUD_GAP = 0.5;

/**
 * Up to this many screen pixels a map pixel, the rain and the snow are drawn in map pixels: the size they were set at.
 * Measured on the screen (flat snow, 1920 x 1080, the share of pixels a flake covers): 1.8 % at a scale of 1, 3.8 % at
 * 1.5 (the top of the usual zooms) but 10 % at 2.5, since the same number of flakes were each 2.5 times wider than at 1:
 * the map was hidden. Past this scale the flakes keep the size and the cover they have between 0.75 and 1.5.
 */
export const RAIN_NATIVE_SCALE = 1.5;

/**
 * How many times finer than the map the rain is drawn when the map is seen from this close (`screenScale`: screen
 * pixels a map pixel). The drops and flakes are sized in map pixels: zoomed in, a drop was a streak as thick as a
 * finger, a flake a big block, and they hid the map. Past the usual zooms the rain is worked out on a grid this many
 * times finer, so it looks on screen as it does at a usual zoom: 1 up to RAIN_NATIVE_SCALE, then doubling with the zoom
 * (by steps, so the drops jump only when a step is crossed).
 */
export function rainFineness(screenScale: number): number {
    if (!Number.isFinite(screenScale) || screenScale <= RAIN_NATIVE_SCALE) return 1;
    return 2 ** Math.ceil(Math.log2(screenScale / RAIN_NATIVE_SCALE));
}

/** Base cells across the view: the drops are as many on the screen at any zoom, never countless zoomed out. */
const RAIN_CELLS = 500;
const SMALLEST_CELL = 16;

/** Side of the base cell for this view: a power of two, so a small scroll or zoom keeps the same grid. */
export function rainCell(view: WeatherView): number {
    const wanted = Math.sqrt((view.width * view.height) / RAIN_CELLS);
    return Math.max(SMALLEST_CELL, 2 ** Math.ceil(Math.log2(Math.max(1, wanted))));
}

/** The share of the cells of the plane `layer` that show a drop at this intensity (0 to 1). */
export function rainLayerShown(layer: number, level: number): number {
    const { from, full } = RAIN_LAYERS[layer];
    return Math.min(1, (Math.min(1, level) - from) / (full - from));
}

/** The constants of a plane of drops (0 far, 1 middle, 2 near), for the graphics card. */
export function rainLayer(layer: number): Readonly<RainLayer> {
    return RAIN_LAYERS[layer];
}

/**
 * The cells of a plane of drops read for the view: the drops of those around it may fall into it. `copies` drops
 * are looked at in each (copyShown), the first of them the first to show.
 */
export interface RainPlane {
    layer: number;
    /** Side of its cells, map pixels. */
    cell: number;
    firstColumn: number;
    firstRow: number;
    columns: number;
    rows: number;
    copies: number;
    /** Where a drop goes for each pixel it falls (rainSlant): across, and down the screen. */
    across: number;
    down: number;
}

/**
 * The planes of a rain of this intensity (0 to 1) over the view, `copies` drops a cell at most (cellCopies): those
 * with a drop to show somewhere, under the thickest cloud with a local factor (`local`).
 */
export function rainPlanes(
    view: WeatherView,
    intensity: number,
    wind: RainWind,
    local: boolean,
    copies: number,
): RainPlane[] {
    const base = rainCell(view);
    const planes: RainPlane[] = [];
    RAIN_LAYERS.forEach((layer, index) => {
        // No drop of this plane anywhere, even under the thickest cloud.
        const most = rainLayerShown(index, intensity * (local ? rainUnderCloud(1) : 1));
        const looked = most > 0 ? shownCopiesBound(copies, most) : 0;
        if (looked <= 0) return;
        const cell = base / layer.split;
        // For each pixel it falls a drop goes `slant` along with the wind: across, and down or up the screen.
        const slant = rainSlant(wind, index);
        const across = slant.x;
        const down = 1 + slant.y;
        // A drop goes far from its cell over its fall: those of the cells around the view may be in it.
        const reachX = across * layer.fall;
        const reachY = down * layer.fall;
        const firstRow = Math.floor((view.y - Math.max(0, reachY)) / cell) - 1;
        const lastRow = Math.ceil((view.y + view.height - Math.min(0, reachY)) / cell) + 1;
        const firstColumn = Math.floor((view.x - Math.max(0, reachX)) / cell) - 1;
        const lastColumn = Math.ceil((view.x + view.width - Math.min(0, reachX)) / cell) + 1;
        planes.push({
            layer: index,
            cell,
            firstColumn,
            firstRow,
            columns: lastColumn - firstColumn + 1,
            rows: lastRow - firstRow + 1,
            copies: looked,
            across,
            down,
        });
    });
    return planes;
}

/**
 * The drop `copy` of a cell of a plane at `seconds` (fallSeconds), `here` the share of its cells showing one
 * (rainLayerShown, with the local factor at the middle of the cell), `copies` the most a cell holds: undefined when it
 * does not show. Each cell lets its drops fall one after the other, a long way down along their slant in the wind,
 * the next one starting from another place of the cell. What PrecipitationLayer works out on the graphics card.
 */
export function rainDropAt(
    plane: RainPlane,
    column: number,
    row: number,
    copy: number,
    seconds: number,
    here: number,
    copies: number,
): RainDrop | undefined {
    const index = plane.layer;
    const layer = RAIN_LAYERS[index];
    const salt = copy * COPY_SALT;
    // Which drops show is drawn apart from where they are: a light rain is not a corner of a heavy one.
    if (!copyShown(copy, copies, here, fallHash(column, row, 11 + index + salt))) return undefined;
    // Each drop a little faster or slower than its plane: no curtain falling as one.
    const falls =
        fallHash(column, row, 3 + index + salt) +
        (seconds * layer.speed * (0.85 + 0.3 * fallHash(column, row, 7 + salt))) / layer.fall;
    // Which fall of this cell it is, and how far along.
    const cycle = Math.floor(falls);
    const fallen = (falls - cycle) * layer.fall;
    return {
        x: (column + fallHash(column + cycle, row, 5 + index + salt)) * plane.cell + plane.across * fallen,
        y: (row + fallHash(column, row + cycle, 13 + index + salt)) * plane.cell + plane.down * fallen,
        length: layer.length,
        dx: plane.across,
        dy: plane.down,
        alpha: layer.alpha,
        layer: index,
    };
}

/**
 * The drops of a rain of this intensity (0 to 1) over the view, fixed to the map (rainPlanes, rainDropAt).
 * `copies` (cellCopies): the most drops each cell holds, 1 for the rain of the first version. The same for everyone at
 * the same server time.
 */
export function rainDrops(
    epoch: number,
    view: WeatherView,
    intensity: number,
    wind: RainWind,
    local?: RainLocal,
    copies = 1,
): RainDrop[] {
    const seconds = fallSeconds(epoch);
    const drops: RainDrop[] = [];
    for (const plane of rainPlanes(view, intensity, wind, local !== undefined, copies)) {
        const shown = rainLayerShown(plane.layer, intensity);
        for (let copy = 0; copy < plane.copies; copy++) {
            for (let row = plane.firstRow; row < plane.firstRow + plane.rows; row++) {
                for (let column = plane.firstColumn; column < plane.firstColumn + plane.columns; column++) {
                    const here = local
                        ? rainLayerShown(
                              plane.layer,
                              intensity * local((column + 0.5) * plane.cell, (row + 0.5) * plane.cell),
                          )
                        : shown;
                    const drop = rainDropAt(plane, column, row, copy, seconds, here, copies);
                    if (drop) drops.push(drop);
                }
            }
        }
    }
    return drops;
}

export interface RainSplash {
    x: number;
    y: number;
    /** 0 the drop hits, 1 it spreads, 2 it fades. */
    stage: number;
}

const SPLASH_MS = 270;
const SPLASH_CYCLE_MS = 900;
/** Kept small so the cycle number stays exact in the hash. */
const SPLASH_CYCLES = 100_000;

/**
 * Where drops hit the ground, for a rain of this intensity: in each cell of a grid fixed to the map, one place after
 * the other, each a short splash; the harder the rain, the more cells splash. The same for everyone.
 */
export function rainSplashes(epoch: number, view: WeatherView, intensity: number, local?: RainLocal): RainSplash[] {
    const cell = rainCell(view) / 2;
    if (intensity <= 0) return [];
    const shownAt = (level: number): number => Math.min(1, 0.08 + 0.8 * Math.min(1, level));
    const splashes: RainSplash[] = [];
    for (let row = Math.floor(view.y / cell); row <= Math.ceil((view.y + view.height) / cell); row++) {
        for (let column = Math.floor(view.x / cell); column <= Math.ceil((view.x + view.width) / cell); column++) {
            const clock = epoch + hash01(column, row, 17) * SPLASH_CYCLE_MS;
            const age = clock % SPLASH_CYCLE_MS;
            if (age >= SPLASH_MS) continue;
            const cycle = Math.floor(clock / SPLASH_CYCLE_MS) % SPLASH_CYCLES;
            const here = local ? local((column + 0.5) * cell, (row + 0.5) * cell) : 1;
            if (hash01(column + cycle, row, 19) >= shownAt(intensity * here)) continue;
            splashes.push({
                x: Math.round((column + hash01(column, row + cycle, 23)) * cell),
                y: Math.round((row + hash01(column + cycle, row + cycle, 29)) * cell),
                stage: Math.floor((age / SPLASH_MS) * 3),
            });
        }
    }
    return splashes;
}

/** The dark veil of the rain over the outdoors: barely there for a drizzle, a grey day under a downpour. */
export function rainVeilAlpha(intensity: number): number {
    return 0.01 + 0.13 * intensity;
}

/** How loud the rain is, in a share of the weather volume: the usual rain as before, a downpour louder. */
export function rainLoudness(intensity: number): number {
    return 0.06 + 0.16 * intensity;
}

/**
 * Development only: `?rainLevel=0.8` forces the intensity of the rain (0 to 1), `?rainLevel=cycle` sweeps it from a
 * drizzle to a downpour and back in 40 s. Undefined otherwise.
 */
export function parseRainLevel(search: string, isDev: boolean): number | "cycle" | undefined {
    if (!isDev) return undefined;
    const value = new URLSearchParams(search).get("rainLevel");
    if (value === null || value === "") return undefined;
    if (value === "cycle") return "cycle";
    const level = Number(value);
    return Number.isFinite(level) && level >= 0 && level <= 1 ? level : undefined;
}

const CYCLE_MS = 40_000;

/** The intensity forced by `?rainLevel` at this time, if any. */
export function forcedRainLevel(forced: number | "cycle" | undefined, now: number): number | undefined {
    if (forced !== "cycle") return forced;
    return 0.5 - 0.5 * Math.cos((2 * Math.PI * (now % CYCLE_MS)) / CYCLE_MS);
}
