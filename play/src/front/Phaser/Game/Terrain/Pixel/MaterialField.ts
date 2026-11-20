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
import { valueNoise } from "./PixelNoise";
import type { Material } from "./PixelPalette";

/** What covers a cell: a material, or nothing (transparent: the tiles of the map show). */
export type Cover = Material | "none";

/** What the material of a cell is read from. */
export interface CellInputs {
    /** The relief and the soils painted; none on a map without relief. */
    terrain: TerrainData | undefined;
    meadow?: MeadowState;
    /** How much snow lies on the ground (0 to 1): the Christmas theme or the snow of the map weather. */
    snowShown: number;
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
    if (inputs.snowShown >= SNOW_FROM) return "snow";
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

/**
 * What covers a point of the map (map pixels): of the two materials weighing most among the four cells around it
 * (between their centres), the first while its share, shaken by a noise, is over a half. The border between two
 * materials is sharp and irregular, and the same at every call.
 */
export function pickMaterial(cell: (cellX: number, cellY: number) => Cover, x: number, y: number): Cover {
    const fx = x / TERRAIN_CELL - 0.5;
    const fy = y / TERRAIN_CELL - 0.5;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tx = fx - cx;
    const ty = fy - cy;
    // Inside a material, nothing to weigh (most of the ground).
    const northWest = cell(cx, cy);
    const northEast = cell(cx + 1, cy);
    const southWest = cell(cx, cy + 1);
    const southEast = cell(cx + 1, cy + 1);
    if (northWest === northEast && northWest === southWest && northWest === southEast) return northWest;
    const corners: [Cover, number][] = [
        [northWest, (1 - tx) * (1 - ty)],
        [northEast, tx * (1 - ty)],
        [southWest, (1 - tx) * ty],
        [southEast, tx * ty],
    ];
    let first: Cover = corners[0][0];
    let firstWeight = 0;
    let second: Cover | undefined;
    let secondWeight = 0;
    const weights = new Map<Cover, number>();
    for (const [material, weight] of corners) weights.set(material, (weights.get(material) ?? 0) + weight);
    for (const [material, weight] of weights) {
        if (weight > firstWeight) {
            second = firstWeight > 0 ? first : second;
            secondWeight = firstWeight > 0 ? firstWeight : secondWeight;
            first = material;
            firstWeight = weight;
        } else if (weight > secondWeight) {
            second = material;
            secondWeight = weight;
        }
    }
    if (second === undefined) return first;
    const share = firstWeight / (firstWeight + secondWeight) + (valueNoise(x / 3.5, y / 3.5) - 0.5) * 0.35;
    return share > 0.5 ? first : second;
}

/** The order of the materials, darkest first: the darker of two materials that meet carries the line. */
const LINE_ORDER: readonly Material[] = [
    "ash",
    "ember",
    "mud",
    "earth",
    "clay",
    "meadow",
    "gravel",
    "rock",
    "grass",
    "straw",
    "sand",
    "snow",
];

/**
 * The 1 px line a pixel of a material carries where it meets another one: dark on the grass side and on the side of
 * the darker material, light on the snow side; none on the other side, nor between two pixels of the same material.
 */
export function outlineOf(material: Cover, neighbour: Cover): "dark" | "light" | undefined {
    if (material === neighbour || material === "none") return undefined;
    if (material === "snow") return "light";
    if (material === "grass") return "dark";
    if (neighbour === "none") return undefined;
    return LINE_ORDER.indexOf(material) < LINE_ORDER.indexOf(neighbour) ? "dark" : undefined;
}
