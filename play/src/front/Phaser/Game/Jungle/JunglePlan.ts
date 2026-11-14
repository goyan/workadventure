import { parisCalendarDay } from "../Night/NightClock";
import { mulberry32, wanderSeed } from "../Wander/WanderRandom";
import { TILE_SIZE } from "../Wander/WanderSchedule";
import type { Point } from "../Wander/WanderSchedule";

/** Catalog tag of the jungle: on a species (with a `wander` sheet) and on the marker that lights the jungle up. */
export const JUNGLE_TAG = "Jungle";
/** Prefab ids of the trees animals gather around. */
export const JUNGLE_TREE_PREFIX = "Nature:tree-";
/** Share of the outdoor trees that have an animal on a given day. */
export const JUNGLE_TREE_SHARE = 1 / 3;
export const JUNGLE_MAX_ANIMALS = 50;
/** How far from the foot of its tree the nest of an animal may be, in tiles. */
export const JUNGLE_NEST_SEARCH_TILES = 3;
/** Wandering radius of the jungle animals around their nest, in tiles. */
export const JUNGLE_RADIUS_TILES = 5;

export interface JunglePrefab {
    id: string;
    tags: string[];
    wander?: { sheetPath: string };
}

export interface JungleTree {
    /** Id of the placed entity. */
    id: string;
    /** Bottom middle of its image, in pixels. */
    foot: Point;
}

export interface JungleAnimal {
    /** `jungle:${tree.id}`: never the id of a placed entity. */
    id: string;
    sheetPath: string;
    /** Centre of a free outdoor tile, in pixels. */
    nest: Point;
}

export function isJungleTree(prefabId: string): boolean {
    return prefabId.startsWith(JUNGLE_TREE_PREFIX);
}

/** The object that lights the jungle up on a map: tagged Jungle, without a wandering sheet. */
export function isJungleMarker(prefab: JunglePrefab): boolean {
    return prefab.tags.includes(JUNGLE_TAG) && prefab.wander === undefined;
}

/** Sheets of the jungle species among the loaded prefabs, sorted and without duplicates: the same on every client. */
export function jungleSpecies(prefabs: Iterable<JunglePrefab>): string[] {
    const sheets = new Set<string>();
    for (const prefab of prefabs) {
        if (prefab.wander && prefab.tags.includes(JUNGLE_TAG)) sheets.add(prefab.wander.sheetPath);
    }
    return [...sheets].sort();
}

/** Calendar day in Paris, `YYYY-MM-DD`: the animals change every day, at the same time for everybody. */
export function parisDay(date: Date): string {
    const { year, month, day } = parisCalendarDay(date);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function treeSeed(treeId: string, day: string): string {
    return `jungle:${treeId}:${day}`;
}

/** Whether this tree has an animal on that day (before the cap of JUNGLE_MAX_ANIMALS). */
export function jungleTreePicked(treeId: string, day: string): boolean {
    return mulberry32(wanderSeed(treeSeed(treeId, day), 0, 0))() < JUNGLE_TREE_SHARE;
}

/**
 * The jungle animals of a map for a day. Every input is the same on every client (the trees, the collisions, the
 * walls), and the draw only depends on the id of each tree and the day: everybody sees the same animals at the same
 * places, whatever the order in which the trees are read.
 */
export function planJungle(input: {
    trees: JungleTree[];
    species: string[];
    day: string;
    /** Pixel coordinates. */
    isOutdoor(x: number, y: number): boolean;
    /** Tile coordinates. */
    isWalkable(tile: Point): boolean;
}): JungleAnimal[] {
    const { trees, species, day } = input;
    if (species.length === 0) return [];
    const picked: { animal: JungleAnimal; rank: number }[] = [];
    for (const tree of trees) {
        if (!input.isOutdoor(tree.foot.x, tree.foot.y)) continue;
        const seed = treeSeed(tree.id, day);
        const random = mulberry32(wanderSeed(seed, 0, 0));
        if (random() >= JUNGLE_TREE_SHARE) continue;
        const sheetPath = species[Math.floor(random() * species.length)];
        const nest = nestNear(tree.foot, input);
        if (!nest) continue;
        picked.push({ animal: { id: `jungle:${tree.id}`, sheetPath, nest }, rank: wanderSeed(seed, 1, 0) });
    }
    picked.sort((a, b) => a.rank - b.rank || (a.animal.id < b.animal.id ? -1 : a.animal.id > b.animal.id ? 1 : 0));
    return picked.slice(0, JUNGLE_MAX_ANIMALS).map((entry) => entry.animal);
}

/**
 * Centre of the free outdoor tile nearest to the foot of a tree: rings of growing Chebyshev distance, each read by
 * increasing dy then dx. Undefined when there is none within JUNGLE_NEST_SEARCH_TILES.
 */
function nestNear(
    foot: Point,
    map: { isOutdoor(x: number, y: number): boolean; isWalkable(tile: Point): boolean },
): Point | undefined {
    const footTile = { x: Math.floor(foot.x / TILE_SIZE), y: Math.floor(foot.y / TILE_SIZE) };
    for (let distance = 0; distance <= JUNGLE_NEST_SEARCH_TILES; distance++) {
        for (let dy = -distance; dy <= distance; dy++) {
            for (let dx = -distance; dx <= distance; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) continue;
                const tile = { x: footTile.x + dx, y: footTile.y + dy };
                const centre = { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
                if (map.isWalkable(tile) && map.isOutdoor(centre.x, centre.y)) return centre;
            }
        }
    }
    return undefined;
}
