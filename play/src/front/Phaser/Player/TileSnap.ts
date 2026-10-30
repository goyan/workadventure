export interface TileSnapGeometry {
    tileWidth: number;
    tileHeight: number;
    bodyHeight: number;
    bodyOffsetY: number;
}

export interface TileCoordinates {
    tileX: number;
    tileY: number;
}

// Below this distance (in pixels), the avatar is considered already centered.
const SNAP_TOLERANCE = 1;

/**
 * Tile under the feet of a sprite located at (x, y). The feet are at the bottom of the body,
 * like in the pathfinding conventions.
 */
export function getFeetTile(x: number, y: number, geometry: TileSnapGeometry): TileCoordinates {
    const feetY = y + geometry.bodyHeight / 2 + geometry.bodyOffsetY;
    return {
        tileX: Math.floor(x / geometry.tileWidth),
        tileY: Math.floor(feetY / geometry.tileHeight),
    };
}

/**
 * Center of the tile containing a world point, as targeted by the pathfinding.
 */
export function getTileCenter(x: number, y: number, tileWidth: number, tileHeight: number): { x: number; y: number } {
    return {
        x: Math.floor(x / tileWidth) * tileWidth + tileWidth / 2,
        y: Math.floor(y / tileHeight) * tileHeight + tileHeight / 2,
    };
}

/**
 * Target of the snap, expressed in "feet coordinates" (as expected by Character.setPathToFollow),
 * or undefined if the sprite is already centered on its tile.
 */
export function computeTileSnapTarget(
    x: number,
    y: number,
    geometry: TileSnapGeometry,
): { x: number; y: number } | undefined {
    const { tileX, tileY } = getFeetTile(x, y, geometry);
    const target = {
        x: tileX * geometry.tileWidth + geometry.tileWidth / 2,
        y: tileY * geometry.tileHeight + geometry.tileHeight / 2,
    };
    const spriteTargetY = target.y - geometry.bodyHeight / 2 - geometry.bodyOffsetY;
    if (Math.hypot(target.x - x, spriteTargetY - y) < SNAP_TOLERANCE) {
        return undefined;
    }
    return target;
}
