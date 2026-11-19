import { chunkedChanges, defaultForcePx, strokeChanges } from "@workadventure/map-editor";
import type { BrushSettings, TerrainData } from "@workadventure/map-editor";

/** What the panel of the relief tool sets: the force is automatic (an eighth of the diameter) until chosen. */
export interface TerrainBrush {
    mode: BrushSettings["mode"];
    diameterTiles: number;
    forcePx: number | undefined;
    /**
     * The height the flatten mode brings the ground to, in pixels of altitude. Absent: the height of the ground where
     * the stroke starts.
     */
    targetPx?: number;
}

/**
 * The brush as the relief works with it, with the maximum depth of the map. `startHeightPx` is the height of the
 * ground where the stroke starts: what the flatten mode brings the ground to, unless the panel sets a level.
 */
export function brushSettingsOf(brush: TerrainBrush, maxDepthTiles: number, startHeightPx = 0): BrushSettings {
    return {
        mode: brush.mode,
        diameterTiles: brush.diameterTiles,
        forcePx: brush.forcePx ?? defaultForcePx(brush.diameterTiles),
        maxDepthTiles,
        ...(brush.mode === "flatten" ? { targetPx: brush.targetPx ?? startHeightPx } : {}),
    };
}

/**
 * Ends a stroke of the brush: its changes are worked out once for the whole path (a cell is dug once), then sent, in
 * one command for a usual stroke, in several of a bounded size, one after the other, for a huge one. Nothing is sent
 * when nothing changes.
 */
export async function commitStroke(
    path: readonly { x: number; y: number }[],
    settings: BrushSettings,
    terrain: TerrainData | undefined,
    allowed: (cellX: number, cellY: number) => boolean,
    send: (changes: ReadonlyMap<string, number>) => Promise<void>,
): Promise<void> {
    if (path.length === 0) return;
    for (const part of chunkedChanges(strokeChanges(terrain, path, settings, allowed))) {
        // eslint-disable-next-line no-await-in-loop -- the commands of one stroke are applied in order
        await send(part);
    }
}
