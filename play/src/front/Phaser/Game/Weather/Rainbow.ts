const DEG = Math.PI / 180;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * A rainbow is seen with the sun behind and the rain in front: 42° from the point opposite the sun, so only while the
 * sun is up and lower than 42°. It fades in as the sun clears the horizon and out as it nears 42°.
 */
const RAINBOW_MAX_ELEVATION = 42;
const FADE_LOW = 3;
const FADE_HIGH = 6;
/** A storm hides the sun more often: its rainbows are fainter. A covered sky lets less of the sun through. */
const STORM_FACTOR = 0.5;
const COVER_DIMMING = 0.6;

/** How strong the rainbow is (0: none, 1: full), for a rain under the sun at `sunElevation` degrees. */
export function rainbowStrength(
    raining: boolean,
    storm: boolean,
    sunElevation: number | undefined,
    cloudCover: number | undefined,
    /** The share of what falls that falls as snow (0 to 1): a rainbow is made by drops of water, not by flakes. */
    snowShare = 0,
): number {
    if (!raining || sunElevation === undefined) return 0;
    if (sunElevation <= 0 || sunElevation >= RAINBOW_MAX_ELEVATION) return 0;
    const rising = clamp01(sunElevation / FADE_LOW);
    const setting = clamp01((RAINBOW_MAX_ELEVATION - sunElevation) / FADE_HIGH);
    const sunThrough = 1 - COVER_DIMMING * clamp01(cloudCover ?? 0);
    return rising * setting * sunThrough * (storm ? STORM_FACTOR : 1) * (1 - clamp01(snowShare));
}

/**
 * Where the rainbow stands on the map, fixed to it: centred on the map, a third of it wide, bowed away from the sun
 * (`direction`, a unit vector: the way the shadows fall). Its arc is as wide as the sun is low, as the true one is:
 * half a circle with the sun on the horizon, a short arc as it nears 42°. `span` is the cosine of the half opening of
 * the arc, around `direction`. Sun in degrees: azimuth 0 north, 90 east (as cloudShadowOffset).
 */
export function rainbowPlacement(
    map: { width: number; height: number },
    sun: { azimuth: number; elevation: number },
): { x: number; y: number; radius: number; direction: { x: number; y: number }; span: number } {
    const direction = { x: -Math.sin(sun.azimuth * DEG), y: Math.cos(sun.azimuth * DEG) };
    const halfOpening = 90 * clamp01((RAINBOW_MAX_ELEVATION - sun.elevation) / RAINBOW_MAX_ELEVATION);
    return {
        x: map.width / 2,
        y: map.height / 2,
        radius: Math.min(MAX_RADIUS, RADIUS_SHARE * Math.min(map.width, map.height)),
        direction,
        span: Math.cos(halfOpening * DEG),
    };
}

/** The rainbow is a third of the map wide, at most 50 tiles of radius. */
const RADIUS_SHARE = 0.35;
const MAX_RADIUS = 50 * 32;
