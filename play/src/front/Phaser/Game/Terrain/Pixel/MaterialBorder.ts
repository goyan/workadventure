import { valueNoise } from "./PixelNoise";
import type { Material } from "./PixelPalette";
import { TERRAIN_CELL } from "./TerrainUnits";

/** What covers a cell: a material, or nothing (transparent: the tiles of the map show). */
export type Cover = Material | "none";

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
    // What nothing covers (a room, a floor of the Carte tool, a tile of the map) is a square of tiles: its border
    // follows the edges of the cells exactly, neither shaken into it nor out of it.
    const own = cell(Math.floor(x / TERRAIN_CELL), Math.floor(y / TERRAIN_CELL));
    if (own === "none") return "none";
    const share = firstWeight / (firstWeight + secondWeight) + (valueNoise(x / 3.5, y / 3.5) - 0.5) * 0.35;
    const picked = share > 0.5 ? first : second;
    return picked === "none" ? own : picked;
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
