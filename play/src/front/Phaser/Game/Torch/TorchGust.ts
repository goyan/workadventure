import { WeatherType } from "@workadventure/map-editor";
import { torchHash01 } from "./TorchFlicker";

/**
 * The time is cut into slots of 8 s: at most one gust each, starting in its first 3 s. Two gusts are thus at least
 * 5 s apart, and a gust (under 2 s) is over long before the next slot.
 */
export const TORCH_GUST_SLOT_MS = 8000;
const GUST_LATEST_START_MS = 3000;
/** A gust pushes the flame down fast, then the flame comes back slowly. */
const GUST_DROP_MS = 150;
const GUST_RECOVERY_MS = 1700;
/** How steep the coming back is: e^-3 of the drop is left at the end, smoothed to nothing (see torchGust). */
const GUST_RECOVERY_STEEPNESS = 3;
/** How deep a gust goes: 30 % of the light in a breeze, up to 35 % in a storm. */
const GUST_DROP_CALM = 0.3;
const GUST_DROP_STORM = 0.35;
/** The chance of a gust in a slot: none without wind, then from 20 % (a still air) to 90 % (a storm). */
const GUST_CHANCE_MIN = 0.2;
const GUST_CHANCE_MAX = 0.9;
const GUST_SALT_CHANCE = 51;
const GUST_SALT_START = 53;

/** The wind outdoors, from 0 to 1, by the weather of the map (rain and storm blow harder; a fog is still air). */
const WIND_BY_WEATHER: Partial<Record<WeatherType, number>> = {
    [WeatherType.Fog]: 0.1,
    [WeatherType.Rain]: 0.6,
    [WeatherType.Storm]: 1,
};
const WIND_BREEZE = 0.25;

/**
 * How hard the wind blows on a torch, from 0 to 1: none indoors, a breeze outdoors, more with rain, most in a storm.
 * `knownWind` (0 to 1) takes the place of the weather when the real wind of the place is known: the seam for the wind
 * speed of Open-Meteo, not read yet.
 */
export function torchWind(weather: WeatherType | undefined, outdoor: boolean, knownWind?: number): number {
    if (!outdoor) return 0;
    if (knownWind !== undefined && Number.isFinite(knownWind)) return Math.min(1, Math.max(0, knownWind));
    return (weather === undefined ? undefined : WIND_BY_WEATHER[weather]) ?? WIND_BREEZE;
}

/** The gust of a slot for a torch, if there is one: when it starts (server time) and how deep it goes. */
export function torchGustAt(slot: number, seed: number, wind: number): { start: number; drop: number } | undefined {
    if (wind <= 0) return undefined;
    const chance = GUST_CHANCE_MIN + (GUST_CHANCE_MAX - GUST_CHANCE_MIN) * wind;
    if (torchHash01(seed, slot, GUST_SALT_CHANCE) >= chance) return undefined;
    return {
        start: slot * TORCH_GUST_SLOT_MS + Math.floor(torchHash01(seed, slot, GUST_SALT_START) * GUST_LATEST_START_MS),
        drop: GUST_DROP_CALM + (GUST_DROP_STORM - GUST_DROP_CALM) * wind,
    };
}

/**
 * What the wind leaves of the light of a torch at a server time, from 1 - drop to 1: 1 between gusts. A gust is the
 * same on every browser (from the seed of the bearer and the slot). Steady in reduced motion.
 */
export function torchGust(timeMs: number, seed: number, wind: number, reducedMotion: boolean): number {
    if (reducedMotion) return 1;
    const gust = torchGustAt(Math.floor(timeMs / TORCH_GUST_SLOT_MS), seed, wind);
    if (!gust) return 1;
    const since = timeMs - gust.start;
    if (since <= 0 || since >= GUST_DROP_MS + GUST_RECOVERY_MS) return 1;
    if (since < GUST_DROP_MS) return 1 - (gust.drop * since) / GUST_DROP_MS;
    const recovery = (since - GUST_DROP_MS) / GUST_RECOVERY_MS;
    // An exponential coming back, shifted so that it ends exactly at the full light.
    const floor = Math.exp(-GUST_RECOVERY_STEEPNESS);
    const left = (Math.exp(-GUST_RECOVERY_STEEPNESS * recovery) - floor) / (1 - floor);
    return 1 - gust.drop * left;
}
