import { SOILS, soilAt, TERRAIN_CELL, TILE_PX } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type { MeadowState } from "../MeadowState";
import { mottledCover, strawLevel } from "../MeadowState";
import { valueNoise } from "./PixelNoise";
import type { Material } from "./PixelPalette";

/** What the material of a cell is read from. */
export interface CellInputs {
    terrain: TerrainData;
    meadow?: MeadowState;
    /** How much snow lies on the ground (0 to 1): the Christmas theme or the snow of the map weather. */
    snowShown: number;
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
export function cellMaterial(inputs: CellInputs, cellX: number, cellY: number): Material {
    if (inputs.snowShown >= SNOW_FROM) return "snow";
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
    const soil = soilAt(inputs.terrain, cellX, cellY);
    return soil ? SOILS[soil - 1] : "grass";
}

/**
 * What covers a point of the map (map pixels): of the two materials weighing most among the four cells around it
 * (between their centres), the first while its share, shaken by a noise, is over a half. The border between two
 * materials is sharp and irregular, and the same at every call.
 */
export function pickMaterial(cell: (cellX: number, cellY: number) => Material, x: number, y: number): Material {
    const fx = x / TERRAIN_CELL - 0.5;
    const fy = y / TERRAIN_CELL - 0.5;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tx = fx - cx;
    const ty = fy - cy;
    const corners: [Material, number][] = [
        [cell(cx, cy), (1 - tx) * (1 - ty)],
        [cell(cx + 1, cy), tx * (1 - ty)],
        [cell(cx, cy + 1), (1 - tx) * ty],
        [cell(cx + 1, cy + 1), tx * ty],
    ];
    let first: Material = corners[0][0];
    let firstWeight = 0;
    let second: Material | undefined;
    let secondWeight = 0;
    const weights = new Map<Material, number>();
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
export function outlineOf(material: Material, neighbour: Material): "dark" | "light" | undefined {
    if (material === neighbour) return undefined;
    if (material === "snow") return "light";
    if (material === "grass") return "dark";
    return LINE_ORDER.indexOf(material) < LINE_ORDER.indexOf(neighbour) ? "dark" : undefined;
}
