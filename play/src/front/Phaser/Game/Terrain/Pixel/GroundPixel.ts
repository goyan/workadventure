import { Season } from "@workadventure/map-editor";
import { hash2, valueNoise } from "./PixelNoise";
import type { Material, Ramp, Rgb } from "./PixelPalette";
import { RAMPS, rampsFor, shadeAt } from "./PixelPalette";

/** The dark line on the grass side of a border. */
const GRASS_LINE: Rgb = [0x22, 0x36, 0x1c];
const EMBER: Rgb = [0xff, 0x7a, 0x1a];
const HOT_EMBER: Rgb = [0xff, 0xd2, 0x7a];
/** A reflection of water on the mud. */
const WATER_GLINT: Rgb = [0xb9, 0xca, 0xd6];
/** How much the light of a slope lightens or darkens a point (a share of the ramp). */
const LIGHT_SHARE = 0.45;
/** How fast the light answers the rise of a slope: a gentle bowl is shaded too, a steep slope at the most. */
const LIGHT_RESPONSE = 0.18;
/** A level line is this much darker than the ground around it (about a shade of its ramp). */
const CONTOUR_SHADE = 0.34;
/** Each tile of depth darkens the ground this much, down to DEEPEST_SHADE. */
const SHADE_A_TILE = 0.12;
const DEEPEST_SHADE = 0.5;
const TILE_DEPTH_PX = 32;

/** Irregular stones: the nearest of points shaken on a grid of 10 px; a joint where the second is nearly as near. */
function stones(x: number, y: number): number {
    let nearest = Infinity;
    let second = Infinity;
    let stone = 0;
    const gridX = Math.floor(x / 10);
    const gridY = Math.floor(y / 10);
    for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
            const cellX = gridX + i;
            const cellY = gridY + j;
            const pointX = (cellX + hash2(cellX, cellY)) * 10;
            const pointY = (cellY + hash2(cellY, cellX + 7)) * 10;
            const distance = Math.hypot(x - pointX, (y - pointY) * 1.3);
            if (distance < nearest) {
                second = nearest;
                nearest = distance;
                stone = hash2(cellX * 3, cellY * 5);
            } else if (distance < second) second = distance;
        }
    }
    if (second - nearest < 1.2) return 0.02;
    return 0.4 + (stone - 0.5) * 0.4 + (nearest < 3 ? 0.15 : 0) + (valueNoise(x / 2, y / 2) - 0.5) * 0.2;
}

/** The texture of a material at a point, as a value of its ramp (0 dark to 1 light, about 0.5). */
function texture(material: Material, x: number, y: number): number {
    switch (material) {
        case "grass":
            return (
                0.5 +
                (valueNoise(x / 5, y / 5) - 0.5) * 0.5 +
                (hash2(x, y) > 0.93 ? 0.35 : 0) +
                (hash2(x, y + 1) > 0.93 ? -0.3 : 0)
            );
        case "meadow":
            return 0.5 + (valueNoise(x / 3, y / 3) - 0.5) * 0.6 + (hash2(x, y) > 0.9 ? 0.3 : 0);
        case "earth":
            return 0.5 + (valueNoise(x / 4, y / 4) - 0.5) * 0.9 + (valueNoise(x / 2, y / 2) > 0.75 ? 0.25 : 0);
        case "clay":
            return Math.abs(valueNoise(x / 7, y / 7) - 0.5) < 0.03 ? 0 : 0.6 + (valueNoise(x / 6, y / 6) - 0.5) * 0.3;
        case "sand":
            return (
                0.6 +
                (valueNoise(x / 6, y / 6) - 0.5) * 0.3 +
                (hash2(x, y) > 0.9 ? -0.35 : 0) +
                Math.sin(x * 0.4 + y * 0.9) * 0.06
            );
        case "rock":
            return stones(x, y);
        case "gravel": {
            const pebble = hash2(x >> 1, y >> 1);
            return pebble > 0.6 ? 0.85 - ((x & 1) + (y & 1)) * 0.15 : pebble < 0.2 ? 0.15 : 0.45;
        }
        case "straw":
            return 0.5 + Math.sin(x * 1.3 + valueNoise(x / 4, y / 2) * 6) * 0.25 + (hash2(x, y) > 0.92 ? 0.3 : 0);
        case "ash":
        case "ember":
            return 0.4 + (valueNoise(x / 3, y / 3) - 0.5) * 0.5;
        case "mud":
            return 0.45 + (valueNoise(x / 5, y / 5) - 0.5) * 0.5;
        case "snow":
            return 0.75 + (valueNoise(x / 8, y / 8) - 0.5) * 0.2 + (hash2(x, y) > 0.985 ? 0.3 : 0);
    }
}

/**
 * The textures, worked out once for a square of TEXTURE_PERIOD px and repeated beyond: a texture costs a lookup, not a
 * noise, at each pixel. The square is wider than a block of the relief (256 px), so two blocks never look alike.
 */
const TEXTURE_PERIOD = 512;
/** TEXTURE_PERIOD is a power of 2: `x & TEXTURE_MASK` is x modulo it, negative x included. */
export const TEXTURE_MASK = TEXTURE_PERIOD - 1;
const textures: Partial<Record<Material, Float32Array>> = {};

/**
 * The texture of a material over a square of TEXTURE_PERIOD px (row by row). Each value is worked out the first time
 * it is read (textureValue), never all at once: the first block drawn does not freeze the game.
 */
export function textureTable(material: Material): Float32Array {
    let table = textures[material];
    if (!table) {
        table = new Float32Array(TEXTURE_PERIOD * TEXTURE_PERIOD).fill(Number.NaN);
        textures[material] = table;
    }
    return table;
}

/** The texture of a material at a point of the map (whole pixels), from its table (`index`: textureIndex(x, y)). */
export function textureValue(material: Material, table: Float32Array, index: number, x: number, y: number): number {
    let value = table[index];
    if (value !== value) {
        value = texture(material, x & TEXTURE_MASK, y & TEXTURE_MASK);
        table[index] = value;
    }
    return value;
}

/** Where a point of the map (whole pixels) falls in a texture table. */
export function textureIndex(x: number, y: number): number {
    return (y & TEXTURE_MASK) * TEXTURE_PERIOD + (x & TEXTURE_MASK);
}

/** How much darker the ground is at a depth (height < 0), as a share of its ramp. */
export function depthShade(height: number): number {
    return Math.min(DEEPEST_SHADE, SHADE_A_TILE * Math.floor(Math.max(0, -height) / TILE_DEPTH_PX));
}

/** The value of the ramp a lit, deep point takes: its texture, its light, its depth (see groundColor). */
export function groundValue(textureValue: number, light: number, height: number): number {
    return textureValue + light * LIGHT_SHARE - depthShade(height);
}

/**
 * The colour of a point of the ground (map pixels) in pixel art: the texture of its material, lit by its slope
 * (`light`, see slopeLight), darker deeper down (`height` < 0), a shade of the ramp of the material picked by the
 * dither; the line of a border (see outlineOf) instead where it carries one.
 */
export function groundColor(
    material: Material,
    x: number,
    y: number,
    light: number,
    height: number,
    outline?: "dark" | "light",
    /** On a level line (see contourOf): a shade darker on its low side (−1), lighter on its high side (1). */
    contour = 0,
    /** The season of the ground: its shades and what is sown on the grass. */
    season?: Season,
    /** Dense grass of the meadow: the flowers grow there. */
    dense = false,
): Rgb {
    const ramp = seasonPatch(material, season, x, y) ?? rampsFor(season)[material];
    if (outline === "dark") return material === "grass" ? GRASS_LINE : ramp[0];
    if (outline === "light") return RAMPS.snow[3];
    const sown = sprinkleAt(material, season, dense, x, y);
    if (sown) return sown;
    if (material === "mud" && hash2(x, y) > 0.96 && valueNoise(x / 4, y / 4) > 0.5) return WATER_GLINT;
    if (material === "ember") {
        const glow = hash2(x, y);
        if (glow > 0.98) return HOT_EMBER;
        if (glow > 0.94) return EMBER;
    }
    const value =
        groundValue(textureValue(material, textureTable(material), textureIndex(x, y), x, y), light, height) -
        contourShade(contour);
    return shadeAt(ramp, value, x, y);
}

const FLOWERS: readonly [number, Rgb][] = [
    [0.995, [0xf1, 0x9a, 0xc0]],
    [0.992, [0xf6, 0xd8, 0x4a]],
    [0.988, [0xff, 0xff, 0xff]],
];
/** Flowers are rarer in summer: their thresholds this much higher. */
const SUMMER_RARER = 0.006;
const LEAVES: readonly [number, Rgb][] = [
    [0.994, [0xe8, 0xa3, 0x3a]],
    [0.99, [0xb8, 0x40, 0x2a]],
    [0.982, [0xd9, 0x66, 0x2a]],
];

/**
 * What the season sows on the grass at a pixel: flowers in dense grass in spring (fewer in summer), fallen leaves in
 * autumn, nothing in winter; undefined where nothing is.
 */
export function sprinkleAt(
    material: Material,
    season: Season | undefined,
    dense: boolean,
    x: number,
    y: number,
): Rgb | undefined {
    if (material !== "grass" || season === undefined) return undefined;
    if (season === Season.Autumn) {
        const draw = hash2(x * 5 + 3, y * 11 + 7);
        for (const [threshold, color] of LEAVES) if (draw > threshold) return color;
        return undefined;
    }
    if (!dense || season === Season.Winter) return undefined;
    const rarer = season === Season.Summer ? SUMMER_RARER : 0;
    const draw = hash2(x * 3 + 1, y * 7 + 2);
    for (const [threshold, color] of FLOWERS) if (draw > threshold + rarer) return color;
    return undefined;
}

/**
 * The ramp a season puts on a material in patches, undefined elsewhere: the grass yellowed by the summer, the grass
 * piercing the snow of the winter here and there.
 */
export function seasonPatch(material: Material, season: Season | undefined, x: number, y: number): Ramp | undefined {
    if (season === Season.Summer && material === "grass" && valueNoise(x / 9 + 3, y / 9) > 0.66) {
        return rampsFor(Season.Summer).straw;
    }
    if (season === Season.Winter && material === "snow" && valueNoise(x / 2.5, y / 2.5) > 0.86 && hash2(x, y) > 0.4) {
        return rampsFor(Season.Winter).grass;
    }
    return undefined;
}

/**
 * How a slope takes the light at a point, from -1 (in its shade) to 1 (lit): the light comes from the north-west, so a
 * ground that rises towards the south-east faces it.
 */
export function slopeLight(height: (x: number, y: number) => number, x: number, y: number): number {
    return lightOfRise(height(x + 1, y) - height(x - 1, y) + height(x, y + 1) - height(x, y - 1));
}

/** slopeLight from the rise already summed: east minus west plus south minus north, 1 px apart. */
export function lightOfRise(rise: number): number {
    if (rise === 0) return 0;
    return Math.sign(rise) * Math.min(1, Math.sqrt(Math.abs(rise) * LIGHT_RESPONSE));
}

/** How much darker a point of a level line is (see contourOf), as a share of its ramp: lighter on its high side. */
export function contourShade(contour: number): number {
    return contour < 0 ? CONTOUR_SHADE : contour > 0 ? -CONTOUR_SHADE : 0;
}

/**
 * The level line a point of the relief carries, drawn in relief as the terraces of pixel art: one each tile of depth or
 * height (TILE_DEPTH_PX). A point next to a neighbour a tile higher is its dark side (−1); next to one a tile lower, its
 * light side (1); the dark wins where both meet, so the line stays unbroken; 0 elsewhere. The lines say the shape, the
 * depth and the height of a hollow or a mount at a glance, even a gentle one, under the snow and at night.
 */
export function contourOf(height: number, west: number, east: number, north: number, south: number): -1 | 0 | 1 {
    // Tiles below (negative) or above (positive) the ground level.
    const levelOf = (value: number): number =>
        value < 0 ? -Math.floor(-value / TILE_DEPTH_PX) : Math.floor(value / TILE_DEPTH_PX);
    const level = levelOf(height);
    let lower = false;
    for (const neighbour of [west, east, north, south]) {
        const other = levelOf(neighbour);
        if (other > level) return -1;
        if (other < level) lower = true;
    }
    return lower ? 1 : 0;
}

/** The shadow of a mount: cast along a ray rising this steeply (px of height a px of the map) from the north-west. */
export const SHADOW_SLOPE = 1.6;
/**
 * The farthest the ray of a shadow is followed from the edge of a block (px of the map, along each axis): as far as the
 * shadow of the highest mount (256 px) reaches, 113 px; the window of a block reads this far west (SHADOW_CELLS).
 */
export const SHADOW_REACH_PX = 128;
/** How much darker a point in the shadow is, as a share of its ramp. */
export const SHADOW_SHADE = 0.3;
/** How much the ray of a shadow rises for a pixel of the map along the diagonal (√2 px away). */
export const SHADOW_RISE_A_STEP = SHADOW_SLOPE * Math.SQRT2;

/**
 * The horizon of a point towards the north-west: the highest the ground there rises over a ray of slope SHADOW_SLOPE
 * from it, `heightAt(x − d, y − d) − SHADOW_RISE_A_STEP × d` for d from 1 to SHADOW_REACH_PX; the point is in the
 * shadow where its horizon is higher than its ground. A point's horizon is also its south-east neighbour's, one step
 * lower: a block works the horizons out along the diagonals and calls this on their first points only (the first
 * row, the first column).
 */
export function shadowHorizon(heightAt: (x: number, y: number) => number, x: number, y: number): number {
    let horizon = Number.NEGATIVE_INFINITY;
    for (let d = 1; d <= SHADOW_REACH_PX; d++) {
        const over = heightAt(x - d, y - d) - SHADOW_RISE_A_STEP * d;
        if (over > horizon) horizon = over;
    }
    return horizon;
}

/** The light of a point (see slopeLight) in the shadow: SHADOW_SHADE darker once it is shared into its value. */
export function shadowedLight(light: number): number {
    return light - SHADOW_SHADE / LIGHT_SHARE;
}
