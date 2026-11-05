import type { CollisionRectangle } from "@workadventure/map-editor";

/** A pixel with less opacity than this is see-through: it does not count as part of the object. */
const OPAQUE_ALPHA = 32;
/** Share of the visible height of an object taken by its foot, seen from above at an angle. */
const FOOTPRINT_SHARE = 0.35;
const MIN_FOOTPRINT_HEIGHT = 4;
/** Default rim of a pool, as a share of its smallest side. */
export const DEFAULT_WATER_MARGIN_SHARE = 0.15;

/**
 * The hitbox of a standing object: the part of it touching the ground, i.e. the bottom band of its opaque pixels,
 * as wide as the opaque pixels of that band. Only the first frame of an animated strip (`frameWidth` wide) counts.
 * Undefined for a fully transparent image.
 */
export function computeFootprint(image: ImageData, frameWidth = image.width): CollisionRectangle | undefined {
    const bounds = computeOpaqueBounds(image, frameWidth);
    if (!bounds) return undefined;
    const height = Math.min(bounds.height, Math.max(MIN_FOOTPRINT_HEIGHT, Math.round(bounds.height * FOOTPRINT_SHARE)));
    const top = bounds.y + bounds.height - height;
    const band = computeOpaqueBounds(image, frameWidth, top);
    if (!band) return undefined;
    return { x: band.x, y: top, width: band.width, height };
}

/** The water of a pool: its opaque pixels, minus a rim of `margin` pixels on each side. */
export function computeWaterArea(
    image: ImageData,
    frameWidth = image.width,
    margin?: number,
): CollisionRectangle | undefined {
    const bounds = computeOpaqueBounds(image, frameWidth);
    if (!bounds) return undefined;
    const rim = margin ?? getDefaultWaterMargin(bounds);
    const width = bounds.width - rim * 2;
    const height = bounds.height - rim * 2;
    if (width <= 0 || height <= 0) return undefined;
    return { x: bounds.x + rim, y: bounds.y + rim, width, height };
}

export function getDefaultWaterMargin(bounds: Pick<CollisionRectangle, "width" | "height">): number {
    return Math.round(Math.min(bounds.width, bounds.height) * DEFAULT_WATER_MARGIN_SHARE);
}

/** Smallest rectangle holding every opaque pixel of the first frame, from row `fromY` down. */
export function computeOpaqueBounds(
    image: ImageData,
    frameWidth = image.width,
    fromY = 0,
): CollisionRectangle | undefined {
    const width = Math.min(frameWidth, image.width);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    for (let y = Math.max(0, fromY); y < image.height; y++) {
        for (let x = 0; x < width; x++) {
            if (image.data[(y * image.width + x) * 4 + 3] < OPAQUE_ALPHA) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    }
    if (maxX < 0) return undefined;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
