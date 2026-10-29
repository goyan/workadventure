import type { CollisionRectangle } from "@workadventure/map-editor";

/**
 * Converts the prefab rectangles (relative to the entity top-left corner) into world rectangles.
 * The catalog schema already rejects invalid rectangles, so no validation is needed here.
 */
export function getPrefabCollisionRectangles(
    topLeft: Pick<Phaser.Math.Vector2, "x" | "y">,
    rectangles: CollisionRectangle[] | undefined,
): Phaser.Types.Math.RectangleLike[] {
    return (rectangles ?? []).map((rectangle) => ({
        x: topLeft.x + rectangle.x,
        y: topLeft.y + rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
    }));
}
