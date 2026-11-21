/** A flame of the fire a player holds, at a moment: where its foot stands on the ground, and how big it is now. */
export interface TorchFlame {
    x: number;
    y: number;
    /** How high the flame stands at this moment, in map pixels, and how high it may stand at most. */
    height: number;
    tall: number;
    width: number;
}

/** One flame for this many square pixels of the disc, within these bounds. */
const AREA_PER_FLAME = 1100;
const MIN_FLAMES = 5;
const MAX_FLAMES = 90;
/** The tallest flames stand this high, in map pixels; the smallest a third of it. */
const FLAME_TALL_PX = 46;
/** A flame beats in about this many milliseconds, each at its own pace. */
const FLICKER_MS = 260;

/** A number between 0 and 1 that only depends on the flame and on which one of its numbers is asked. */
function share(flame: number, salt: number): number {
    let hash = Math.imul(flame + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
    hash ^= hash >>> 13;
    return (hash >>> 0) / 0x100000000;
}

/** How many flames a fire of that radius (map pixels) shows at once. */
export function torchFlameCount(radiusPx: number): number {
    if (!Number.isFinite(radiusPx) || radiusPx <= 0) return 0;
    return Math.min(MAX_FLAMES, Math.max(MIN_FLAMES, Math.round((Math.PI * radiusPx * radiusPx) / AREA_PER_FLAME)));
}

/**
 * The flames of the fire a player holds around a point at a moment (ms): each stands at its own place of the disc
 * and flickers at its own beat, taller towards the middle. From the back of the disc to its front, so that drawn in
 * that order the near flames stand before the far ones. In reduced motion the flames stand still.
 */
export function torchFlames(
    now: number,
    centre: { x: number; y: number },
    radiusPx: number,
    reducedMotion = false,
): TorchFlame[] {
    const flames: TorchFlame[] = [];
    const count = torchFlameCount(radiusPx);
    for (let flame = 0; flame < count; flame++) {
        const reach = Math.sqrt(share(flame, 0));
        const angle = share(flame, 1) * Math.PI * 2;
        // The disc lies on the ground, seen from above at an angle: half as high as it is wide.
        const x = centre.x + Math.cos(angle) * reach * radiusPx;
        const y = centre.y + Math.sin(angle) * reach * radiusPx * 0.5;
        const tall = FLAME_TALL_PX * (0.35 + 0.65 * (1 - reach) * (0.6 + 0.4 * share(flame, 2)));
        const beat = reducedMotion ? 0.25 : now / (FLICKER_MS * (0.7 + 0.6 * share(flame, 3))) + share(flame, 4);
        const flicker = 0.72 + 0.28 * Math.sin(beat * Math.PI * 2);
        flames.push({ x, y, height: tall * flicker, tall, width: tall * (0.42 + 0.12 * share(flame, 5)) });
    }
    return flames.sort((a, b) => a.y - b.y);
}
