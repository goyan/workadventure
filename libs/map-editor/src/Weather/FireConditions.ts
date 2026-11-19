/** What the fire of a room goes by: the heat, the humidity of the air and the wind, real or set by hand. */
export interface FireConditions {
    /** Degrees Celsius. */
    temperature: number;
    /** Relative humidity of the air, in %. */
    humidity: number;
    /** Km/h. */
    windSpeed: number;
    /** Where the wind comes from, in degrees (0: north, 90: east). */
    windFrom: number;
}

/** From where the conditions light a fire: hotter than, drier than, windier than. */
export interface FireThresholds {
    temperature: number;
    humidity: number;
    windSpeed: number;
}

/** A mild day: no fire starts by itself. */
export const NEUTRAL_FIRE_CONDITIONS: FireConditions = { temperature: 20, humidity: 60, windSpeed: 10, windFrom: 315 };
/** The 30-30-30 rule of wildfires: over 30 degrees, under 30 % of humidity, over 30 km/h of wind. */
export const DEFAULT_FIRE_THRESHOLDS: FireThresholds = { temperature: 30, humidity: 30, windSpeed: 30 };

export const FIRE_CONDITION_BOUNDS = {
    temperature: [-10, 50],
    humidity: [0, 100],
    windSpeed: [0, 120],
} as const;
export const FIRE_THRESHOLD_BOUNDS = {
    temperature: [0, 50],
    humidity: [5, 100],
    windSpeed: [5, 120],
} as const;

/** The heat counts from this many degrees under its threshold, the dryness from this many points over its own. */
const HEAT_RANGE = 15;
const HUMIDITY_RANGE = 30;

function within(value: number | undefined, [min, max]: readonly [number, number], fallback: number): number {
    return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

const unit = (value: number): number => Math.min(1, Math.max(0, value));

/** Keeps each value within its bounds; one that is not a number stays as `fallback` has it. The wind turns round. */
export function boundedFireConditions(sent: Partial<FireConditions>, fallback: FireConditions): FireConditions {
    const from = sent.windFrom;
    return {
        temperature: within(sent.temperature, FIRE_CONDITION_BOUNDS.temperature, fallback.temperature),
        humidity: within(sent.humidity, FIRE_CONDITION_BOUNDS.humidity, fallback.humidity),
        windSpeed: within(sent.windSpeed, FIRE_CONDITION_BOUNDS.windSpeed, fallback.windSpeed),
        windFrom: from !== undefined && Number.isFinite(from) ? ((from % 360) + 360) % 360 : fallback.windFrom,
    };
}

export function boundedFireThresholds(sent: Partial<FireThresholds>, fallback: FireThresholds): FireThresholds {
    return {
        temperature: within(sent.temperature, FIRE_THRESHOLD_BOUNDS.temperature, fallback.temperature),
        humidity: within(sent.humidity, FIRE_THRESHOLD_BOUNDS.humidity, fallback.humidity),
        windSpeed: within(sent.windSpeed, FIRE_THRESHOLD_BOUNDS.windSpeed, fallback.windSpeed),
    };
}

/**
 * How ready the grass is to burn under these conditions, from 0 to 1: nothing when it is cold or damp, 1 once it is
 * as hot, as dry and as windy as the thresholds say. The heat and the dryness of the air both have to be there (the
 * weaker of the two counts); the wind doubles what they make.
 */
export function fireDanger(conditions: FireConditions, thresholds: FireThresholds): number {
    const heat = unit((conditions.temperature - (thresholds.temperature - HEAT_RANGE)) / HEAT_RANGE);
    const dryness = unit((thresholds.humidity + HUMIDITY_RANGE - conditions.humidity) / HUMIDITY_RANGE);
    const wind = thresholds.windSpeed > 0 ? unit(conditions.windSpeed / thresholds.windSpeed) : 1;
    return Math.min(heat, dryness) * (0.5 + 0.5 * wind);
}

/** The danger as one reads it: 0 low, 1 moderate, 2 high, 3 extreme. */
export function fireDangerLevel(danger: number): 0 | 1 | 2 | 3 {
    if (danger >= 1) return 3;
    if (danger >= 0.5) return 2;
    return danger >= 0.25 ? 1 : 0;
}
