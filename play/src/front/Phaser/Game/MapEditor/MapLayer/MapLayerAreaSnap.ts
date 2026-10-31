import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";
import type { MapLayerModel } from "./MapLayerModel";

export interface AreaRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Snaps a rectangle drawn in world pixels onto the tile grid: the result covers every tile the rectangle touches.
 */
export function snapRectToGrid(rect: AreaRect, size = MAP_LAYER_TILE_SIZE): AreaRect {
    const left = Math.floor(rect.x / size);
    const top = Math.floor(rect.y / size);
    const right = Math.max(left, Math.ceil((rect.x + rect.width) / size) - 1);
    const bottom = Math.max(top, Math.ceil((rect.y + rect.height) / size) - 1);
    return { x: left * size, y: top * size, width: (right - left + 1) * size, height: (bottom - top + 1) * size };
}

/**
 * Snaps a drawn rectangle onto the floors of the map layer: the result is the bounding box of the floor tiles the
 * rectangle touches, so an area drawn over a room takes the size of the room's floor and never spills over the walls.
 * Returns the grid-snapped rectangle when the map has no floor at all (a map that does not use the map layer), and
 * undefined when the map has floors but the rectangle touches none of them.
 */
export function snapRectToFloors(
    model: MapLayerModel,
    rect: AreaRect,
    size = MAP_LAYER_TILE_SIZE,
): AreaRect | undefined {
    const grid = snapRectToGrid(rect, size);
    const left = grid.x / size;
    const top = grid.y / size;
    const right = left + grid.width / size - 1;
    const bottom = top + grid.height / size - 1;

    let hasFloor = false;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const floor of model.getFloors()) {
        hasFloor = true;
        if (floor.x < left || floor.x > right || floor.y < top || floor.y > bottom) continue;
        minX = Math.min(minX, floor.x);
        minY = Math.min(minY, floor.y);
        maxX = Math.max(maxX, floor.x);
        maxY = Math.max(maxY, floor.y);
    }
    if (!hasFloor) return grid;
    if (minX === Infinity) return undefined;
    return { x: minX * size, y: minY * size, width: (maxX - minX + 1) * size, height: (maxY - minY + 1) * size };
}
