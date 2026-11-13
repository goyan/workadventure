/**
 * Whether a tween of the scene needs the next image drawn: one that runs does, one kept paused for later (the ring of
 * the walk destination, between two walks) does not, or the whole map would be drawn again at every image for nothing.
 */
export function hasRunningTween(tweens: readonly { isPaused(): boolean }[]): boolean {
    return tweens.some((tween) => !tween.isPaused());
}
