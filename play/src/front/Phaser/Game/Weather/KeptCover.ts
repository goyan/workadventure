import {
    ICE_BEARS_MM,
    ICE_GROWTH_TIMES,
    ICE_SHACK_MM,
    iceCurrentShare,
    iceGrowthMmPerDay,
    iceThawMmPerHour,
    snowMeltMmPerHour,
    snowSublimationMmPerHour,
} from "@workadventure/map-editor";
import type { SnowWeather } from "@workadventure/map-editor";

/**
 * Where the ice and the snow the server keeps are going: how fast they thicken or go, and when they will be gone,
 * bear a walker or give way. Nothing is computed by a rule of its own: each rate is what the rules of the server give
 * (Terrain/Ice.ts, Terrain/Snow.ts) for the air of the room, put together as the meadow of the server steps them
 * (Meadow.stepIce, Meadow.stepSnow). Pure. Rates and times are in the real clock: the clock of the map (the speed of
 * its water, waterTimesOf) is already counted in.
 */

/** Nothing there and nothing coming; going; thickening; staying as it is; the air of the room is not known. */
export type CoverTrend = "none" | "thawing" | "growing" | "holding" | "unknown";

const HOUR_S = 3600;

function clock(times: number | undefined): number {
    return times !== undefined && Number.isFinite(times) && times > 0 ? times : 1;
}

/**
 * How fast an ice `mm` thick changes, in mm an hour of the real clock (negative: it thaws), as Meadow.stepIce: its
 * growth in the frost, less on running water (`currentMs`, m/s; still when not known), then its thaw.
 */
export function iceRateMmPerHour(
    mm: number,
    weather: SnowWeather,
    snowMm: number,
    currentMs: number | undefined,
    times: number | undefined,
): number {
    const growth = (iceGrowthMmPerDay(mm, weather, snowMm) * ICE_GROWTH_TIMES) / 24;
    const share = growth > 0 && currentMs !== undefined ? iceCurrentShare(currentMs) : 1;
    return (growth * share - iceThawMmPerHour(weather)) * clock(times);
}

/**
 * The seconds an ice takes from `fromMm` to `toMm` under this air, found by stepping the rate of the server (it
 * slows as the ice thickens). Undefined when it never gets there: the wrong way, or more ice than the water under
 * it holds (`capMm`).
 */
export function iceTimeTo(
    fromMm: number,
    toMm: number,
    rateAt: (mm: number) => number,
    capMm = Number.POSITIVE_INFINITY,
): number | undefined {
    if (toMm === fromMm) return 0;
    const up = toMm > fromMm;
    if (up && toMm > capMm) return undefined;
    const steps = 400;
    const stride = (toMm - fromMm) / steps;
    let hours = 0;
    for (let step = 0; step < steps; step++) {
        // The rate in the middle of the stride: the growth slows as the ice thickens.
        const rate = rateAt(fromMm + stride * (step + 0.5));
        if (up ? rate <= 0 : rate >= 0) return undefined;
        hours += stride / rate;
    }
    return hours * HOUR_S;
}

export interface KeptIce {
    /** The thickness of the ice, in mm. */
    mm: number;
    trend: CoverTrend;
    /** How fast it changes, in mm an hour of the real clock (positive either way; 0 when it holds). */
    mmPerHour: number;
    /** Thawing: the seconds before none is left. */
    goneIn?: number;
    /** Thawing, over the thickness that bears a walker: the seconds before it no longer does. */
    givesWayIn?: number;
    /** Growing, under the thickness that bears a walker: the seconds before it does; absent when it never will. */
    bearsIn?: number;
    /** Whether it bears a walker over deep water (ICE_BEARS_MM), and an ice fishing shack (ICE_SHACK_MM). */
    bears: boolean;
    shack: boolean;
    /** The share of the growth the current leaves, 1 (still water) to 0 (too fast to freeze over). */
    currentShare: number;
    temperature?: number;
}

export interface KeptIceInput {
    mm: number;
    /** The air of the room and the wind of its conditions; undefined while not known. */
    weather: SnowWeather | undefined;
    /** The snow lying on the ice, in mm of water: it slows its growth. */
    snowMm?: number;
    /** How fast the water runs under it, in m/s; still when not known. */
    currentMs?: number;
    /** How many times faster than reality the map goes (waterTimesOf). */
    times?: number;
    /** The most ice the water under it holds, in mm: the ice is never thicker than its water. */
    capMm?: number;
}

/** Where an ice of the server is going under the air of the room. */
export function explainKeptIce(input: KeptIceInput): KeptIce {
    const mm = Number.isFinite(input.mm) ? Math.max(0, input.mm) : 0;
    const snowMm = input.snowMm ?? 0;
    const currentShare = input.currentMs !== undefined ? iceCurrentShare(input.currentMs) : 1;
    const base = { mm, bears: mm >= ICE_BEARS_MM, shack: mm >= ICE_SHACK_MM, currentShare };
    const weather = input.weather;
    if (!weather) return { ...base, trend: "unknown", mmPerHour: 0 };
    const rateAt = (thick: number): number => iceRateMmPerHour(thick, weather, snowMm, input.currentMs, input.times);
    const rate = rateAt(mm);
    const known = { ...base, temperature: weather.temperature };
    if (rate < 0) {
        if (mm <= 0) return { ...known, trend: "none", mmPerHour: 0 };
        return {
            ...known,
            trend: "thawing",
            mmPerHour: -rate,
            goneIn: iceTimeTo(mm, 0, rateAt),
            givesWayIn: mm > ICE_BEARS_MM ? iceTimeTo(mm, ICE_BEARS_MM, rateAt) : undefined,
        };
    }
    const cap = input.capMm ?? Number.POSITIVE_INFINITY;
    if (rate > 0 && mm < cap) {
        return {
            ...known,
            trend: "growing",
            mmPerHour: rate,
            bearsIn: mm < ICE_BEARS_MM ? iceTimeTo(mm, ICE_BEARS_MM, rateAt, cap) : undefined,
        };
    }
    return { ...known, trend: mm > 0 ? "holding" : "none", mmPerHour: 0 };
}

export interface KeptSnow {
    /** The snow lying, in mm of water. */
    mm: number;
    trend: CoverTrend;
    /** How fast it goes, in mm of water an hour of the real clock: its melt and what the dry wind takes. */
    mmPerHour: number;
    /** The part of it that melts into water (the rest is taken by the wind). */
    meltMmPerHour: number;
    /** Going: the seconds before none is left. */
    goneIn?: number;
    temperature?: number;
}

/**
 * Where a snow of the server is going under the air of the room, as Meadow.stepSnow: it melts over zero and a dry
 * wind takes some at any temperature. `building`: a snow falls on it now.
 */
export function explainKeptSnow(input: {
    mm: number;
    weather: SnowWeather | undefined;
    times?: number;
    building?: boolean;
}): KeptSnow {
    const mm = Number.isFinite(input.mm) ? Math.max(0, input.mm) : 0;
    const weather = input.weather;
    if (input.building)
        return { mm, trend: "growing", mmPerHour: 0, meltMmPerHour: 0, temperature: weather?.temperature };
    if (mm <= 0) return { mm, trend: "none", mmPerHour: 0, meltMmPerHour: 0, temperature: weather?.temperature };
    if (!weather) return { mm, trend: "unknown", mmPerHour: 0, meltMmPerHour: 0 };
    const melt = snowMeltMmPerHour(weather) * clock(input.times);
    const going = melt + snowSublimationMmPerHour(weather) * clock(input.times);
    const known = { mm, meltMmPerHour: melt, temperature: weather.temperature };
    if (going <= 0) return { ...known, trend: "holding", mmPerHour: 0 };
    return { ...known, trend: "thawing", mmPerHour: going, goneIn: (mm / going) * HOUR_S };
}
