import type { EntityLayer } from "@workadventure/map-editor";
import { DEPTH_OVERLAY_INDEX } from "../Game/DepthIndexes";
import { MAP_LAYER_FLOOR_DEPTH } from "../Game/MapEditor/MapLayer/MapLayerCatalog";

/** Floor objects sit just above the floors of the map layer, under every character (whose depth is its foot y). */
export const FLOOR_OBJECT_DEPTH = MAP_LAYER_FLOOR_DEPTH + 0.5;
/** Overhead objects sit over every character, but under the overlay tile layers and the in-game UI. */
export const OVERHEAD_OBJECT_DEPTH = DEPTH_OVERLAY_INDEX - 100_000;

/**
 * Depth of a `floor` or `overhead` object. The foot of the image still orders the objects of the same level (a rug
 * lower on the screen covers the one above it) without leaving the level: it only adds a fraction.
 */
export function getLayerDepth(layer: Exclude<EntityLayer, "standing">, footY: number): number {
    const base = layer === "floor" ? FLOOR_OBJECT_DEPTH : OVERHEAD_OBJECT_DEPTH;
    const span = layer === "floor" ? 0.4 : 50_000;
    // Maps are far smaller than 1e6 px: the fraction stays under `span`.
    return base + (Math.max(0, footY) / 1_000_000) * span;
}
