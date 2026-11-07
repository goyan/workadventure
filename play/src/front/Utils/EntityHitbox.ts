import type { CollisionRectangle, EntityPrefab } from "@workadventure/map-editor";

type HitboxPrefab = Partial<Pick<EntityPrefab, "collisionGrid" | "collisionRectangles" | "wander">>;

/** Top-left corner of a placed entity, in pixels. */
interface Placement {
    x: number;
    y: number;
}

/**
 * Whether the entity sits on the grid of the map. Its 32px collision grid is written to the tiles under its top-left
 * corner, rounded down: placed off the grid (free placement in the editor), the blocked tiles would not be under the
 * image, leaving a wall where nothing is drawn and a gap where the object is.
 */
function isOnGrid(placement: Placement, cellSize: number): boolean {
    return placement.x % cellSize === 0 && placement.y % cellSize === 0;
}

/** The blocking cells of a 32px collision grid, as rectangles relative to the top-left corner of the entity. */
function gridRectangles(grid: number[][] | undefined, cellSize: number): CollisionRectangle[] {
    const rectangles: CollisionRectangle[] = [];
    grid?.forEach((row, y) =>
        row.forEach((value, x) => {
            if (value === 1) {
                rectangles.push({ x: x * cellSize, y: y * cellSize, width: cellSize, height: cellSize });
            }
        }),
    );
    return rectangles;
}

/**
 * The collision grid to write to the tile collision layer: the prefab grid of an entity placed on the grid of the map.
 * None off the grid (getSolidRectangles blocks the image instead), and none for a wandering entity: a character walks
 * around in its place, the object itself is hidden and must not stay as an invisible wall.
 */
export function getTileCollisionGrid(
    placement: Placement,
    prefab: HitboxPrefab,
    cellSize: number,
): number[][] | undefined {
    if (prefab.wander || !isOnGrid(placement, cellSize)) {
        return undefined;
    }
    return prefab.collisionGrid;
}

/**
 * The pixel rectangles that block the players, relative to the top-left corner of the entity: the declared rectangles,
 * else, for an entity placed off the grid, the blocking cells of its grid on its image. None for a wandering entity.
 */
export function getSolidRectangles(placement: Placement, prefab: HitboxPrefab, cellSize: number): CollisionRectangle[] {
    if (prefab.wander) {
        return [];
    }
    if (prefab.collisionRectangles?.length) {
        return prefab.collisionRectangles;
    }
    return isOnGrid(placement, cellSize) ? [] : gridRectangles(prefab.collisionGrid, cellSize);
}

/**
 * The box around everything that blocks on the object (declared rectangles, else the blocking cells of its grid),
 * relative to its top-left corner, wherever it is placed: what a player touches when walking up to it.
 */
export function getHitboxBounds(prefab: HitboxPrefab, cellSize: number): CollisionRectangle | undefined {
    const rectangles = prefab.collisionRectangles?.length
        ? prefab.collisionRectangles
        : gridRectangles(prefab.collisionGrid, cellSize);
    if (rectangles.length === 0) {
        return undefined;
    }
    const left = Math.min(...rectangles.map((r) => r.x));
    const top = Math.min(...rectangles.map((r) => r.y));
    const right = Math.max(...rectangles.map((r) => r.x + r.width));
    const bottom = Math.max(...rectangles.map((r) => r.y + r.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The grid that removes `grid` from the tile collision layer. */
export function reverseCollisionGrid(grid: number[][]): number[][] {
    return grid.map((row) => row.map((value) => (value === 1 ? -1 : value)));
}
