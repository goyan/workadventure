import type * as Phaser from "phaser";

/** A point of the map, in the coordinates of its image (as the avatars and the darts are drawn). */
export interface MapPoint {
    x: number;
    y: number;
}

/**
 * The point of the map under the pointer: what a weapon aims at (the grenade launcher lobs at it, the Nerf fires
 * straight through it). The pointer as the main camera sees it now, even when the camera moved since the mouse did.
 */
export function pointerMapPoint(
    pointer: Pick<Phaser.Input.Pointer, "positionToCamera">,
    camera: Phaser.Cameras.Scene2D.Camera,
): MapPoint {
    const point = { x: 0, y: 0 };
    pointer.positionToCamera(camera, point);
    return point;
}

/**
 * Whether the pointer can aim: a mouse over the game that has moved at least once. A touch leaves no pointer between
 * two taps, a mouse out of the game points at nothing, and a pointer that never moved sits at the corner of the screen.
 */
export function canAimWithPointer(
    isOver: boolean,
    pointer: Pick<Phaser.Input.Pointer, "wasTouch" | "moveTime">,
): boolean {
    return isOver && !pointer.wasTouch && pointer.moveTime > 0;
}
