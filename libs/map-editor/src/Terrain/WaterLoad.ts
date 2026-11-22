/**
 * The load the water of a map puts on the server, and what it gives up to stay light: the server of the rooms has
 * one thread, so a step of the water that takes as long as the time between two steps holds back everything else
 * (the moves of the players, the chat, the other rooms). The fineness of the computation the map asked for is then
 * a ceiling: it is lowered while the steps are slow, and comes back when they are quick again.
 */

/** Over this share of the time between two steps, the fineness is lowered. */
export const WATER_LOAD_EASE = 0.5;
/** Under this share for a while, it is given back: half the other, so that the two never chase each other. */
export const WATER_LOAD_RESTORE = 0.25;
/** The time of a step is a mean over about these many steps (2 s): one slow step alone changes nothing. */
const MEAN_STEPS = 20;
/** After a change, these many steps go by before another: the mean must follow first. */
const STEPS_BETWEEN_CHANGES = 20;
/** These many quick steps in a row (10 s) give a level of fineness back. */
const CALM_STEPS = 100;

export class WaterLoad {
    private mean = 0;
    /** The most fineness allowed now; undefined: whatever the map asks. */
    private ceiling: number | undefined;
    /** Whether the players are told once a second only: the last thing given up, the fineness being at its least. */
    private fewerUpdates = false;
    private sinceChange = STEPS_BETWEEN_CHANGES;
    private calm = 0;

    /** `budgetMs`: the time between two steps of the water. */
    constructor(private readonly budgetMs: number) {}

    /** The share of the time between two steps the water takes, as a mean: 1 and more, the server cannot follow. */
    public share(): number {
        return this.mean / this.budgetMs;
    }

    /** The fineness to compute with, for a map that asks for `asked`: never more, never under 1. */
    public precision(asked: number): number {
        return Math.max(1, this.ceiling === undefined ? asked : Math.min(asked, this.ceiling));
    }

    /** How often the players are told a second, for a map that asks for `asked`. */
    public updates(asked: number): number {
        return this.fewerUpdates ? Math.min(asked, 1) : asked;
    }

    /** A step took `ms` on a map that asks for the fineness `asked`. */
    public record(ms: number, asked: number): void {
        if (!Number.isFinite(ms) || ms < 0) return;
        this.mean += (ms - this.mean) / MEAN_STEPS;
        this.sinceChange++;
        const share = this.share();
        if (share > WATER_LOAD_EASE) {
            this.calm = 0;
            if (this.sinceChange < STEPS_BETWEEN_CHANGES) return;
            const current = this.precision(asked);
            if (current > 1) {
                // The cost follows the fineness: straight to what should bring the step back under the share, a
                // level at least.
                const aimed = Math.floor((current * WATER_LOAD_EASE) / share);
                this.ceiling = Math.max(1, Math.min(current - 1, aimed));
                // The mean still holds the cost of the fineness just left: brought to what the new one should
                // cost, or it would lower the fineness once too often.
                this.mean *= this.ceiling / current;
            } else if (!this.fewerUpdates) {
                this.fewerUpdates = true;
            } else {
                return;
            }
            this.sinceChange = 0;
        } else if (share < WATER_LOAD_RESTORE) {
            this.calm++;
            if (this.calm < CALM_STEPS || this.sinceChange < STEPS_BETWEEN_CHANGES) return;
            this.calm = 0;
            if (this.fewerUpdates) {
                this.fewerUpdates = false;
            } else if (this.ceiling !== undefined) {
                this.mean *= (this.ceiling + 1) / this.ceiling;
                this.ceiling++;
                if (this.ceiling >= asked) this.ceiling = undefined;
            } else {
                return;
            }
            this.sinceChange = 0;
        } else {
            this.calm = 0;
        }
    }
}
