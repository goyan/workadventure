import { TILE_PX } from "../types";
import type { WAMFileFormat } from "../types";

/** The trees of the nature catalogue: the same the jungle of the browser counts (play: JunglePlan). */
const TREE_PREFIX = "Nature:tree-";

/**
 * Where the trees of a map stand, in map pixels, for the lions and the tigers that live around one. The server
 * knows the place of an object (the top left corner of its image), not its size: the foot of a tree is taken a
 * tile to the right and two tiles under that corner, which is within a tile of the trunk for the trees of the
 * catalogue. Trees placed on a raised floor are not on the land.
 */
export function landTreesOf(wam: Pick<WAMFileFormat, "entities"> | undefined): { x: number; y: number }[] {
    const trees: { x: number; y: number }[] = [];
    for (const entity of Object.values(wam?.entities ?? {})) {
        if (!entity?.prefabRef?.id?.startsWith(TREE_PREFIX)) continue;
        if ((entity.elevation ?? 0) > 0) continue;
        trees.push({ x: entity.x + TILE_PX, y: entity.y + 2 * TILE_PX });
    }
    return trees;
}

/** The families of the nature catalogue that are all trees, snowy and seasonal ones included. */
const TREE_PREFIXES = [
    "Nature:tree-",
    "Nature:seasonal-",
    "Nature:snow-tree-",
    "Nature:snow-evergreen-",
    "Nature:winter-auto-",
];
/** The trees of the first nature set (oaks, palms, bare trees): its other objects are stumps, rocks, bushes, grass. */
const TREE_NATURE_SETS = new Set(["nature-1", "nature-2", "nature-3", "nature-4", "nature-5", "nature-6"]);

/**
 * Whether an object of the catalogues is a tree: the ones that sway in the wind, follow the seasons and burn. One
 * list for the server and the browser.
 */
export function isTreePrefab(prefabId: string): boolean {
    if (TREE_PREFIXES.some((prefix) => prefabId.startsWith(prefix))) return true;
    const family = /^Nature:(nature-\d+):/.exec(prefabId)?.[1];
    return family !== undefined && TREE_NATURE_SETS.has(family);
}

/** A tree that can burn: the id of its object, and where its foot is taken to stand (map pixels, see landTreesOf). */
export interface BurnableTree {
    id: string;
    x: number;
    y: number;
}

/** Every tree of a map that stands on the ground, with its id: the ones a fire can take. */
export function burnableTreesOf(wam: Pick<WAMFileFormat, "entities"> | undefined): BurnableTree[] {
    const trees: BurnableTree[] = [];
    for (const [id, entity] of Object.entries(wam?.entities ?? {})) {
        const prefab = entity?.prefabRef?.id;
        if (!prefab || !isTreePrefab(prefab)) continue;
        if ((entity.elevation ?? 0) > 0) continue;
        trees.push({ id, x: entity.x + TILE_PX, y: entity.y + 2 * TILE_PX });
    }
    return trees;
}
