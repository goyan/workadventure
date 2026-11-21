/** A drop of a downpour at a moment: where it is, where it lands, and how far along its fall it is (0 to 1). */
export interface DownpourDrop {
    x: number;
    y: number;
    landX: number;
    landY: number;
    /** 0 as it leaves the cloud, 1 as it lands; from `SPLASH_FROM` on it is a splash on the ground. */
    fall: number;
}

/** A drop falls from this high over the ground, in map pixels, in this many milliseconds. */
export const DOWNPOUR_FALL_PX = 96;
const FALL_MS = 420;
/** The last part of the life of a drop is its splash. */
export const SPLASH_FROM = 0.82;
/** One drop for this many square pixels of the disc, within these bounds. */
const AREA_PER_DROP = 420;
const MIN_DROPS = 24;
const MAX_DROPS = 420;
/** The drops lean a little, as a heavy rain does. */
const LEAN = 0.18;
/** A flake comes down in this many milliseconds, swaying this many map pixels to each side. */
const FLAKE_FALL_MS = 2600;
const FLAKE_SWAY_PX = 6;

/** A number between 0 and 1 that only depends on the drop and on which one of its numbers is asked. */
function share(drop: number, salt: number): number {
    let hash = Math.imul(drop + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
    hash ^= hash >>> 13;
    return (hash >>> 0) / 0x100000000;
}

/** How many drops a downpour of that radius (map pixels) shows at once. */
export function downpourDropCount(radiusPx: number): number {
    if (!Number.isFinite(radiusPx) || radiusPx <= 0) return 0;
    return Math.min(MAX_DROPS, Math.max(MIN_DROPS, Math.round((Math.PI * radiusPx * radiusPx) / AREA_PER_DROP)));
}

/** The drops of a downpour that fall as rain when this share of it (0 to 1) falls as snow: the first of them. */
function rainDropsOf(count: number, snow: number): number {
    return Math.round(count * (1 - (Number.isFinite(snow) ? Math.min(1, Math.max(0, snow)) : 0)));
}

/**
 * The drops of a downpour around a point at a moment (ms): each always lands at the same place of the disc, one
 * fall after the other, so the rain does not flicker. In reduced motion the drops stand still, half-way. In the cold
 * a share of the downpour falls as snow (`snow`, 0 to 1): that many of its drops are flakes instead (downpourFlakes).
 */
export function downpourDrops(
    now: number,
    centre: { x: number; y: number },
    radiusPx: number,
    reducedMotion = false,
    snow = 0,
): DownpourDrop[] {
    const drops: DownpourDrop[] = [];
    const count = rainDropsOf(downpourDropCount(radiusPx), snow);
    for (let drop = 0; drop < count; drop++) {
        const distance = Math.sqrt(share(drop, 0)) * radiusPx;
        const angle = share(drop, 1) * Math.PI * 2;
        const landX = centre.x + Math.cos(angle) * distance;
        // The disc lies on the ground, seen from above at an angle: half as high as it is wide.
        const landY = centre.y + Math.sin(angle) * distance * 0.5;
        const turn = now / FALL_MS + share(drop, 2);
        const fall = reducedMotion ? 0.5 : turn - Math.floor(turn);
        const left = fall >= SPLASH_FROM ? 0 : 1 - fall / SPLASH_FROM;
        drops.push({
            x: landX + left * DOWNPOUR_FALL_PX * LEAN,
            y: landY - left * DOWNPOUR_FALL_PX,
            landX,
            landY,
            fall,
        });
    }
    return drops;
}

/**
 * The flakes of a downpour of which this share (0 to 1) falls as snow: the drops the rain leaves, each at its own
 * place of the disc, coming down slowly from as high as the drops, swaying. No splash: a flake lies where it lands.
 * In reduced motion the flakes stand still.
 */
export function downpourFlakes(
    now: number,
    centre: { x: number; y: number },
    radiusPx: number,
    snow: number,
    reducedMotion = false,
): DownpourDrop[] {
    const flakes: DownpourDrop[] = [];
    const count = downpourDropCount(radiusPx);
    for (let flake = rainDropsOf(count, snow); flake < count; flake++) {
        const distance = Math.sqrt(share(flake, 0)) * radiusPx;
        const angle = share(flake, 1) * Math.PI * 2;
        const landX = centre.x + Math.cos(angle) * distance;
        const landY = centre.y + Math.sin(angle) * distance * 0.5;
        const turn = now / FLAKE_FALL_MS + share(flake, 2);
        const fall = reducedMotion ? share(flake, 2) : turn - Math.floor(turn);
        const sway = Math.sin((fall * 3 + share(flake, 3)) * Math.PI * 2) * FLAKE_SWAY_PX * (1 - fall);
        flakes.push({ x: landX + sway, y: landY - (1 - fall) * DOWNPOUR_FALL_PX, landX, landY, fall });
    }
    return flakes;
}

/** How visible a downpour is: it comes in a fifth of a second, and fades over the last third of what it has left. */
export function downpourAlpha(sinceBegan: number, left: number, lasts: number): number {
    if (left <= 0 || lasts <= 0) return 0;
    const coming = Math.min(1, Math.max(0, sinceBegan / 200));
    const going = Math.min(1, left / (lasts / 3));
    return coming * going;
}
