import { WeatherType } from "@workadventure/map-editor";
import { mixColor } from "../Lamps/LampStyle";
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
}

/** A full moon high in a clear sky lights this much against a high sun: its shadows are faint. */
export const MOON_LIGHT_MAX = 0.3;
/** The sun near the horizon is golden, white once high (between these elevations, in degrees). */
const SUN_WARM_ELEVATION = 5;
const SUN_WHITE_ELEVATION = 35;
const SUN_WARM_COLOR = 0xffa850;
const SUN_WHITE_COLOR = 0xfff6e6;
const MOON_COLOR = 0x9db4ff;
/** A full moon high in a clear sky takes at most this share of the night veil away: the night stays a night. */
const MOON_VEIL_LIGHTENING = 0.2;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * The light of the sky, from where the sun and the moon are (sunPositionAt, moonPositionAt) and how much of the moon is
 * lit (moonPhaseAt), dimmed by `weather` (skyWeatherFactor). One body at a time: the sun as long as it casts shadows,
 * fading out from 6° to 2° of elevation as the shadows of the clouds do (cloudSunlight); the moon then takes over as
 * the night falls, from nothing at a sun of 2° to its full light at the end of civil dusk, and only while it stands
 * 2° above the horizon or more (fully from 6°). At the change both are out: never two sets of shadows at once.
 * Undefined: no light (a night without a moon, or a new moon).
 */
export function skyLightAt(
    sun: SunPosition | undefined,
    moon: SunPosition | undefined,
    moonIlluminated: number,
    weather = 1,
): SkyLight | undefined {
    if (!sun) return undefined;
    const sunlight = cloudSunlight(sun.elevation);
    const dimming = clamp01(weather);
    if (sunlight.shadows > 0) {
        const warmth = 1 - clamp01((sun.elevation - SUN_WARM_ELEVATION) / (SUN_WHITE_ELEVATION - SUN_WARM_ELEVATION));
        return {
            body: "sun",
            azimuth: sun.azimuth,
            elevation: sun.elevation,
            intensity: sunlight.shadows * dimming,
            color: mixColor(SUN_WHITE_COLOR, SUN_WARM_COLOR, warmth),
        };
    }
    if (!moon) return undefined;
    const intensity =
        MOON_LIGHT_MAX * clamp01(moonIlluminated) * cloudSunlight(moon.elevation).shadows * sunlight.night * dimming;
    if (intensity <= 0) return undefined;
    return { body: "moon", azimuth: moon.azimuth, elevation: moon.elevation, intensity, color: MOON_COLOR };
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
 * The night veil under the moon: a bright moon high in a clear sky takes up to a fifth of it away; a crescent, a low
 * moon or a cloudy sky less, a new moon nothing.
 */
export function moonlitNightOpacity(opacity: number, light: SkyLight | undefined): number {
    if (light?.body !== "moon") return opacity;
    return opacity * (1 - MOON_VEIL_LIGHTENING * clamp01(light.intensity / MOON_LIGHT_MAX));
}
