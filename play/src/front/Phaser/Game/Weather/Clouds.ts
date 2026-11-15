import { hash01 } from "../Autumn/LeafPalette";
import type { SunPosition } from "../Night/NightClock";
import { TILE_SIZE } from "../Wander/WanderSchedule";
import { repeatedOverView } from "./WeatherFrame";
import type { FogPatch, WeatherView } from "./WeatherFrame";

const DEG = Math.PI / 180;

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
const COVER_SIZE = 1.9;
const MIN_COVER = 0.05;
const MAX_COVER = 0.97;
function cloudSize(cloudiness: number): number {
    const cover = Math.max(MIN_COVER, Math.min(MAX_COVER, cloudiness));
    return COVER_SIZE * Math.sqrt(-Math.log(1 - cover) / cover);
}
/** Size of a cloud against the others, drawn for each: from 0.45 to 1.75 times the usual size, mostly small ones. */
const SMALLEST_CLOUD = 0.45;
const BIGGEST_CLOUD = 1.75;
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
/** Each cloud is a main puff and two smaller lobes. */
const LOBES: readonly { dx: number; dy: number; scale: number }[] = [
    { dx: 0, dy: 0, scale: 1 },
    { dx: -0.6, dy: 0.2, scale: 0.7 },
    { dx: 0.65, dy: 0.15, scale: 0.65 },
];

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

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

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
        // Lobes moved a little for each cloud, so no two clouds have the same shape.
        const lobes = LOBES.map((lobe, lobeIndex) => ({
            dx: lobe.dx + (hash01(index, 43 + lobeIndex) - 0.5) * 0.3,
            dy: lobe.dy + (hash01(index, 47 + lobeIndex) - 0.5) * 0.4,
            scale: lobe.scale,
        }));
        // Far enough for a puff whose centre is out of the view to still reach into it.
        for (const centre of repeatedOverView(square, SKY_PERIOD, view, CLOUD_REACH * radius)) {
            for (const lobe of lobes) {
                patches.push({
                    x: centre.x + lobe.dx * radius,
                    y: centre.y + lobe.dy * radius,
                    radius: Math.round(radius * lobe.scale),
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
