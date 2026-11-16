import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";
import { stairFootFromImage } from "./FloorModel";
import { stairGroundBox } from "./MapLayerFloors";
import type { FloorPiece } from "./MapLayerFloors";

/** Everything standing on a raised floor is drawn over everything standing lower: one band of depths per altitude. */
export const FLOOR_LEVEL_DEPTH = 300_000;

/**
 * Depth of what stands at an altitude, `groundDepth` being the depth it would have on the ground (sorted by its foot):
 * unchanged on the ground; above, in the band of its altitude, still sorted by its foot.
 */
export function floorDepth(elevation: number, groundDepth: number): number {
    return elevation > 0 ? FLOOR_LEVEL_DEPTH + elevation * 1000 + groundDepth / 16 : groundDepth;
}

/**
 * Depth of a slab or a stair whose image is at (x, y), standing at `elevation`:
 * - a slab is under everything standing on its floor and over everything lower; among slabs, the southern ones are over
 *   the northern ones (they cover the thickness drawn under them);
 * - a stair is sorted by its foot, like an object standing on the floor it starts from.
 */
export function floorPieceDepth(piece: FloorPiece, x: number, y: number, elevation: number): number {
    if (piece.kind === "slab") {
        const row = (y + elevation) / MAP_LAYER_TILE_SIZE;
        return floorDepth(elevation, 0) - 1 + row / 100_000;
    }
    const foot = stairFootFromImage(piece, x, y, elevation);
    if (!foot) return floorDepth(elevation, y);
    const ground = stairGroundBox(piece, foot);
    return floorDepth(elevation, ground.y + ground.height);
}
