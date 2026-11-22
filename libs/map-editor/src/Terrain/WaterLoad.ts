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

/**
 * The waters that share a thread: the time their steps take adds up, and it is the sum that holds the thread. Two
 * large rooms at 48 % of the time between two steps each would otherwise saturate it without either easing.
 */
export class WaterLoads {
    private readonly members = new Set<WaterLoad>();

    public join(load: WaterLoad): void {
        this.members.add(load);
    }

    public leave(load: WaterLoad): void {
        this.members.delete(load);
    }

    /** The time the steps of all these waters take together, as a mean (ms). */
    public totalMs(): number {
        let total = 0;
        for (const load of this.members) total += load.meanMs();
        return total;
    }

    /**
     * The thread is taken `share` of the time: every water eases at once, by the same ratio (the largest gives up
     * the most milliseconds, none is spared, none pays for the others). Their tellings are given up only when none
     * has fineness left.
     */
    public ease(share: number): void {
        let updates = true;
        for (const load of this.members) if (load.canEase()) updates = false;
        for (const load of this.members) load.ease(share, updates);
    }

    /** The thread has been quiet for a while: the tellings come back first, then a level of fineness for each. */
    public restore(): void {
        let updates = false;
        for (const load of this.members) if (load.toldLess()) updates = true;
        for (const load of this.members) load.restore(updates);
    }

    /** Forgets every water: for tests that make many. */
    public clear(): void {
        this.members.clear();
    }
}

/**
 * The waters of this thread. A module is loaded once a thread: the rooms of the server share this one, a thread
 * that computes for a few rooms has its own, and so has a browser that simulates its own water.
 */
export const threadWaterLoads = new WaterLoads();

export class WaterLoad {
    private mean = 0;
    /** The most fineness allowed now; undefined: whatever the map asks. */
    private ceiling: number | undefined;
    /** Whether the players are told once a second only: the last thing given up, the fineness being at its least. */
    private fewerUpdates = false;
    private sinceChange = STEPS_BETWEEN_CHANGES;
    private calm = 0;
    /** The fineness its map asked for at its last step. */
    private asked = 1;

    /**
     * `budgetMs`: the time between two steps of the water. `loads`: the waters it shares its thread with (those of
     * this thread when absent); it joins them at its first step.
     */
    constructor(
        private readonly budgetMs: number,
        private readonly loads: WaterLoads = threadWaterLoads,
    ) {}

    /** The share of the time between two steps this water takes, as a mean. */
    public share(): number {
        return this.mean / this.budgetMs;
    }

    /**
     * The share all the waters of the thread take together: 1 and more, the server cannot follow. It is what the
     * fineness is eased by. Every water reads the same share and eases by the same ratio: the largest gives up
     * the most milliseconds, none is spared, none pays for the others.
     */
    public threadShare(): number {
        return Math.max(this.mean, this.loads.totalMs()) / this.budgetMs;
    }

    /** The time a step of this water takes, as a mean (ms). */
    public meanMs(): number {
        return this.mean;
    }

    /** This water stops (its room closes, its map has no water any more): it weighs nothing on the thread. */
    public release(): void {
        this.loads.leave(this);
        this.mean = 0;
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
        this.loads.join(this);
        this.asked = asked;
        this.mean += (ms - this.mean) / MEAN_STEPS;
        this.sinceChange++;
        const share = this.threadShare();
        if (share > WATER_LOAD_EASE) {
            this.calm = 0;
            if (this.sinceChange < STEPS_BETWEEN_CHANGES) return;
            // All the waters of the thread ease at once, by the same ratio: the one whose step happens to be
            // timed first does not pay for the others.
            this.loads.ease(share);
        } else if (share < WATER_LOAD_RESTORE) {
            this.calm++;
            if (this.calm < CALM_STEPS || this.sinceChange < STEPS_BETWEEN_CHANGES) return;
            this.loads.restore();
        } else {
            this.calm = 0;
        }
    }

    /** Whether this water still has fineness to give up. */
    public canEase(): boolean {
        return this.precision(this.asked) > 1;
    }

    /**
     * Gives up fineness for a thread taken `share` of the time, or, with `updates`, the tellings (the last thing
     * given up, when no water of the thread has fineness left). Returns whether anything was given up.
     */
    public ease(share: number, updates: boolean): boolean {
        if (updates) {
            if (this.fewerUpdates) return false;
            this.fewerUpdates = true;
        } else {
            const current = this.precision(this.asked);
            if (current <= 1) return false;
            // The cost follows the fineness: straight to what should bring the steps back under the share, a
            // level at least.
            const aimed = Math.floor((current * WATER_LOAD_EASE) / share);
            this.ceiling = Math.max(1, Math.min(current - 1, aimed));
            // The mean still holds the cost of the fineness just left: brought to what the new one should
            // cost, or it would lower the fineness once too often.
            this.mean *= this.ceiling / current;
        }
        this.sinceChange = 0;
        this.calm = 0;
        return true;
    }

    /** Whether this water told its players less often than its map asks. */
    public toldLess(): boolean {
        return this.fewerUpdates;
    }

    /** Gives back the tellings (`updates`) or a level of fineness. Returns whether anything was given back. */
    public restore(updates: boolean): boolean {
        if (updates) {
            if (!this.fewerUpdates) return false;
            this.fewerUpdates = false;
        } else {
            if (this.ceiling === undefined) return false;
            this.mean *= (this.ceiling + 1) / this.ceiling;
            this.ceiling++;
            if (this.ceiling >= this.asked) this.ceiling = undefined;
        }
        this.sinceChange = 0;
        this.calm = 0;
        return true;
    }
}
