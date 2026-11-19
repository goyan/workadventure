import { soilAt, soilPace, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** What the pace of the ground reads of the water of the relief. */
export interface PaceWater {
    relief(): TerrainData | undefined;
    depthAt(x: number, y: number, now: number): number;
}

/**
 * How fast one walks where one's feet are, as a share of the usual speed: the soil painted there and the water
 * lying on it (sand slows down, a wet clay is mud). The usual speed on a map without water of the relief.
 */
export function groundPace(
    water: PaceWater | undefined,
    feetX: number,
    feetY: number,
    now: number,
    /** The moisture of the soil at a point of the map (0 to 1), when the map has a meadow. */
    moistureAt?: (x: number, y: number) => number,
): number {
    const terrain = water?.relief();
    if (!water || !terrain?.soil) return 1;
    const soil = soilAt(terrain, Math.floor(feetX / TERRAIN_CELL), Math.floor(feetY / TERRAIN_CELL));
    return soil === 0 ? 1 : soilPace(soil, water.depthAt(feetX, feetY, now), moistureAt?.(feetX, feetY) ?? 0);
}
