/** The hash salts of one more copy of the drops, flakes... of a cell: far from the salts of the others. */
export const COPY_SALT = 997;

/**
 * The most drops (or flakes) drawn in each cell, whatever the personal amount: drawing one is a line (or a few
 * squares) for the graphics card, so 32 times the rain at every image is not drawn as 32 copies.
 */
export const MAX_COPIES = 3;

export interface DensityPlan {
    copies: number;
    boost: number;
}

/**
 * How a personal amount (a number of times the usual rain or snow, 1 to 32) is drawn: `copies` drops in each cell, at
 * most MAX_COPIES, and the rest of the amount as `boost` (1 or more), how many times thicker each one is drawn to fill
 * the screen as the missing copies would (see boostedAlpha). Under the cap, `copies` is the amount and `boost` is 1.
 */
export function densityPlan(amount: number): DensityPlan {
    const wanted = Number.isFinite(amount) ? Math.max(1, amount) : 1;
    const copies = Math.min(MAX_COPIES, Math.max(1, Math.round(wanted)));
    return { copies, boost: wanted / copies };
}

/** The opacity of `boost` layers of a drop of this opacity over each other: what the copies left out would have drawn. */
export function boostedAlpha(alpha: number, boost: number): number {
    return boost <= 1 ? alpha : 1 - (1 - Math.min(1, alpha)) ** boost;
}

/** How many times wider or bigger each drop or flake is drawn when `boost` layers of it are left out (at most twice). */
export function boostedSize(boost: number): number {
    return boost <= 1 ? 1 : Math.min(2, Math.sqrt(boost));
}
