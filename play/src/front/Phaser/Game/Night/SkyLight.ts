import { WeatherType } from "@workadventure/map-editor";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { cloudSunlight } from "../Weather/Clouds";
import type { SunPosition } from "./NightClock";

/** The body of the sky that lights the map and casts the shadows. */
export type SkyBody = "sun" | "moon";

/** The light of the sky: where it comes from (degrees, azimuth from the north, clockwise), how strong, of what colour. */
export interface SkyLight {
    body: SkyBody;
    azimuth: number;
    elevation: number;
    /** 0 (no light) to 1 (a high sun in a clear sky). */
    intensity: number;
    color: number;
    /** The shortest and the longest shadow it casts, in map pixels (the personal limits of its body). */
    shadowLength: Range;
}

/** A range of values, the minimum and the maximum included. */
export interface Range {
    min: number;
    max: number;
}

/** How the light of the moon follows its phase: in proportion to its lit fraction, or as the real moon does. */
export type MoonPhaseCurve = "linear" | "realistic";

/**
 * The personal settings of a body: whether it lights the map at all, and the limits of its light. `intensity` and
 * `color` are shares of what the body gives at its strongest (a high sun in a clear sky, a high full moon; the colour
 * of a sun on the horizon, of the moon), from 0 to 2; `shadowLength` is in tiles.
 */
export interface BodyLightSettings {
    enabled: boolean;
    intensity: Range;
    color: Range;
    shadowLength: Range;
}

export interface SkyLightSettings {
    sun: BodyLightSettings;
    moon: BodyLightSettings & { phaseCurve: MoonPhaseCurve };
}

/** The longest shadow there can be, in tiles, whatever the settings: the shadows of the view are drawn within it. */
export const MAX_SHADOW_TILES = 8;
/** The longest shadow by default, in tiles. */
export const DEFAULT_SHADOW_TILES = 4;

const DEFAULT_BODY: BodyLightSettings = {
    enabled: true,
    intensity: { min: 0, max: 1 },
    color: { min: 0, max: 1 },
    shadowLength: { min: 0, max: DEFAULT_SHADOW_TILES },
};
export const DEFAULT_SKY_LIGHT_SETTINGS: SkyLightSettings = {
    sun: DEFAULT_BODY,
    moon: { ...DEFAULT_BODY, phaseCurve: "realistic" },
};

/** A full moon high in a clear sky lights this much against a high sun: its shadows are faint. */
export const MOON_LIGHT_MAX = 0.3;
/** The sun near the horizon is golden, almost white once high (between these elevations, in degrees). */
const SUN_WARM_ELEVATION = 5;
const SUN_WHITE_ELEVATION = 35;
const SUN_WARM_COLOR = 0xffa850;
/** How much of the golden colour a high sun keeps: a slightly warm white. */
const SUN_HIGH_TINT = 0.12;
const MOON_COLOR = 0x9db4ff;
const NEUTRAL_COLOR = 0xffffff;
/** A full moon high in a clear sky takes this share of the night veil away, and never more than the cap. */
const MOON_VEIL_LIGHTENING = 0.2;
const MOON_VEIL_LIGHTENING_CAP = 0.3;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** A value brought into a range; a minimum above the maximum is brought down to it: the maximum wins. */
export function boundedTo(value: number, range: Range): number {
    const min = Math.min(range.min, range.max);
    return Math.max(min, Math.min(range.max, value));
}

/**
 * How much the moon lights for its lit fraction, against the full moon (1). Linear: the lit fraction itself.
 * Realistic: the brightness of the moon against its phase angle, Krisciunas & Schaefer, "A model of the brightness of
 * moonlight", PASP 103 (1991), equations (8) and (9) after Allen 1976, m = -12.73 + 0.026 |α| + 4 × 10⁻⁹ α⁴
 * (https://cta-redmine.irap.omp.eu/attachments/download/3619/1991PASP__103_1033K.pdf, read on 2026-11-17): a quarter
 * moon gives a tenth of the full moon, not half (the opposition effect within 7° of the full moon is left out, as in
 * that formula); shifted by its value at the new moon (0.0003) so that a new moon gives nothing. The phase angle comes
 * from the lit fraction (Meeus 48.1: k = (1 + cos α) / 2).
 */
export function moonPhaseLight(illuminated: number, curve: MoonPhaseCurve): number {
    const fraction = clamp01(illuminated);
    if (curve === "linear") return fraction;
    return (brightnessAt((Math.acos(2 * fraction - 1) * 180) / Math.PI) - NEW_MOON) / (1 - NEW_MOON);
}

/** The brightness of the moon at a phase angle (degrees) against the full moon, by that formula. */
const brightnessAt = (alpha: number): number => 10 ** (-0.4 * (0.026 * alpha + 4e-9 * alpha ** 4));
/** What the formula still gives at the new moon (0.03 % of the full moon), taken away so that it gives nothing. */
const NEW_MOON = brightnessAt(180);

/** A colour moved from neutral towards `tint` by `strength` (beyond 1: further, each channel kept within 0 to 255). */
function tinted(tint: number, strength: number): number {
    const channel = (shift: number): number => {
        const from = (NEUTRAL_COLOR >> shift) & 0xff;
        const to = (tint >> shift) & 0xff;
        return Math.max(0, Math.min(255, Math.round(from + (to - from) * strength))) << shift;
    };
    return channel(16) | channel(8) | channel(0);
}

/** The shadow length limits of a body, in map pixels, the maximum never above MAX_SHADOW_TILES. */
function shadowLengthOf(settings: BodyLightSettings): Range {
    const max = Math.min(MAX_SHADOW_TILES, settings.shadowLength.max);
    return {
        min: boundedTo(settings.shadowLength.min, { min: 0, max }) * MAP_LAYER_TILE_SIZE,
        max: max * MAP_LAYER_TILE_SIZE,
    };
}

/**
 * The light of the sky, from where the sun and the moon are (sunPositionAt, moonPositionAt) and how much of the moon is
 * lit (moonPhaseAt), dimmed by `weather` (skyWeatherFactor), within the personal `settings`. One body at a time: the
 * sun as long as it casts shadows, fading out from 6° to 2° of elevation as the shadows of the clouds do
 * (cloudSunlight); the moon then takes over as the night falls, from nothing at a sun of 2° to its full light at the
 * end of civil dusk, and only while it stands 2° above the horizon or more (fully from 6°). At the change both are
 * out: never two sets of shadows at once.
 *
 * The light a body gives (weather, and phase for the moon) is scaled to its maximum and kept within its range; the
 * fading at the horizon and at dusk applies after that, so a body under the horizon gives nothing, whatever its
 * minimum, and a minimum holds for the moon whatever its phase. A body turned off gives nothing, the other goes on.
 * Undefined: no light.
 */
export function skyLightAt(
    sun: SunPosition | undefined,
    moon: SunPosition | undefined,
    moonIlluminated: number,
    weather = 1,
    settings: SkyLightSettings = DEFAULT_SKY_LIGHT_SETTINGS,
): SkyLight | undefined {
    if (!sun) return undefined;
    const sunlight = cloudSunlight(sun.elevation);
    const dimming = clamp01(weather);
    if (sunlight.shadows > 0) {
        if (!settings.sun.enabled) return undefined;
        const { intensity: range, color } = settings.sun;
        const intensity = Math.min(1, sunlight.shadows * boundedTo(dimming * range.max, range));
        if (intensity <= 0) return undefined;
        const warmth = 1 - clamp01((sun.elevation - SUN_WARM_ELEVATION) / (SUN_WHITE_ELEVATION - SUN_WARM_ELEVATION));
        const tint = SUN_HIGH_TINT + (1 - SUN_HIGH_TINT) * warmth;
        return {
            body: "sun",
            azimuth: sun.azimuth,
            elevation: sun.elevation,
            intensity,
            color: tinted(SUN_WARM_COLOR, boundedTo(tint * color.max, color)),
            shadowLength: shadowLengthOf(settings.sun),
        };
    }
    if (!moon || !settings.moon.enabled) return undefined;
    const { intensity: range, color, phaseCurve } = settings.moon;
    const presence = cloudSunlight(moon.elevation).shadows * sunlight.night;
    const shown = moonPhaseLight(moonIlluminated, phaseCurve) * dimming;
    const intensity = Math.min(1, MOON_LIGHT_MAX * presence * boundedTo(shown * range.max, range));
    if (intensity <= 0) return undefined;
    return {
        body: "moon",
        azimuth: moon.azimuth,
        elevation: moon.elevation,
        intensity,
        color: tinted(MOON_COLOR, boundedTo(color.max, color)),
        shadowLength: shadowLengthOf(settings.moon),
    };
}

/** What the weather leaves of the direct light of the sky: a covered sky casts almost no shadow. */
const OVERCAST_DIMMING = 0.85;
const BAD_WEATHER_LIGHT: Partial<Record<WeatherType, number>> = {
    [WeatherType.Rain]: 0.08,
    [WeatherType.Snow]: 0.1,
    [WeatherType.Storm]: 0.05,
    [WeatherType.Fog]: 0.12,
};

/**
 * The share of the direct light of the sky that reaches the ground, for the weather shown (effective, after the
 * automatic and real weathers are resolved) and the cloudiness of a clear sky (0 to 1): all of it under a clear sky,
 * 15 % under an overcast one, almost nothing in the rain, the snow, the storm or the fog.
 */
export function skyWeatherFactor(weather: WeatherType, cloudiness: number): number {
    return BAD_WEATHER_LIGHT[weather] ?? 1 - OVERCAST_DIMMING * clamp01(cloudiness);
}

/**
 * The night veil under the moon: a bright moon high in a clear sky takes a fifth of it away; a crescent, a low moon or
 * a cloudy sky less, a new moon nothing. A moon set brighter takes more, never more than MOON_VEIL_LIGHTENING_CAP:
 * the night stays a night.
 */
export function moonlitNightOpacity(opacity: number, light: SkyLight | undefined): number {
    if (light?.body !== "moon") return opacity;
    const lightening = Math.min(MOON_VEIL_LIGHTENING_CAP, (MOON_VEIL_LIGHTENING * light.intensity) / MOON_LIGHT_MAX);
    return opacity * (1 - Math.max(0, lightening));
}
