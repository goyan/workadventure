/**
 * How many times the drops and flakes of the first version of the rain (the amount at 100 %) the personal ×1 is: the
 * rain and the snow were too thin, so ×1 is this many times thicker, ×32 this many times 32.
 */
export const RAIN_AMOUNT_BASE = 5;

/** The hash salts of one more copy of the drops, flakes... of a cell: far from the salts of the others. */
export const COPY_SALT = 997;

/**
 * The most drops (or flakes) the processor draws in each cell when the graphics card cannot draw them
 * (PrecipitationLayer): each is a line or a few squares to work out at every image, so the rain is thinner there.
 */
export const MAX_DRAWN_COPIES = 2;

/**
 * How many drops (or flakes) each cell of the rain may hold for a personal amount (×1 to ×32): RAIN_AMOUNT_BASE times
 * the amount, so ×1 holds five times the drops of the first version. `most` bounds it (MAX_DRAWN_COPIES on the
 * processor). The same sizes, the same wind: more drops, never thicker ones.
 */
export function cellCopies(amount: number, most = Infinity): number {
    const wanted = Math.round((Number.isFinite(amount) && amount > 0 ? amount : 1) * RAIN_AMOUNT_BASE);
    return Math.max(1, Math.min(most, wanted));
}

/**
 * Whether the copy `copy` of a cell holding `copies` shows, `share` (0 to 1) of a cell showing one drop at the amount of
 * the first version, `pick` its own hash (0 to 1): the first floor(copies × share) copies always show and the next one
 * when its hash is under what is left. With one copy, a drop shows when its hash is under the share, as before. A
 * heavier rain only adds drops (the same first), and a cell never holds one more than its share: no copy is looked at
 * for nothing (shownCopiesBound).
 */
export function copyShown(copy: number, copies: number, share: number, pick: number): boolean {
    const wanted = copies * Math.max(0, Math.min(1, share));
    const whole = Math.floor(wanted);
    return copy < whole || (copy === whole && pick < wanted - whole);
}

/** The copies of each cell worth looking at when a cell never shows more than `share` of one drop (copyShown). */
export function shownCopiesBound(copies: number, share: number): number {
    return Math.min(copies, Math.ceil(copies * Math.max(0, Math.min(1, share))));
}
