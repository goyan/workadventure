import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FadedWallFloorPatch<T> {
    column: number;
    row: number;
    floor: T;
}

/**
 * What to draw under the see-through walls in front of a room. The room has its floor under the top of such a wall but
 * none under its foot: faded, the wall would show the floor of the room above and the ground of the outdoors below, in
 * two tones. Each cell under the image of a faded piece that has no floor gets the floor found just north of it (under
 * the piece, or in the room right behind it). A cell with its own floor (under a door) is left alone.
 */
export function fadedWallFloorPatches<T>(
    walls: Iterable<Rect>,
    floorAt: (column: number, row: number) => T | undefined,
): FadedWallFloorPatch<T>[] {
    const patches: FadedWallFloorPatch<T>[] = [];
    const seen = new Set<string>();
    for (const wall of walls) {
        // The columns whose centre is under the piece: an end piece or a joint reaches over its neighbours by a few px.
        const firstColumn = Math.ceil(wall.x / MAP_LAYER_TILE_SIZE - 0.5);
        const lastColumn = Math.ceil((wall.x + wall.width) / MAP_LAYER_TILE_SIZE - 0.5) - 1;
        const topRow = Math.floor(wall.y / MAP_LAYER_TILE_SIZE);
        const footRow = Math.ceil((wall.y + wall.height) / MAP_LAYER_TILE_SIZE) - 1;
        for (let column = firstColumn; column <= lastColumn; column++) {
            let floor = floorAt(column, topRow - 1);
            for (let row = topRow; row <= footRow; row++) {
                const own = floorAt(column, row);
                if (own !== undefined) {
                    floor = own;
                    continue;
                }
                const key = `${column},${row}`;
                if (floor === undefined || seen.has(key)) continue;
                seen.add(key);
                patches.push({ column, row, floor });
            }
        }
    }
    return patches;
}
