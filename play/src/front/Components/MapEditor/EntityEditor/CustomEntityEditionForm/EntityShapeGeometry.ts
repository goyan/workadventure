import type { CollisionRectangle } from "@workadventure/map-editor";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Bounds {
    width: number;
    height: number;
}

/** The rectangle moved by (dx, dy) image pixels, kept inside the image. */
export function moveRectangle(
    rectangle: CollisionRectangle,
    dx: number,
    dy: number,
    bounds: Bounds,
): CollisionRectangle {
    return {
        ...rectangle,
        x: clamp(rectangle.x + dx, 0, Math.max(0, bounds.width - rectangle.width)),
        y: clamp(rectangle.y + dy, 0, Math.max(0, bounds.height - rectangle.height)),
    };
}

/**
 * The rectangle with the edges of `handle` moved by (dx, dy) image pixels: at least one pixel wide and high, inside
 * the image. The opposite edges do not move.
 */
export function resizeRectangle(
    rectangle: CollisionRectangle,
    handle: ResizeHandle,
    dx: number,
    dy: number,
    bounds: Bounds,
): CollisionRectangle {
    let left = rectangle.x;
    let top = rectangle.y;
    let right = rectangle.x + rectangle.width;
    let bottom = rectangle.y + rectangle.height;
    if (handle.includes("w")) left = clamp(left + dx, 0, right - 1);
    if (handle.includes("e")) right = clamp(right + dx, left + 1, bounds.width);
    if (handle.includes("n")) top = clamp(top + dy, 0, bottom - 1);
    if (handle.includes("s")) bottom = clamp(bottom + dy, top + 1, bounds.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
