import { hash01 } from "../Autumn/LeafPalette";
import type { FogPatch, WeatherView } from "./WeatherFrame";

/** Clouds per square of the sky at most (a cloudiness of 1); they appear one after the other as it grows. */
const MAX_CLOUDS = 6;
/**
 * The sky is one square of clouds repeated over the whole map, fixed to the map: the camera, its zoom and the size of
 * the screen never move nor resize them. In map pixels.
 */
const SKY_PERIOD = 2400;
const CLOUD_RADIUS = 150;
/** Drift of the clouds, the same direction for everyone: 60 px a second, a screen crossed in about 30 s. */
const CLOUD_DRIFT = { x: 48, y: 36 };
export const CLOUD_DRIFT_PER_SECOND = Math.hypot(CLOUD_DRIFT.x, CLOUD_DRIFT.y);
/** Each cloud is a main puff and two smaller lobes. */
const LOBES: readonly { dx: number; dy: number; scale: number }[] = [
    { dx: 0, dy: 0, scale: 1 },
    { dx: -0.6, dy: 0.2, scale: 0.7 },
    { dx: 0.65, dy: 0.15, scale: 0.65 },
];

const TILE = 32;
/** Height of the clouds and longest shadow, in tiles. */
const CLOUD_HEIGHT_TILES = 3;
const MAX_SHADOW_TILES = 6;
/** Sun elevations (degrees): clouds fade from sunset to 2°, their shadows from 2° to 6°. */
const SUNSET_ELEVATION = -0.833;
const CLOUDS_FULL_ELEVATION = 2;
const SHADOWS_FULL_ELEVATION = 6;
/** The grey veil of an overcast sky, rising with the cloudiness from 0.6 to 0.9. */
const OVERCAST_FROM = 0.6;
const OVERCAST_FULL = 0.9;
const OVERCAST_ALPHA = 0.08;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const DEG = Math.PI / 180;

/** Where the sun is, in degrees: elevation above the horizon, azimuth from the north, clockwise. */
export interface SunPosition {
    elevation: number;
    azimuth: number;
}

/**
 * Where the shadow of a cloud falls from the cloud, in map pixels (north up, y down): away from the sun, longer when
 * it is low (3 tiles of height, 6 tiles at most). None with the sun under 2°.
 */
export function cloudShadowOffset(sun: SunPosition | undefined): { x: number; y: number } | undefined {
    if (!sun || sun.elevation < CLOUDS_FULL_ELEVATION) return undefined;
    const length = Math.min(MAX_SHADOW_TILES, CLOUD_HEIGHT_TILES / Math.tan(sun.elevation * DEG)) * TILE;
    return { x: -length * Math.sin(sun.azimuth * DEG), y: length * Math.cos(sun.azimuth * DEG) };
}

/** How visible the clouds and their shadows are with the sun at this elevation (no clouds at night, no cut at dusk). */
export function cloudSunlight(elevation: number | undefined): { clouds: number; shadows: number } {
    if (elevation === undefined) return { clouds: 1, shadows: 0 };
    return {
        clouds: clamp01((elevation - SUNSET_ELEVATION) / (CLOUDS_FULL_ELEVATION - SUNSET_ELEVATION)),
        shadows: clamp01((elevation - CLOUDS_FULL_ELEVATION) / (SHADOWS_FULL_ELEVATION - CLOUDS_FULL_ELEVATION)),
    };
}

/** Opacity of the grey veil of an overcast sky (0 below a cloudiness of 0.6). */
export function overcastVeil(cloudiness: number): number {
    return OVERCAST_ALPHA * clamp01((cloudiness - OVERCAST_FROM) / (OVERCAST_FULL - OVERCAST_FROM));
}

/**
 * The puffs of the clouds over the view (and a margin around it), drifting with the server time: a square of the sky
 * repeated over the map, so the clouds are the same for any camera, zoom or screen. A cloudier sky has more clouds,
 * the last one fading in (its `weight`).
 */
export function cloudPatches(epoch: number, view: WeatherView, cloudiness: number, still: boolean): FogPatch[] {
    const time = still ? 0 : epoch / 1000;
    const wrap = (value: number, period: number): number => ((value % period) + period) % period;
    // Far enough for a puff whose centre is out of the view to still reach into it.
    const margin = 2.5 * CLOUD_RADIUS;
    const left = view.x - margin;
    const top = view.y - margin;
    const right = view.x + view.width + margin;
    const bottom = view.y + view.height + margin;
    const patches: FogPatch[] = [];
    for (let index = 0; index < MAX_CLOUDS; index++) {
        const weight = clamp01(cloudiness * MAX_CLOUDS - index);
        if (weight === 0) break;
        const radius = CLOUD_RADIUS * (0.8 + 0.4 * hash01(index, 31));
        // Where this cloud is in the square of the sky, then every copy of the square over the view.
        const skyX = wrap(hash01(index, 37) * SKY_PERIOD + time * CLOUD_DRIFT.x, SKY_PERIOD);
        const skyY = wrap(hash01(index, 41) * SKY_PERIOD + time * CLOUD_DRIFT.y, SKY_PERIOD);
        for (let x = skyX + Math.floor((left - skyX) / SKY_PERIOD) * SKY_PERIOD; x <= right; x += SKY_PERIOD) {
            if (x < left) continue;
            for (let y = skyY + Math.floor((top - skyY) / SKY_PERIOD) * SKY_PERIOD; y <= bottom; y += SKY_PERIOD) {
                if (y < top) continue;
                for (const lobe of LOBES) {
                    patches.push({
                        x: x + lobe.dx * radius,
                        y: y + lobe.dy * radius,
                        radius: Math.round(radius * lobe.scale),
                        weight,
                    });
                }
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
): FogPatch[] {
    const source = { ...view, x: view.x - offset.x, y: view.y - offset.y };
    return cloudPatches(epoch, source, cloudiness, still).map((patch) => ({
        ...patch,
        x: patch.x + offset.x,
        y: patch.y + offset.y,
    }));
}
