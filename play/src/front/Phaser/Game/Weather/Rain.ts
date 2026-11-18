import { hash01 } from "../Autumn/LeafPalette";
import type { WeatherView } from "./WeatherFrame";

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

const DEG = Math.PI / 180;
/** Wind (km/h) at which the rain leans the most, and that lean: sideways pixels for one pixel down. */
const FULL_LEAN_WIND = 60;
const FULL_LEAN = 1;
/** Without a known wind: the usual one, from the north-west like the clouds, a light lean. */
const USUAL_LEAN = 0.3;

/**
 * How much the rain leans, in pixels sideways for one pixel down (positive: towards the east, the right of the map),
 * for a wind coming from `windFrom` degrees (0 north, 90 east) at `windSpeed` km/h. Only the east-west part of the
 * wind shows on a map seen from above; a wind of unknown speed counts as the usual one.
 */
export function rainLean(windFrom: number | undefined, windSpeed?: number, share = 1): number {
    return share * windLean(windFrom, windSpeed);
}

function windLean(windFrom: number | undefined, windSpeed: number | undefined): number {
    if (windFrom === undefined) return USUAL_LEAN;
    const strength =
        windSpeed === undefined ? 20 / FULL_LEAN_WIND : Math.min(1, Math.max(0, windSpeed) / FULL_LEAN_WIND);
    return -Math.sin(windFrom * DEG) * strength * FULL_LEAN;
}

export interface RainDrop {
    /** The head of the drop (its lowest point), map pixels. */
    x: number;
    y: number;
    /** Height of its streak, map pixels; it leans as the rain does. */
    length: number;
    alpha: number;
    /** 0 far, 1 middle, 2 near. */
    layer: number;
}

interface RainLayer {
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
const RAIN_LAYERS: readonly RainLayer[] = [
    { split: 2, speed: 150, fall: 160, length: 6, alpha: 0.45, from: 0, full: 0.9 },
    { split: 2, speed: 230, fall: 240, length: 10, alpha: 0.7, from: 0.05, full: 0.7 },
    { split: 1, speed: 330, fall: 320, length: 16, alpha: 0.9, from: 0.45, full: 1 },
];

/**
 * How much harder or lighter the rain falls at a point of the map than on the whole (1: the same): more under the
 * thick of a rain cloud, less in a gap between two.
 */
export type RainLocal = (x: number, y: number) => number;

/** The local factor under a rain cloud of this thickness (0 none, 1 its thickest). */
export function rainUnderCloud(thickness: number, effect = 1): number {
    return 1 + effect * (0.9 * Math.max(0, Math.min(1, thickness)) - 0.5);
}

const FALL_CYCLES = 100_000;

/** Base cells across the view: the drops are as many on the screen at any zoom, never countless zoomed out. */
const RAIN_CELLS = 500;
const SMALLEST_CELL = 16;

/** Side of the base cell for this view: a power of two, so a small scroll or zoom keeps the same grid. */
export function rainCell(view: WeatherView): number {
    const wanted = Math.sqrt((view.width * view.height) / RAIN_CELLS);
    return Math.max(SMALLEST_CELL, 2 ** Math.ceil(Math.log2(Math.max(1, wanted))));
}

/**
 * The drops of a rain of this intensity (0 to 1) over the view, fixed to the map: each cell of a plane lets one drop
 * fall at a time, a long way down along the lean of the rain, the next one starting from another place of the cell.
 * The same for everyone at the same server time.
 */
export function rainDrops(
    epoch: number,
    view: WeatherView,
    intensity: number,
    lean: number,
    local?: RainLocal,
): RainDrop[] {
    const base = rainCell(view);
    const time = epoch / 1000;
    const drops: RainDrop[] = [];
    RAIN_LAYERS.forEach((layer, index) => {
        const shownAt = (level: number): number => (Math.min(1, level) - layer.from) / (layer.full - layer.from);
        const shown = shownAt(intensity);
        // No drop of this plane anywhere, even under the thickest cloud.
        if ((local ? shownAt(intensity * rainUnderCloud(1)) : shown) <= 0) return;
        const cell = base / layer.split;
        // A drop falls well below its cell and slides sideways by the lean times its fall: those of the cells above
        // and beside the view may be in it.
        const reach = Math.ceil((Math.abs(lean) * layer.fall) / cell) + 1;
        const firstRow = Math.floor((view.y - layer.fall) / cell) - 1;
        const lastRow = Math.ceil((view.y + view.height) / cell);
        const firstColumn = Math.floor(view.x / cell) - reach;
        const lastColumn = Math.ceil((view.x + view.width) / cell) + reach;
        for (let row = firstRow; row <= lastRow; row++) {
            for (let column = firstColumn; column <= lastColumn; column++) {
                // Which drops show is drawn apart from where they are: a light rain is not a corner of a heavy one.
                const here = local ? shownAt(intensity * local((column + 0.5) * cell, (row + 0.5) * cell)) : shown;
                if (hash01(column, row, 11 + index) >= here) continue;
                // Each drop a little faster or slower than its plane: no curtain falling as one.
                const falls =
                    hash01(column, row, 3 + index) +
                    (time * layer.speed * (0.85 + 0.3 * hash01(column, row, 7))) / layer.fall;
                // Which fall of this cell it is (kept small, so it stays exact in the hash), and how far along.
                const cycle = Math.floor(falls) % FALL_CYCLES;
                const fallen = (falls - Math.floor(falls)) * layer.fall;
                drops.push({
                    x: (column + hash01(column + cycle, row, 5 + index)) * cell + lean * fallen,
                    y: (row + hash01(column, row + cycle, 13 + index)) * cell + fallen,
                    length: layer.length,
                    alpha: layer.alpha,
                    layer: index,
                });
            }
        }
    });
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
