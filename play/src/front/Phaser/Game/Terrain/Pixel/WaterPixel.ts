import { Season } from "@workadventure/map-editor";
import { SWIM_DEPTH_PX } from "../../Water/WaterZones";
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
 * a slow ripple of noise, the clearest shade where one wades (under SWIM_DEPTH_PX); a line of foam 1 px wide at its edge, of ice in winter. While the relief is edited
 * (`seeThrough`), one pixel in two of the dither shows the ground under it (`ground`), so what is dug there shows.
 */
export function waterColor(
    depth: number,
    x: number,
    y: number,
    season: Season | undefined,
    ground: Rgb | undefined,
    seeThrough: boolean,
    /** At the edge of the water (a neighbour is dry): the line of foam, of ice in winter. */
    edge = false,
): Rgb {
    if (seeThrough && ground && bayer(x, y) < SEE_THROUGH_SHARE) return ground;
    if (edge) return season === Season.Winter ? SHORE_ICE : SHORE_FOAM;
    // The water one wades in: the clearest shade. From where one swims, the three darker ones, darker deeper down
    // (never the clearest: where one starts swimming shows).
    if (depth < SWIM_DEPTH_PX) return rampsFor(season).water[3];
    const ripple = (valueNoise(x / 10, y / 5) - 0.5) * 0.1;
    const deep = Math.min(1, (depth - SWIM_DEPTH_PX) / (DARKEST_DEPTH - SWIM_DEPTH_PX));
    return shadeAt(rampsFor(season).water, 0.55 - deep * 0.5 + ripple, x, y);
}
