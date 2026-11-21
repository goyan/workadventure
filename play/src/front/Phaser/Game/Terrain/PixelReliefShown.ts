/**
 * Whether the relief is shown in 3/4 now, its ground in pixel art (GameScene.pixelReliefShown), for what draws around
 * the ground far from the scene: the pools placed as images, the leaves lying on the ground, the grass of the map. The
 * scene tells how to read it while it lives; without a scene, it is not.
 */
let read: (() => boolean) | undefined;

/** Told by the scene when its map is set up, and with nothing when it is destroyed. */
export function tellPixelReliefShown(reader: (() => boolean) | undefined): void {
    read = reader;
}

export function pixelReliefShownNow(): boolean {
    return read?.() === true;
}
