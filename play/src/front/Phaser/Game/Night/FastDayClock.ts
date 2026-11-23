/** The slowest and the fastest a player may speed the day up: minutes of sky a second. */
export const FAST_DAY_SLOWEST = 1;
export const FAST_DAY_FASTEST = 10;

/** Milliseconds of sky that go by in a millisecond, at a speed of `speed` minutes of sky a second. */
function skyRate(speed: number): number {
    return speed * 60;
}

/** A speed of the day within the bounds, whole. */
export function fastDaySpeed(speed: number): number {
    if (!Number.isFinite(speed)) return FAST_DAY_SLOWEST;
    return Math.min(FAST_DAY_FASTEST, Math.max(FAST_DAY_SLOWEST, Math.round(speed)));
}

/**
 * The day and the night sped up for one player: the sky they see goes `speed` minutes a second, from the moment they
 * turned it on, ahead of the real one. A change of speed goes on from the sky reached; turned off, the sky is the real
 * one again. Only what this browser shows moves: the time of the map, its weather, its ice and its water are the
 * server's.
 */
export class FastDayClock {
    /** The real instant (ms) the speed last changed at, and how far ahead the sky was then; undefined while off. */
    private from: { at: number; ahead: number; speed: number } | undefined;

    /** How far ahead of the real one the sky is at the real instant `at` (ms, steadily rising), 0 while off. */
    public ahead(at: number, on: boolean, speed: number): number {
        if (!on) {
            this.from = undefined;
            return 0;
        }
        const wanted = fastDaySpeed(speed);
        if (!this.from) {
            this.from = { at, ahead: 0, speed: wanted };
        } else if (this.from.speed !== wanted) {
            this.from = { at, ahead: this.aheadAt(at), speed: wanted };
        }
        return this.aheadAt(at);
    }

    private aheadAt(at: number): number {
        const from = this.from;
        if (!from) return 0;
        // The real time goes by too: only what goes faster than it is ahead.
        return from.ahead + Math.max(0, at - from.at) * (skyRate(from.speed) - 1);
    }
}
