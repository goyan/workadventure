import { PathTileType } from "../../../Utils/PathfindingManager";
import type { TileBarriers } from "../../../Utils/TileBarriers";

export interface WanderRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The collision grid with every tile touched by a rectangle turned into a collider. The rectangles are the thin
 * collisions of the objects (`collisionRectangles` of the catalog): the physics stops the players there, but the
 * wandering characters have no physics body and only follow the tiles. Returns the grid itself when there is no
 * rectangle.
 */
export function blockRectangles(
    grid: number[][],
    rectangles: readonly WanderRectangle[],
    tileSize: { width: number; height: number },
): number[][] {
    if (rectangles.length === 0) {
        return grid;
    }
    const blocked = grid.map((row) => row.slice());
    for (const rectangle of rectangles) {
        if (rectangle.width <= 0 || rectangle.height <= 0) {
            continue;
        }
        const left = Math.floor(rectangle.x / tileSize.width);
        // The right and bottom borders are excluded: a rectangle ending on a tile border does not touch the next tile.
        const right = Math.ceil((rectangle.x + rectangle.width) / tileSize.width) - 1;
        const top = Math.floor(rectangle.y / tileSize.height);
        const bottom = Math.ceil((rectangle.y + rectangle.height) / tileSize.height) - 1;
        for (let y = Math.max(top, 0); y <= Math.min(bottom, blocked.length - 1); y++) {
            const row = blocked[y];
            for (let x = Math.max(left, 0); x <= Math.min(right, row.length - 1); x++) {
                row[x] = PathTileType.Collider;
            }
        }
    }
    return blocked;
}

export function sameGrids(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): boolean {
    if (a === b) {
        return true;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let y = 0; y < a.length; y++) {
        const rowA = a[y];
        const rowB = b[y];
        if (rowA.length !== rowB.length) {
            return false;
        }
        for (let x = 0; x < rowA.length; x++) {
            if (rowA[x] !== rowB[x]) {
                return false;
            }
        }
    }
    return true;
}

/**
 * The walls plus a barrier all around each locked area: the wandering characters neither walk into a locked room nor
 * out of it, like the players who have to knock. The borders follow the tile lines nearest to the area's edges.
 * Returns the walls themselves when no area is locked.
 */
export function withAreaBorders(
    walls: TileBarriers,
    lockedAreas: readonly WanderRectangle[],
    tileSize: { width: number; height: number },
): TileBarriers {
    if (lockedAreas.length === 0) {
        return walls;
    }
    const barriers = walls.copy();
    for (const area of lockedAreas) {
        const left = Math.round(area.x / tileSize.width);
        const right = Math.round((area.x + area.width) / tileSize.width);
        const top = Math.round(area.y / tileSize.height);
        const bottom = Math.round((area.y + area.height) / tileSize.height);
        for (let y = top; y < bottom; y++) {
            barriers.addWestBorder(left, y);
            barriers.addWestBorder(right, y);
        }
        for (let x = left; x < right; x++) {
            barriers.addSouthBorder(x, top - 1);
            barriers.addSouthBorder(x, bottom - 1);
        }
    }
    return barriers;
}
