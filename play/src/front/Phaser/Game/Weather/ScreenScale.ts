/** A shape must take this many screen pixels to be told from its surroundings. */
export const DISTINGUISHABLE_SCREEN_PX = 2;
/** The size of the small things of the ground (a leaf, a row of a puddle), in map pixels. */
const SMALL_THING_PX = 4;

/**
 * Screen pixels a map pixel takes: the camera zoom over Phaser's display scale, which stretches the canvas while the
 * camera stays at 1 (Retina screens). The camera zoom alone when the display scale is unknown, and 1 without a camera.
 */
export function screenScale(scene: {
    cameras?: { main?: { zoom: number } };
    scale?: { displayScale?: { x: number } };
}): number {
    const zoom = scene.cameras?.main?.zoom;
    if (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom <= 0) return 1;
    const scale = zoom / (scene.scale?.displayScale?.x ?? NaN);
    return Number.isFinite(scale) && scale > 0 ? scale : zoom;
}

/**
 * Whether something this many map pixels wide can be told from its surroundings on screen: whether it takes
 * `screenPixels` there (2 for a shape, 1 for a movement). What cannot be told is neither drawn nor moved, at any zoom.
 */
export function distinguishable(
    scene: Parameters<typeof screenScale>[0],
    mapPixels: number,
    screenPixels = DISTINGUISHABLE_SCREEN_PX,
): boolean {
    return screenScale(scene) * mapPixels >= screenPixels;
}

/**
 * Whether the map is seen from far. Leaves, puddles and the like (4 map pixels) are then a pixel each, and the whole
 * map holds so many of them that the engine spent most of an image drawing them again: they are left out.
 */
export function seenFromFar(scene: Parameters<typeof screenScale>[0]): boolean {
    return !distinguishable(scene, SMALL_THING_PX);
}

/**
 * Screen pixels a pixel of the canvas takes: nothing is drawn finer than that. WA zooms by stretching a canvas of the
 * size of the game (a pixel of the canvas a map pixel, `displayScale` below 1), so a drop thinner than a map pixel is
 * still a whole pixel of it, as wide on the screen as the zoom. 1 when the display scale is unknown.
 */
export function canvasPixel(scene: Parameters<typeof screenScale>[0]): number {
    const scale = scene.scale?.displayScale?.x;
    return typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? 1 / scale : 1;
}

/**
 * The finest grid the canvas can draw the rain and the snow on (rainFineness): how many times a map pixel holds its
 * pixels, the camera zoom (1 when the canvas is stretched), as a power of two. A finer grid is drawn in whole pixels
 * of the canvas all the same: the flakes and the drops stay as thick on the screen as a map pixel.
 */
export function finestGrid(scene: Parameters<typeof screenScale>[0]): number {
    const zoom = scene.cameras?.main?.zoom;
    if (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom < 1) return 1;
    return 2 ** Math.floor(Math.log2(zoom));
}
