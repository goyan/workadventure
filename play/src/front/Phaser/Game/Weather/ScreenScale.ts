/** Under this many screen pixels a map pixel the map is seen from far: what is a few pixels wide is left out. */
export const FAR_SCREEN_SCALE = 0.5;

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
 * Whether the map is seen from far. Leaves, puddles and the like are then a pixel each, and the whole map holds so
 * many of them that the engine spent most of an image drawing them again: they are left out.
 */
export function seenFromFar(scene: Parameters<typeof screenScale>[0]): boolean {
    return screenScale(scene) < FAR_SCREEN_SCALE;
}
