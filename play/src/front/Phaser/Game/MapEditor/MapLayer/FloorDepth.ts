import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";
import { stairFootFromImage } from "./FloorModel";
import { stairGroundBox } from "./MapLayerFloors";
import type { FloorPiece } from "./MapLayerFloors";

/**
 * Everything standing on a raised floor is drawn over everything standing lower: one band of depths per altitude.
 * The bands start over all the depths of the ground, the overhead objects (a tree behind a house is hidden by its
 * upper floor) and their effects included, and stay under the overlay layers of the map (1 000 000).
 */
export const FLOOR_LEVEL_DEPTH = 965_000;
/** Depth between two altitudes one pixel apart: more than the span of a band. */
const DEPTH_PER_PIXEL = 80;
/** The depths of the ground (up to about 960 000) are brought within a band. */
const GROUND_DEPTH_SCALE = 20_000;
/** Depths of the previews of the map editor: over the highest floor, under the overlay layers. */
export const FLOOR_PREVIEW_DEPTH = 999_000;

/**
 * Depth of what stands at an altitude, `groundDepth` being the depth it would have on the ground (sorted by its foot):
 * unchanged on the ground; above, in the band of its altitude, still sorted as on the ground.
 */
export function floorDepth(elevation: number, groundDepth: number): number {
    return elevation > 0
        ? FLOOR_LEVEL_DEPTH + elevation * DEPTH_PER_PIXEL + groundDepth / GROUND_DEPTH_SCALE
        : groundDepth;
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
        return floorDepth(elevation, 0) - 1 + row / 1_000_000;
    }
    const foot = stairFootFromImage(piece, x, y, elevation);
    if (!foot) return floorDepth(elevation, y);
    const ground = stairGroundBox(piece, foot);
    return floorDepth(elevation, ground.y + ground.height);
}
