/** Size of the map in pixels: where the avatars walk. The ground shown past its edges is only a picture. */
export interface MapPixelSize {
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * The corner of an area, brought back onto the map when it is past one of its edges. The area of a raised floor is
 * drawn its altitude further north: its corner is read on the ground under it.
 */
export function clampAreaCorner(corner: Point, level: number, map: MapPixelSize): Point {
    return {
        x: clamp(corner.x, 0, map.width),
        y: clamp(corner.y + level, 0, map.height) - level,
    };
}

/** The top left corner of an area that is moved, so that the whole area stays on the map. */
export function clampAreaTopLeft(
    topLeft: Point,
    size: { width: number; height: number },
    level: number,
    map: MapPixelSize,
): Point {
    return {
        x: clamp(topLeft.x, 0, map.width - size.width),
        y: clamp(topLeft.y + level, 0, map.height - size.height) - level,
    };
}
