/**
 * Whether an entity must be aligned on the tile grid.
 * The "Snapping" switch of the editor sets the default; holding Shift inverts it.
 */
export function shouldSnapToGrid(snapEnabled: boolean, shiftDown: boolean): boolean {
    return snapEnabled !== shiftDown;
}

/**
 * Free placement (pixel precision) also ignores the collision grid of the map,
 * so the preview is shown in orange.
 */
export function isPlacementFree(snapEnabled: boolean, shiftDown: boolean): boolean {
    return !shouldSnapToGrid(snapEnabled, shiftDown);
}
