/**
 * The power of a lamp, in lumens, in place of a reach and a strength set apart. A real lamp has one figure, its flux:
 * its light weakens with the square of the distance, and its "reach" is only where that light gets too faint to see.
 *
 * The model, kept simple: a lamp hung LAMP_HEIGHT_M above the floor lights downwards, over half a sphere; the light on
 * the floor at a distance d of its foot is flux / (2π (d² + height²)), in lux. Its reach ends where REACH_LUX is left
 * (about what lets one tell the floor at night), and its foot is fully lit from FULL_LUMENS on. A tile of the map is
 * taken for TILE_AREA_M2 of floor. With these, the lamp of today (6 tiles, full strength) is a living room bulb.
 */
const LAMP_HEIGHT_M = 2.2;
const TILE_AREA_M2 = 1.2;
const REACH_LUX = 2;
const LUX_TO_LUMENS = 2 * Math.PI * REACH_LUX;
/** What the reach is dragged by, and what the strength is set by, in the editor. */
const RADIUS_STEP_TILES = 0.5;
const INTENSITY_STEP_PERCENT = 5;
const MIN_INTENSITY_PERCENT = 10;
/** A lamp whose strength is within this of what its reach asks for is a real lamp, not one set freely. */
const ON_CURVE_PERCENT = 5;
const MIN_RADIUS_TILES = 1;
const MAX_RADIUS_TILES = 20;

/** The flux of a lamp that reaches this far, in lumens. */
export function lumensOfReach(radiusTiles: number): number {
    return Math.round(LUX_TO_LUMENS * (TILE_AREA_M2 * radiusTiles * radiusTiles + LAMP_HEIGHT_M * LAMP_HEIGHT_M));
}

/** From this flux on, the foot of the lamp is fully lit: the flux of the lamp of today (6 tiles, full strength). */
const FULL_LUMENS = lumensOfReach(6);
export const LAMP_LUMENS_MIN = 75;
export const LAMP_LUMENS_MAX = lumensOfReach(MAX_RADIUS_TILES);

/** The reach (in tiles) and the strength (in percent) of a lamp of this flux, as the editor sets them. */
export function lampFromLumens(lumens: number): { radius: number; intensityPercent: number } {
    const flux = Number.isFinite(lumens)
        ? Math.min(LAMP_LUMENS_MAX, Math.max(LAMP_LUMENS_MIN, lumens))
        : LAMP_LUMENS_MIN;
    const tiles = Math.sqrt(Math.max(0, flux / LUX_TO_LUMENS - LAMP_HEIGHT_M * LAMP_HEIGHT_M) / TILE_AREA_M2);
    const radius = Math.min(
        MAX_RADIUS_TILES,
        Math.max(MIN_RADIUS_TILES, Math.round(tiles / RADIUS_STEP_TILES) * RADIUS_STEP_TILES),
    );
    const percent = Math.round(((flux / FULL_LUMENS) * 100) / INTENSITY_STEP_PERCENT) * INTENSITY_STEP_PERCENT;
    return { radius, intensityPercent: Math.min(100, Math.max(MIN_INTENSITY_PERCENT, percent)) };
}

/**
 * The flux of a lamp set to this reach and this strength, when they go together as they do for a real lamp; undefined
 * for a lamp set freely (a long reach with little light, a short one at full strength).
 */
export function lumensOfLamp(radiusTiles: number, intensityPercent: number): number | undefined {
    const lumens = lumensOfReach(radiusTiles);
    return Math.abs(lampFromLumens(lumens).intensityPercent - intensityPercent) <= ON_CURVE_PERCENT
        ? lumens
        : undefined;
}

export type LampLumensPresetName = "candle" | "accent" | "desk" | "bulb" | "ceiling" | "floodlight";

/** A few real lamps, by their flux. */
export const LAMP_LUMENS_PRESETS: readonly { name: LampLumensPresetName; lumens: number }[] = [
    { name: "candle", lumens: 75 },
    { name: "accent", lumens: 200 },
    { name: "desk", lumens: 360 },
    { name: "bulb", lumens: 600 },
    { name: "ceiling", lumens: 1600 },
    { name: "floodlight", lumens: 3500 },
];

/**
 * How strong the light of a real lamp is at a distance (0 at the lamp, 1 at the end of its reach), from 1 to 0: the
 * law of the model above, brought to 1 at the foot and 0 at the end. It fades faster near the lamp than the usual
 * falloff (lightFalloff), with a long faint tail; the further the lamp reaches, the more so.
 */
export function realLightFalloff(distance: number, radiusTiles: number): number {
    if (distance >= 1) {
        return 0;
    }
    const t = Math.max(0, distance);
    const spread = (TILE_AREA_M2 * radiusTiles * radiusTiles) / (LAMP_HEIGHT_M * LAMP_HEIGHT_M);
    const atEnd = 1 / (spread + 1);
    return (1 / (spread * t * t + 1) - atEnd) / (1 - atEnd);
}
