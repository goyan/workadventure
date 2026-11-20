import type { TerrainData } from "@workadventure/map-editor";
import { DROP_SCALE, heightAtPoint, MAX_DROP } from "./ReliefProjection";

/** Above this altitude a character stands on a raised floor, not on the ground. */
const ON_A_FLOOR = 2;

/**
 * How much lower than its place a character is drawn, with the relief seen in 3/4 (ReliefProjection): as much as
 * the ground under its feet, or as the surface of the water it is in. Nothing on a raised floor (it passes over the
 * relief) nor while the map editor is open (the relief is drawn flat there).
 */
export function avatarDrop(
    terrain: TerrainData | undefined,
    feet: { x: number; y: number },
    waterDepth: number,
    floorZ: number,
    editorOpen: boolean,
): number {
    if (!terrain || editorOpen || floorZ >= ON_A_FLOOR) return 0;
    const surface = heightAtPoint(terrain, feet.x, feet.y) + Math.max(0, waterDepth);
    return Math.min(MAX_DROP, Math.max(0, -surface) * DROP_SCALE);
}
