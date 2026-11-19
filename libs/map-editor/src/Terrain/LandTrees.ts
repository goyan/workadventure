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
