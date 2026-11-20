import { Season } from "@workadventure/map-editor";
import { valueNoise } from "./PixelNoise";
import type { Rgb } from "./PixelPalette";
import { bayer, rampsFor, shadeAt } from "./PixelPalette";

/** Thinner than this (px), the water is the pale foam of the shore. */
export const SHORE_PX = 3;
/** In winter, thinner than this (px), the water is frozen at the shore. */
export const ICE_PX = 6;
const SHORE_FOAM: Rgb = [0xd6, 0xec, 0xf6];
const SHORE_ICE: Rgb = [0xe3, 0xf0, 0xf7];
/** The water is as dark as its ramp allows from this depth on (px). */
const DARKEST_DEPTH = 40;
/** While the relief is edited, the pixels of the dither under this threshold show the bottom. */
const SEE_THROUGH_SHARE = 0.45;

/**
 * The colour of a point of water (map pixels) in pixel art: a shade of the water of the season, darker deeper down,
 * a slow ripple of noise; the pale foam of the shore where it is thin, frozen in winter. While the relief is edited
 * (`seeThrough`), one pixel in two of the dither shows the ground under it (`ground`), so what is dug there shows.
 */
export function waterColor(
    depth: number,
    x: number,
    y: number,
    season: Season | undefined,
    ground: Rgb | undefined,
    seeThrough: boolean,
): Rgb {
    if (seeThrough && ground && bayer(x, y) < SEE_THROUGH_SHARE) return ground;
    if (season === Season.Winter && depth < ICE_PX) return SHORE_ICE;
    if (depth < SHORE_PX) return SHORE_FOAM;
    const ripple = (valueNoise(x / 10, y / 5) - 0.5) * 0.1;
    return shadeAt(rampsFor(season).water, 0.85 - Math.min(1, depth / DARKEST_DEPTH) * 0.8 + ripple, x, y);
}
