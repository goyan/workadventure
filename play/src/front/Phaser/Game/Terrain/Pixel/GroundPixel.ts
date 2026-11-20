import { hash2, valueNoise } from "./PixelNoise";
import type { Material, Rgb } from "./PixelPalette";
import { RAMPS, shadeAt } from "./PixelPalette";

/** The dark line on the grass side of a border. */
const GRASS_LINE: Rgb = [0x22, 0x36, 0x1c];
const EMBER: Rgb = [0xff, 0x7a, 0x1a];
const HOT_EMBER: Rgb = [0xff, 0xd2, 0x7a];
/** How much the light of a slope lightens or darkens a point (a share of the ramp). */
const LIGHT_SHARE = 0.3;
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

/** The texture of a material over a square of TEXTURE_PERIOD px (row by row), worked out at its first use. */
export function textureTable(material: Material): Float32Array {
    let table = textures[material];
    if (!table) {
        table = new Float32Array(TEXTURE_PERIOD * TEXTURE_PERIOD);
        for (let row = 0; row < TEXTURE_PERIOD; row++) {
            for (let column = 0; column < TEXTURE_PERIOD; column++) {
                table[row * TEXTURE_PERIOD + column] = texture(material, column, row);
            }
        }
        textures[material] = table;
    }
    return table;
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
): Rgb {
    const ramp = RAMPS[material];
    if (outline === "dark") return material === "grass" ? GRASS_LINE : ramp[0];
    if (outline === "light") return RAMPS.snow[3];
    if (material === "ember") {
        const glow = hash2(x, y);
        if (glow > 0.98) return HOT_EMBER;
        if (glow > 0.94) return EMBER;
    }
    return shadeAt(ramp, groundValue(textureTable(material)[textureIndex(x, y)], light, height), x, y);
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
    return Math.max(-1, Math.min(1, rise * 0.07));
}
