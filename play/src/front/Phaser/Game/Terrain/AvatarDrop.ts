import { TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { heightAtPoint, shiftOfHeight } from "./ReliefProjection";

/** Above this altitude a character stands on a raised floor, not on the ground. */
export const ON_A_FLOOR = 2;

/**
 * How much lower than its place a character is drawn, with the relief seen in 3/4 (ReliefProjection): as much as
 * the ground under its feet, or as the surface of the water it is in; negative on a mount (drawn higher). Nothing on a
 * raised floor (it passes over the relief) nor while the map editor is open (the relief is drawn flat there).
 */
export function avatarDrop(
    terrain: TerrainData | undefined,
    feet: { x: number; y: number },
    waterDepth: number,
    floorZ: number,
    editorOpen: boolean,
    /** On the deck of a bridge: it walks at the level of the deck, over the hollow and its water. */
    onBridge: boolean,
): number {
    if (!terrain || editorOpen || onBridge || floorZ >= ON_A_FLOOR) return 0;
    return shiftOfHeight(heightAtPoint(terrain, feet.x, feet.y) + Math.max(0, waterDepth));
}

/**
 * The depth of the water at a point, between the centres of the cells (as the lake is drawn, ReliefTiles), from the
 * depth of the cell at a point: a swimmer goes down into a lake as smoothly as its shore is drawn.
 */
export function waterDepthAtPoint(depthAt: (x: number, y: number) => number, x: number, y: number): number {
    const fx = x / TERRAIN_CELL - 0.5;
    const fy = y / TERRAIN_CELL - 0.5;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tx = fx - cx;
    const ty = fy - cy;
    const at = (column: number, row: number): number =>
        depthAt((column + 0.5) * TERRAIN_CELL, (row + 0.5) * TERRAIN_CELL);
    const top = at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx;
    const bottom = at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx;
    return top * (1 - ty) + bottom * ty;
}

/**
 * How much lower the surface of the water under a point is drawn (ReliefProjection), for what lies on it: fish,
 * dolphins, the float of a line, the glints. Not on the deck of a bridge, nor while the map editor is open.
 */
export function surfaceDropAt(
    terrain: TerrainData | undefined,
    waterDepth: number,
    x: number,
    y: number,
    onBridge: boolean,
    editorOpen: boolean,
): number {
    return avatarDrop(terrain, { x, y }, waterDepth, 0, editorOpen, onBridge);
}
