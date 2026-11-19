import { heightAt } from "@workadventure/map-editor";
import type { SoilName, TerrainData } from "@workadventure/map-editor";

/**
 * How a cell of the relief faces the light, which comes from the north-west like the light on the clouds: from -1 (a
 * slope going down towards the south-east, its back to the light) to 1 (a slope coming back up, facing it), 0 on
 * level ground. This is what makes a hollow readable on a map seen from above.
 */
export function slopeShade(terrain: TerrainData | undefined, cellX: number, cellY: number): number {
    if (!terrain) return 0;
    const east = heightAt(terrain, cellX + 1, cellY) - heightAt(terrain, cellX - 1, cellY);
    const south = heightAt(terrain, cellX, cellY + 1) - heightAt(terrain, cellX, cellY - 1);
    const shade = Math.max(-1, Math.min(1, (east + south) / 64));
    return shade === 0 ? 0 : shade;
}

/**
 * How dark the bottom of a hollow is drawn (a black veil), by its height: nothing at the rim (no step around a
 * hollow), quickly readable for a shallow one, all of it from three tiles down.
 */
export function groundAlpha(height: number): number {
    return height >= 0 ? 0 : 0.5 * Math.min(1, -height / 96) ** 0.7;
}

/**
 * How light the top of a mount is drawn (a white veil), by its height over the ground: nothing at its foot, all of it
 * from three tiles up. Lighter than a hollow is dark: the slopes say most of a mount.
 */
export function raisedAlpha(height: number): number {
    return height <= 0 ? 0 : 0.3 * Math.min(1, height / 96) ** 0.7;
}

/**
 * The snow of the heights (see SnowLine.ts of the map editor library): a white veil over the ground and its grass,
 * under the shades of the slopes so that a snowy top keeps its shape. All of it under a full cover.
 */
export const SNOW_COLOR = 0xf3f7ff;
export function snowAlpha(cover: number): number {
    return 0.85 * Math.min(1, Math.max(0, cover));
}

/** How strongly a slope is lit (a white veil) or shaded (a black one), by how much it faces the light. */
export function slopeAlpha(shade: number): number {
    return 0.25 * Math.min(1, Math.abs(shade));
}

/** The water is drawn light blue wherever there is some, with a pale line where it is thinner than this (the shore). */
export const SHORE_PX = 3;
export const SHALLOW_WATER = { color: 0x7fb6d9, alpha: 0.45 };
export const SHORE_WATER = { color: 0xd5e6f5, alpha: 0.5 };
/** A dark blue laid over it, fuller as the water gets deeper: all of it from this depth on. */
export const DEEP_WATER_PX = 64;
export const DEEP_WATER_COLOR = 0x2f5f8f;

export function deepWaterAlpha(depthPx: number): number {
    return depthPx <= 0 ? 0 : 0.8 * Math.min(1, depthPx / DEEP_WATER_PX);
}

/**
 * How a painted soil is drawn: a veil of its colour over the ground of the map, under the shades of the relief and
 * under the water. Rock and gravel cover the ground most, earth and meadow let it show. No soil is green: a
 * fertile soil is not a meadow until grass grows on it.
 */
export const SOIL_TINTS: Record<SoilName, { color: number; alpha: number }> = {
    earth: { color: 0x7a5a3a, alpha: 0.45 },
    // A rich, dark loam, not a green: the green of a map is its grass, which grows, dries and burns.
    meadow: { color: 0x54401f, alpha: 0.5 },
    clay: { color: 0xc58a55, alpha: 0.55 },
    sand: { color: 0xe6d29a, alpha: 0.6 },
    rock: { color: 0x7d8189, alpha: 0.7 },
    gravel: { color: 0xb9bcc2, alpha: 0.6 },
};
