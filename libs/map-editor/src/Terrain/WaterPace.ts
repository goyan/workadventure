/**
 * How many steps of the time of its map the water lives in a step of the real clock: a map whose water goes S times
 * faster than reality lives S steps of 0.1 s of its time in each step of 0.1 s of the real one, as long as the machine
 * holds it (half the time between two steps at most, WATER_PACE_SHARE); fewer otherwise, so that the water never goes
 * faster than it can be computed. Measured all along, as WaterLoad does for the fineness: it climbs a few seconds
 * after a map asks, falls at once when the steps grow costly.
 */

/** The share of the time between two steps the water may take to live faster than reality. */
export const WATER_PACE_SHARE = 0.5;
/** Under this share, steps after steps, the pace may climb. */
const CLIMB_SHARE = 0.25;
/** The time of a step is a mean over about these many steps (half a second). */
const MEAN_STEPS = 5;
/** These many quick steps in a row (a second) let the pace double. */
const CALM_STEPS = 10;

export class WaterPace {
    /** The mean time of a sub-step (ms). */
    private meanEach = 0;
    /** The most steps of its time the water lives in a real step now. */
    private ceiling = 1;
    private calm = 0;

    /** `budgetMs`: the time between two steps of the real clock. */
    constructor(private readonly budgetMs: number) {}

    /** The steps of its time the water lives in this real step, for a map that asks for `asked` (1 and more). */
    public times(asked: number): number {
        const wanted = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : 1;
        return Math.max(1, Math.min(wanted, this.ceiling));
    }

    /** A real step of the water took `ms`, on a map that asks for `asked`, living `times(asked)` steps of its time. */
    public record(ms: number, asked: number): void {
        if (!Number.isFinite(ms) || ms < 0) return;
        const times = this.times(asked);
        const each = ms / times;
        this.meanEach = this.meanEach === 0 ? each : this.meanEach + (each - this.meanEach) / MEAN_STEPS;
        const budget = this.budgetMs * WATER_PACE_SHARE;
        const share = (this.meanEach * times) / this.budgetMs;
        if (share > WATER_PACE_SHARE) {
            this.calm = 0;
            // Straight to what the machine holds, a step at least.
            this.ceiling = Math.max(1, Math.min(times - 1, Math.floor(budget / this.meanEach)));
            return;
        }
        if (share >= CLIMB_SHARE || times >= asked) {
            this.calm = 0;
            return;
        }
        this.calm++;
        if (this.calm < CALM_STEPS) return;
        this.calm = 0;
        // Doubled, never over what keeps under the half of the time between two steps.
        this.ceiling = Math.max(times, Math.min(times * 2, Math.floor(budget / Math.max(this.meanEach, 1e-6))));
    }
}
