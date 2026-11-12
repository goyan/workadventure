import type { Point } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";

/** Whether a point is inside a polygon (ray casting): what a player standing there sees of the light. */
export function isLit(polygon: readonly Point[], point: Point): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}
