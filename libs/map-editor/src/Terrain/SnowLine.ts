import { Season } from "../types";

/**
 * The altitude the snow holds from, in pixels over the ground of the map, season by season: low in winter, only on
 * the highest tops in summer (the relief goes up to 256).
 */
export const SNOW_LINES: Record<Season, number> = {
    [Season.Winter]: 96,
    [Season.Spring]: 160,
    [Season.Autumn]: 160,
    [Season.Summer]: 224,
};
/** The snow is thin at its line and covers the ground this many pixels of altitude over it. */
export const SNOW_FULL_PX = 32;
/** One walks this much slower in a full cover of snow. */
export const SNOW_PACE = 0.85;

/** How much snow covers a ground at that altitude in that season: from 0 (none, under the line) to 1. */
export function snowCover(heightPx: number, season: Season): number {
    if (!Number.isFinite(heightPx)) return 0;
    return Math.min(1, Math.max(0, (heightPx - SNOW_LINES[season]) / SNOW_FULL_PX));
}

/** How fast one walks in that much snow, as a share of the usual speed. */
export function snowPace(cover: number): number {
    return 1 - (1 - SNOW_PACE) * Math.min(1, Math.max(0, cover));
}
