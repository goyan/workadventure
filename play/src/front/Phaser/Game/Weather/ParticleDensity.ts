/**
 * How many times the drops and flakes of the first version of the rain (the amount at 100 %) the personal ×1 is: the
 * rain and the snow were too thin, so ×1 is this many times thicker, ×32 this many times 32.
 */
export const RAIN_AMOUNT_BASE = 5;

/** The hash salts of one more copy of the drops, flakes... of a cell: far from the salts of the others. */
export const COPY_SALT = 997;

/**
 * The most the personal amount draws (a share of ×32), seen from the ground and from a plane at its cruise altitude
 * (AIRPLANE_ALTITUDE) or higher: a choice of the players, the screen was white past these; in between it grows with the
 * altitude, so that a climb or a landing thickens or thins the rain little by little.
 */
export const GROUND_MOST_AMOUNT = 4;
export const AIR_MOST_AMOUNT = 8;
/** The altitude (map pixels) from which the rain is seen at its thickest: the cruise altitude of a plane. */
export const AIR_MOST_AT_ALTITUDE = 1024;

/** The amount drawn for a personal amount seen from this altitude (0 on the ground): never over its bound. */
export function seenAmount(amount: number, altitude: number): number {
    const height = Number.isFinite(altitude) ? Math.max(0, Math.min(1, altitude / AIR_MOST_AT_ALTITUDE)) : 0;
    const most = GROUND_MOST_AMOUNT + (AIR_MOST_AMOUNT - GROUND_MOST_AMOUNT) * height;
    return Math.min(Number.isFinite(amount) && amount > 0 ? amount : 1, most);
}

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

/**
 * The local factor of the rain and the snow under a cloud is never over this (rainUnderCloud: at most 1.4): the drops
 * and flakes of a cell that would not show even there are not looked at.
 */
export const LOCAL_MOST = 1.5;

/** The copies of each cell worth looking at when a cell never shows more than `share` of one drop (copyShown). */
export function shownCopiesBound(copies: number, share: number): number {
    return Math.min(copies, Math.ceil(copies * Math.max(0, Math.min(1, share))));
}
