import {
    heightAt,
    MUD_MOISTURE,
    MUD_WATER_PX,
    snowCover,
    SOILS,
    soilAt,
    TERRAIN_CELL,
    TILE_PX,
} from "@workadventure/map-editor";
import type { Season } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type { MeadowState } from "../MeadowState";
import { mottledCover, strawLevel } from "../MeadowState";
import type { Cover } from "./MaterialBorder";
import { hash2 } from "./PixelNoise";

// The border between two materials lives in a file the worker can load (Pixel/MaterialBorder).
export { outlineOf, pickMaterial } from "./MaterialBorder";
export type { Cover } from "./MaterialBorder";

/** What the material of a cell is read from. */
export interface CellInputs {
    /** The relief and the soils painted; none on a map without relief. */
    terrain: TerrainData | undefined;
    meadow?: MeadowState;
    /** How much the snow that fell whitens the ground at a point of the map (map pixels), 0 to 1. Absent: none. */
    snowCoverAt?: (x: number, y: number) => number;
    /** Whether a cell is outdoors (not in a room). Absent: every cell is, and bare ground is grass (the 3/4 relief only). */
    outdoor?: (cellX: number, cellY: number) => boolean;
    /** Whether a cell is under a floor of the Carte tool: left to it. */
    paved?: (cellX: number, cellY: number) => boolean;
    /** Whether a cell is on a grass tile of the map. */
    mapGrass?: (cellX: number, cellY: number) => boolean;
    /** The moisture of the soil (0 to 1) and the water lying on it (px), at a point of the map. */
    moistureAt?: (x: number, y: number) => number;
    waterDepthAt?: (x: number, y: number) => number;
    /** The season of the calendar the snow line of the heights is read in (SnowLine.ts); none: no snow of the heights. */
    snowLineSeason?: Season;
}

/** From this much snow on the ground, the ground is snow. */
const SNOW_FROM = 0.5;
/** From this much straw (strawLevel, 0 to 255), the grass is straw. */
const STRAW_FROM = 128;
/** From this much grass (mottledCover, 0 to 255), the ground is grass. */
const GRASS_FROM = 64;
const CELLS_A_TILE = TILE_PX / TERRAIN_CELL;

/**
 * What covers a cell: snow when it lies, then what the meadow says (embers, ash, straw, grass), then the soil painted
 * there; grass where nothing is painted nor grows (the ground of the map).
 */
export function cellMaterial(inputs: CellInputs, cellX: number, cellY: number): Cover {
    const terrain = inputs.terrain;
    const dug = heightAt(terrain, cellX, cellY) !== 0;
    // Rooms and the floors of the Carte tool keep their own tiles (nothing is dug there).
    if (!dug && (inputs.outdoor?.(cellX, cellY) === false || inputs.paved?.(cellX, cellY) === true)) return "none";
    // The snow comes cell after cell as it thickens where it lies: each cell whitens at its own share of the snow, so
    // the ground goes white by patches, not all at once.
    const snow = inputs.snowCoverAt?.((cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL) ?? 0;
    if (snow >= 1 || (snow > 0 && snow > hash2(cellX * 7 + 13, cellY * 5 + 3))) return "snow";
    // The snow of the heights, over the snow line of the season (it slows the walk there too).
    if (inputs.snowLineSeason && snowCover(heightAt(terrain, cellX, cellY), inputs.snowLineSeason) >= SNOW_FROM) {
        return "snow";
    }
    const meadow = inputs.meadow;
    if (meadow) {
        const tileX = Math.floor(cellX / CELLS_A_TILE);
        const tileY = Math.floor(cellY / CELLS_A_TILE);
        if (meadow.fireAt(tileX, tileY) > 0) return "ember";
        if (meadow.ashAt(tileX, tileY) > 0) return "ash";
        const cover = meadow.grassAt(tileX, tileY);
        if (strawLevel(cover, meadow.drynessAt(tileX, tileY)) >= STRAW_FROM) return "straw";
        if (mottledCover(cover, cellX, cellY) >= GRASS_FROM) return "grass";
    }
    const soil = soilAt(terrain, cellX, cellY);
    if (soil) {
        const name = SOILS[soil - 1];
        if (name === "clay") {
            // Wet clay is mud, as the walk slows down there (soilPace).
            const x = (cellX + 0.5) * TERRAIN_CELL;
            const y = (cellY + 0.5) * TERRAIN_CELL;
            const wet =
                (inputs.waterDepthAt?.(x, y) ?? 0) >= MUD_WATER_PX || (inputs.moistureAt?.(x, y) ?? 0) >= MUD_MOISTURE;
            if (wet) return "mud";
        }
        return name;
    }
    if (dug || inputs.mapGrass?.(cellX, cellY) === true) return "grass";
    // Bare ground outdoors: left to the map; without the layout of the map (the 3/4 relief only), grass.
    return inputs.outdoor ? "none" : "grass";
}
