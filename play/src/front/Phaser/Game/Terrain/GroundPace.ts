import { heightAt, snowCover, snowPace, soilAt, soilPace, TERRAIN_CELL } from "@workadventure/map-editor";
import type { Season, TerrainData } from "@workadventure/map-editor";

/** What the pace of the ground reads of the water of the relief. */
export interface PaceWater {
    relief(): TerrainData | undefined;
    depthAt(x: number, y: number, now: number): number;
}

/**
 * How fast one walks where one's feet are, as a share of the usual speed: the soil painted there and the water
 * lying on it (sand slows down, a wet clay is mud), and the snow of the heights in the season of the map. The usual
 * speed on a map without relief.
 */
export function groundPace(
    water: PaceWater | undefined,
    feetX: number,
    feetY: number,
    now: number,
    /** The moisture of the soil at a point of the map (0 to 1), when the map has a meadow. */
    moistureAt?: (x: number, y: number) => number,
    /** The season of the map, when the snow of its heights is to slow the walk. */
    season?: Season,
): number {
    const terrain = water?.relief();
    if (!water || !terrain) return 1;
    const cellX = Math.floor(feetX / TERRAIN_CELL);
    const cellY = Math.floor(feetY / TERRAIN_CELL);
    const snow = season ? snowPace(snowCover(heightAt(terrain, cellX, cellY), season)) : 1;
    const soil = terrain.soil ? soilAt(terrain, cellX, cellY) : 0;
    if (soil === 0) return snow;
    return snow * soilPace(soil, water.depthAt(feetX, feetY, now), moistureAt?.(feetX, feetY) ?? 0);
}
