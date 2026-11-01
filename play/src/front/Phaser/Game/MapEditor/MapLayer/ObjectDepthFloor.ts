import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";

export interface DepthBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WallDepthBox extends DepthBox {
    depth: number;
}

function footRow(box: DepthBox): number {
    return Math.floor((box.y + box.height - 1) / MAP_LAYER_TILE_SIZE);
}

function overlaps(a: DepthBox, b: DepthBox): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Walls carry a positive depth offset so that they hide what stands behind them. An object that is sorted on its top
 * row (negative depth offset) would then also go behind a wall that crosses it, even when it stands on the tile in
 * front of that wall. An object whose foot is on a tile south of a wall it overlaps must stay in front of that wall;
 * an object standing on the wall tile or north of it keeps its natural depth, so that the wall is drawn over it.
 */
export function applyWallDepthFloor(naturalDepth: number, object: DepthBox, walls: Iterable<WallDepthBox>): number {
    const objectFootRow = footRow(object);
    let depth = naturalDepth;
    for (const wall of walls) {
        if (footRow(wall) < objectFootRow && overlaps(object, wall)) {
            depth = Math.max(depth, wall.depth + 0.5);
        }
    }
    return depth;
}

export interface SupportDepthBox extends DepthBox {
    /** Depth actually applied to the support, possibly raised above its natural depth by a wall. */
    depth: number;
    /** Depth the support has from its own position and depth offset alone. */
    naturalDepth: number;
    /** Collision grid of the support, one cell per tile from its top-left corner (1 = solid). */
    collisionGrid?: number[][];
}

/**
 * An object whose foot stands on another object (a plant on a big table, books on a shelf) sits on it: it must be
 * drawn over it. Two cases tell that the object stands on it:
 * - its foot is on a solid cell of the support's collision grid, even when the support is sorted on a lower foot;
 * - its foot is inside the support's image and is naturally in front of the support. The support may have been raised
 *   above that natural depth (a shelf against a wall), which would otherwise hide the object behind it.
 */
export function applySupportDepthFloor(
    naturalDepth: number,
    object: DepthBox,
    supports: Iterable<SupportDepthBox>,
): number {
    const footX = object.x + object.width / 2;
    const footY = object.y + object.height - 1;
    let depth = naturalDepth;
    for (const support of supports) {
        const column = Math.floor((footX - support.x) / MAP_LAYER_TILE_SIZE);
        const row = Math.floor((footY - support.y) / MAP_LAYER_TILE_SIZE);
        const onSolidCell = support.collisionGrid?.[row]?.[column] === 1;
        const insideImage =
            footX >= support.x &&
            footX < support.x + support.width &&
            footY >= support.y &&
            footY < support.y + support.height;
        if (onSolidCell || (insideImage && naturalDepth > support.naturalDepth)) {
            depth = Math.max(depth, support.depth + 0.5);
        }
    }
    return depth;
}
