import { PathTileType } from "../../../Utils/PathfindingManager";

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
