import { hash01 } from "../Autumn/LeafPalette";
import type { SunPosition } from "../Night/NightClock";
import { TILE_SIZE } from "../Wander/WanderSchedule";
import { repeatedOverView } from "./WeatherFrame";
import type { FogPatch, WeatherView } from "./WeatherFrame";

const DEG = Math.PI / 180;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Clouds per square of the sky at most (a cloudiness of 1); they appear one after the other as it grows. */
const MAX_CLOUDS = 12;
/**
 * The sky is one square of clouds repeated over the whole map, fixed to the map: the camera, its zoom and the size of
 * the screen never move nor resize them. In map pixels.
 */
const SKY_PERIOD = 2100;
const CLOUD_RADIUS = 220;
/**
 * Size of the clouds for a cloudiness, so that they cover that share of the map (90 % of cloud cover, 90 % of the map
 * under clouds): clouds overlap more as the sky fills up, so they grow faster and faster, and a very cloudy sky is a
 * mass of clouds that join, not a field of dots. Overcast (from 97 %) gives the size of 97 %.
 */
const COVER_SIZE = 1.75;
const MIN_COVER = 0.05;
const MAX_COVER = 0.97;
function cloudSize(cloudiness: number): number {
    const cover = Math.max(MIN_COVER, Math.min(MAX_COVER, cloudiness));
    return COVER_SIZE * Math.sqrt(-Math.log(1 - cover) / cover);
}
/** Size of a cloud against the others, drawn for each: from 0.45 to 1.75 times the usual size, mostly small ones. */
const SMALLEST_CLOUD = 0.45;
const BIGGEST_CLOUD = 1.75;
/**
 * Each copy of a cloud over the map is moved (up to 0.3 of the square of the sky) and sized (0.75 to 1.3 times) its own
 * way, the same for everyone: zoomed out, the sky shows no repeated pattern.
 */
const COPY_SHIFT = 0.3;
const COPY_SMALLEST = 0.75;
const COPY_BIGGEST = 1.3;
/** Copies are told apart over this many squares of the sky: far beyond any screen, and small numbers for the hash. */
const COPY_CYCLE = 997;
/** Farthest a puff reaches from the centre of its cloud, in radii: the main puff and its farthest lobe. */
const CLOUD_REACH = 1.6;
/**
 * Drift of the clouds without a wind (Automatic, or none given): 60 px a second, a screen crossed in about 30 s, from
 * the north-west.
 */
const CLOUD_DRIFT = { x: 48, y: 36 };
export const CLOUD_DRIFT_PER_SECOND = Math.hypot(CLOUD_DRIFT.x, CLOUD_DRIFT.y);

type Vector = { x: number; y: number };

/**
 * The drift of the clouds (map pixels a second, north up, y down) for a wind coming from `windFrom` degrees (0 north,
 * 90 east): blown away from it, at the usual speed (the true speed would not show at the scale of the map).
 */
export function cloudDrift(windFrom: number | undefined): Vector {
    if (windFrom === undefined) return CLOUD_DRIFT;
    return {
        x: -CLOUD_DRIFT_PER_SECOND * Math.sin(windFrom * DEG),
        y: CLOUD_DRIFT_PER_SECOND * Math.cos(windFrom * DEG),
    };
}

/**
 * Where the sky has drifted to, by the server time. While the wind holds, server time × drift: the same sky for
 * everyone. When it turns, the sky goes on from where it was (no jump); a page opened after the turn places it by the
 * new wind alone, so the clouds of two people may then differ.
 */
export class SkyDrift {
    private shift: Vector = { x: 0, y: 0 };
    private drift: Vector | undefined;

    public at(epoch: number, drift: Vector): Vector {
        const seconds = epoch / 1000;
        if (this.drift && (this.drift.x !== drift.x || this.drift.y !== drift.y)) {
            this.shift = {
                x: this.shift.x + seconds * (this.drift.x - drift.x),
                y: this.shift.y + seconds * (this.drift.y - drift.y),
            };
        }
        this.drift = drift;
        return { x: seconds * drift.x + this.shift.x, y: seconds * drift.y + this.shift.y };
    }
}
/**
 * Each cloud is a cumulus: a main puff and smaller ones around it, spread wider than tall, placed and sized its own way
 * for each cloud so that no two clouds have the same outline.
 */
export const CLOUD_PUFFS = 7;
const PUFF_SPREAD_ACROSS = 0.72;
const PUFF_SPREAD_DOWN = 0.35;
const PUFF_SMALLEST = 0.5;
const PUFF_BIGGEST = 0.75;

function cloudPuffs(index: number): { dx: number; dy: number; scale: number }[] {
    const puffs = [{ dx: 0, dy: 0, scale: 1 }];
    for (let puff = 1; puff < CLOUD_PUFFS; puff++) {
        const angle = ((puff - 1) / (CLOUD_PUFFS - 1) + (hash01(index, 43 + puff) - 0.5) * 0.1) * 2 * Math.PI;
        puffs.push({
            dx: Math.cos(angle) * PUFF_SPREAD_ACROSS,
            dy: Math.sin(angle) * PUFF_SPREAD_DOWN,
            scale: PUFF_SMALLEST + (PUFF_BIGGEST - PUFF_SMALLEST) * hash01(index, 53 + puff),
        });
    }
    return puffs;
}

/**
 * The share of the map the clouds of a clear sky cover for a cloud cover: the cover itself up to 35 %, then growing
 * slowly to 55 % for an overcast sky, so the ground stays in sight between cumulus instead of under a sheet. A very
 * cloudy sky shows in the colour of the clouds (cloudPalette) and the grey veil.
 */
const SHOWN_COVER_FULL = 0.35;
const SHOWN_COVER_SLOPE = 0.3;
export function shownCloudiness(cloudiness: number): number {
    if (cloudiness <= SHOWN_COVER_FULL) return cloudiness;
    return SHOWN_COVER_FULL + (cloudiness - SHOWN_COVER_FULL) * SHOWN_COVER_SLOPE;
}

/** The three tones of a cloud: the side facing the light, the middle, the side away from it. */
export interface CloudPalette {
    lit: number;
    mid: number;
    shade: number;
}
const CLEAR_PALETTE: CloudPalette = { lit: 0xffffff, mid: 0xe3e8ef, shade: 0xb4becb };
/** A very cloudy sky greys its clouds, up to this share of this grey for an overcast one, from 50 % of cover. */
const GREY_CLOUD = 0x8e97a3;
const GREY_FROM = 0.5;
const GREY_SHARE = 0.45;

function mixColor(from: number, to: number, share: number): number {
    const channel = (shift: number): number => {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        return Math.round(a + (b - a) * share) << shift;
    };
    return channel(16) | channel(8) | channel(0);
}

/** The tones of the clouds for a cloud cover: white by fine weather, greyer as the sky gets covered. */
export function cloudPalette(cloudiness: number): CloudPalette {
    const share = GREY_SHARE * clamp01((cloudiness - GREY_FROM) / (1 - GREY_FROM));
    if (share <= 0) return CLEAR_PALETTE;
    return {
        lit: mixColor(CLEAR_PALETTE.lit, GREY_CLOUD, share),
        mid: mixColor(CLEAR_PALETTE.mid, GREY_CLOUD, share),
        shade: mixColor(CLEAR_PALETTE.shade, GREY_CLOUD, share),
    };
}

/**
 * The share of the map the clouds of a rain or a storm cover for their cloud cover (60 % at least): from 45 % to 65 %,
 * more than fine weather clouds but never a sheet, the ground showing between them. The dark veil of the weather
 * tells the sky is covered.
 */
const RAIN_COVER_FROM = 0.6;
const RAIN_SHOWN_FROM = 0.45;
const RAIN_SHOWN_TO = 0.65;
export function shownRainCover(cover: number): number {
    const share = clamp01((cover - RAIN_COVER_FROM) / (1 - RAIN_COVER_FROM));
    return RAIN_SHOWN_FROM + (RAIN_SHOWN_TO - RAIN_SHOWN_FROM) * share;
}

/** The tones of rain or storm clouds of a colour: that colour in the middle, lighter towards the light, darker away. */
export function rainPalette(color: number): CloudPalette {
    return { lit: mixColor(color, 0xffffff, 0.2), mid: color, shade: mixColor(color, 0x000000, 0.25) };
}

/**
 * Opacity of a cloud cell by its thickness level: a faint rim on the first two levels, then the whole body, so a cloud
 * has an edge instead of fading out like a mist.
 */
export function cloudAlpha(level: number, body: number): number {
    if (level <= 0) return 0;
    if (level === 1) return 0.35 * body;
    if (level === 2) return 0.7 * body;
    return body;
}

/** How far a cell looks towards the light to tell its tone, in map pixels: the same at any zoom. */
const SHADE_REACH = 48;

/**
 * Where the clouds are lit from, in cells of `size` map pixels: always the north-west, as the map is drawn, whatever the
 * sun (which only moves their shadows). Lit from the south, as the sun of our latitudes would, they read as dents.
 */
export function cloudLightStep(size: number): { columns: number; rows: number } {
    const reach = Math.max(1, Math.round((SHADE_REACH * Math.SQRT1_2) / size));
    return { columns: -reach, rows: -reach };
}

/**
 * The cells of a field of clouds split by tone, each keeping its level: lit when its neighbour towards the light is
 * thinner (the side facing the light), shaded when the one away from it is, the middle otherwise.
 */
export function cloudTones(
    levels: Uint8Array,
    columns: number,
    rows: number,
    towardsLight: { columns: number; rows: number },
): { lit: Uint8Array; mid: Uint8Array; shade: Uint8Array } {
    const lit = new Uint8Array(levels.length);
    const mid = new Uint8Array(levels.length);
    const shade = new Uint8Array(levels.length);
    const at = (column: number, line: number): number =>
        column < 0 || column >= columns || line < 0 || line >= rows ? 0 : levels[line * columns + column];
    for (let line = 0; line < rows; line++) {
        for (let column = 0; column < columns; column++) {
            const cell = line * columns + column;
            const level = levels[cell];
            if (level === 0) continue;
            if (at(column + towardsLight.columns, line + towardsLight.rows) < level) lit[cell] = level;
            else if (at(column - towardsLight.columns, line - towardsLight.rows) < level) shade[cell] = level;
            else mid[cell] = level;
        }
    }
    return { lit, mid, shade };
}

/**
 * Clouds whole while a map pixel takes 0.8 screen pixel or less, gone from 1.4 (a map opens at 1.5): zoomed in, the
 * camera is under them, and only their shadows on the ground remain. One notch of the wheel out shows them. Measured
 * on the screen, not by the camera zoom, which stays at 1 while Phaser stretches the canvas (Retina screens).
 */
const ZOOM_WHOLE = 0.8;
const ZOOM_GONE = 1.4;
/**
 * `height` (0 to 1, a personal setting) raises the clouds: the zoom that passes under them is `1 / (1 - height)` times
 * closer (twice at 0.5, four times at 0.75), and at 1 one never passes under them.
 */
export function cloudZoomFade(screenScale: number, height = 0): number {
    if (!Number.isFinite(screenScale) || height >= 1) return 1;
    const higher = 1 / (1 - clamp01(height));
    return 1 - clamp01((screenScale - ZOOM_WHOLE * higher) / ((ZOOM_GONE - ZOOM_WHOLE) * higher));
}

/** Height of the clouds and longest shadow, in tiles. */
const CLOUD_HEIGHT_TILES = 3;
const MAX_SHADOW_TILES = 6;
/** Sun elevations (degrees): clouds darken from 2° to the end of civil dusk (-6°); shadows fade from 6° to 2°. */
const DAYLIGHT_ELEVATION = 2;
const NIGHT_ELEVATION = -6;
const SHADOWS_FULL_ELEVATION = 6;
/** Clouds at night: dark grey-blue, a little lighter, so they pass over the night veil without lighting it. */
export const NIGHT_CLOUD_COLOR = 0x3b4560;
const NIGHT_CLOUD_ALPHA_FACTOR = 0.7;
/** The grey veil of an overcast sky, rising with the cloudiness from 0.6 to 0.9. */
const OVERCAST_FROM = 0.6;
const OVERCAST_FULL = 0.9;
const OVERCAST_ALPHA = 0.08;

/**
 * Where the shadow of a cloud falls from the cloud, in map pixels (north up, y down): away from the sun, longer when
 * it is low (3 tiles of height, 6 tiles at most). None with the sun under 2°.
 */
export function cloudShadowOffset(sun: SunPosition | undefined): { x: number; y: number } | undefined {
    if (!sun || sun.elevation < DAYLIGHT_ELEVATION) return undefined;
    const length = Math.min(MAX_SHADOW_TILES, CLOUD_HEIGHT_TILES / Math.tan(sun.elevation * DEG)) * TILE_SIZE;
    return { x: -length * Math.sin(sun.azimuth * DEG), y: length * Math.cos(sun.azimuth * DEG) };
}

/**
 * How night it is for the clouds (0 by day, 1 once dusk is over: they darken as the night veil does) and how visible
 * their shadows are (only with a sun high enough). Without a sun: daylight clouds, no shadow.
 */
export function cloudSunlight(elevation: number | undefined): { night: number; shadows: number } {
    if (elevation === undefined) return { night: 0, shadows: 0 };
    return {
        night: clamp01((DAYLIGHT_ELEVATION - elevation) / (DAYLIGHT_ELEVATION - NIGHT_ELEVATION)),
        shadows: clamp01((elevation - DAYLIGHT_ELEVATION) / (SHADOWS_FULL_ELEVATION - DAYLIGHT_ELEVATION)),
    };
}

/** A cloud colour and opacity for how night it is: as it is by day, dark grey-blue and lighter at night. */
export function cloudTint(color: number, alpha: number, night: number): { color: number; alpha: number } {
    if (night <= 0) return { color, alpha };
    const mix = (shift: number): number => {
        const day = (color >> shift) & 0xff;
        const dark = (NIGHT_CLOUD_COLOR >> shift) & 0xff;
        return Math.round(day + (dark - day) * clamp01(night)) << shift;
    };
    return {
        color: mix(16) | mix(8) | mix(0),
        alpha: alpha * (1 + (NIGHT_CLOUD_ALPHA_FACTOR - 1) * clamp01(night)),
    };
}

/** Opacity of the grey veil of an overcast sky (0 below a cloudiness of 0.6), fading with the clouds at dusk. */
export function overcastVeil(cloudiness: number, daylight = 1): number {
    return OVERCAST_ALPHA * daylight * clamp01((cloudiness - OVERCAST_FROM) / (OVERCAST_FULL - OVERCAST_FROM));
}

/** A copy number brought into 0..COPY_CYCLE - 1. */
function cycled(value: number): number {
    return ((value % COPY_CYCLE) + COPY_CYCLE) % COPY_CYCLE;
}

/**
 * The puffs of the clouds over the view (and a margin around it), drifting with the server time: a square of the sky
 * repeated over the map, so the clouds are the same for any camera, zoom or screen. A cloudier sky has more clouds,
 * the last one fading in (its `weight`). `sky` is where the sky has drifted to (SkyDrift); by default, server time ×
 * the drift without wind.
 */
export function cloudPatches(
    epoch: number,
    view: WeatherView,
    cloudiness: number,
    still: boolean,
    sky?: Vector,
): FogPatch[] {
    const time = epoch / 1000;
    const drifted = still ? { x: 0, y: 0 } : (sky ?? { x: time * CLOUD_DRIFT.x, y: time * CLOUD_DRIFT.y });
    const patches: FogPatch[] = [];
    for (let index = 0; index < MAX_CLOUDS; index++) {
        const weight = clamp01(cloudiness * MAX_CLOUDS - index);
        if (weight === 0) break;
        const size = cloudSize(cloudiness);
        // Sizes spread from small to big, with more small clouds than big ones.
        const radius =
            CLOUD_RADIUS * size * (SMALLEST_CLOUD + (BIGGEST_CLOUD - SMALLEST_CLOUD) * hash01(index, 31) ** 2);
        const square = {
            x: hash01(index, 37) * SKY_PERIOD + drifted.x,
            y: hash01(index, 41) * SKY_PERIOD + drifted.y,
        };
        const lobes = cloudPuffs(index);
        // Far enough for a puff whose centre is out of the view, or moved off it, to still reach into it.
        const reach = CLOUD_REACH * radius * COPY_BIGGEST + COPY_SHIFT * SKY_PERIOD;
        for (const copy of repeatedOverView(square, SKY_PERIOD, view, reach)) {
            // Which copy it is, counted from the drifting square: it keeps its shift and size as the sky drifts.
            const column = cycled(Math.round((copy.x - square.x) / SKY_PERIOD));
            const row = cycled(Math.round((copy.y - square.y) / SKY_PERIOD));
            const seed = index * COPY_CYCLE + column;
            const centre = {
                x: copy.x + (hash01(seed, row, 1) - 0.5) * 2 * COPY_SHIFT * SKY_PERIOD,
                y: copy.y + (hash01(seed, row, 2) - 0.5) * 2 * COPY_SHIFT * SKY_PERIOD,
            };
            const copyRadius = radius * (COPY_SMALLEST + (COPY_BIGGEST - COPY_SMALLEST) * hash01(seed, row, 3));
            for (const lobe of lobes) {
                patches.push({
                    x: centre.x + lobe.dx * copyRadius,
                    y: centre.y + lobe.dy * copyRadius,
                    radius: Math.round(copyRadius * lobe.scale),
                    weight,
                });
            }
        }
    }
    return patches;
}

/**
 * The shadows of the clouds: the same field of clouds, moved by the offset. Taken around the view moved back by the
 * offset, so the shadows cover the view as fully as the clouds do.
 */
export function shadowPatches(
    epoch: number,
    view: WeatherView,
    cloudiness: number,
    still: boolean,
    offset: { x: number; y: number },
    sky?: Vector,
): FogPatch[] {
    const source = { ...view, x: view.x - offset.x, y: view.y - offset.y };
    return cloudPatches(epoch, source, cloudiness, still, sky).map((patch) => ({
        ...patch,
        x: patch.x + offset.x,
        y: patch.y + offset.y,
    }));
}

/** Size of a cloud block on the screen, about: fine enough for a cloud to glide. */
const CLOUD_BLOCK_ON_SCREEN = 12;

/**
 * Size of a cloud block in map pixels for a zoom: a power of two, about 12 screen pixels, so it changes only at a few
 * steps of zoom (not at every notch) and the cost stays the same zoomed out.
 */
export function cloudBlockSize(zoom: number): number {
    if (!Number.isFinite(zoom) || zoom <= 0) return 16;
    const exponent = Math.floor(Math.log2(CLOUD_BLOCK_ON_SCREEN / zoom));
    return Math.min(64, Math.max(4, 2 ** exponent));
}
