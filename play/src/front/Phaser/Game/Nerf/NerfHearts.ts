/**
 * Hearts of the players who carry a Nerf: a dart from another equipped player takes a third of a heart, the hearts come
 * back when nobody hits them for a while, and a player who loses them all is sent to the prison. Nothing is saved.
 */

/** Hearts shown. */
export const NERF_HEARTS = 5;
/** A dart takes a third of a heart: darts can be fired every 300 ms, a whole heart per dart would end a duel too fast. */
export const NERF_THIRDS_PER_HEART = 3;
/** Full health, in thirds. */
export const NERF_MAX_THIRDS = NERF_HEARTS * NERF_THIRDS_PER_HEART;
/** Time without being hit before the hearts start coming back. */
export const NERF_REGEN_DELAY_MS = 4000;
/** Then a third comes back at this rhythm. */
export const NERF_REGEN_STEP_MS = 1000;

/**
 * `base` is the number of thirds left after the last hit, at `since`; the thirds regained since are computed from the
 * time, so that a tab left in the background comes back with the right count.
 */
export interface NerfHeartsState {
    base: number;
    since: number | undefined;
    jailed: boolean;
}

export function fullHearts(): NerfHeartsState {
    return { base: NERF_MAX_THIRDS, since: undefined, jailed: false };
}

/** Thirds of heart at `now`. */
export function thirdsAt(state: NerfHeartsState, now: number): number {
    if (state.jailed) return 0;
    if (state.since === undefined) return state.base;
    const quiet = now - state.since;
    const regained =
        quiet >= NERF_REGEN_DELAY_MS ? Math.floor((quiet - NERF_REGEN_DELAY_MS) / NERF_REGEN_STEP_MS) + 1 : 0;
    return Math.min(NERF_MAX_THIRDS, state.base + regained);
}

/** A dart that counts: a third less, and the player is eliminated when none is left. A jailed player is untouched. */
export function hit(state: NerfHeartsState, now: number): { state: NerfHeartsState; eliminated: boolean } {
    if (state.jailed) return { state, eliminated: false };
    const left = thirdsAt(state, now) - 1;
    if (left <= 0) return { state: { base: 0, since: undefined, jailed: true }, eliminated: true };
    return { state: { base: left, since: now, jailed: false }, eliminated: false };
}

/** Out of the prison: five hearts again. */
export function release(): NerfHeartsState {
    return fullHearts();
}

/** Darts only hurt between two equipped players, and neither side of the shot may be in the prison. */
export function countsAsHit(conditions: {
    targetEquipped: boolean;
    targetInPrison: boolean;
    shooterEquipped: boolean;
    shotFromPrison: boolean;
}): boolean {
    return (
        conditions.targetEquipped &&
        !conditions.targetInPrison &&
        conditions.shooterEquipped &&
        !conditions.shotFromPrison
    );
}

/** Thirds shown in the heart `index` (0 to 4, left to right). */
export function heartFill(thirds: number, index: number): 0 | 1 | 2 | 3 {
    const fill = Math.max(0, Math.min(NERF_THIRDS_PER_HEART, thirds - index * NERF_THIRDS_PER_HEART));
    return fill as 0 | 1 | 2 | 3;
}

/** Whether the thirds another player publishes went down: they were hit, and their avatar blinks. */
export function heartsDropped(previous: number | undefined, next: number | undefined): boolean {
    return previous !== undefined && next !== undefined && next < previous;
}
