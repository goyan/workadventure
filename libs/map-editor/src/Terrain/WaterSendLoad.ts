/**
 * The network the water of a room takes, for each of its players: the states it is told are as big as the water that
 * moves (a whole map flooded and running: over 100 kB a state on the map of the entry). Over a budget, the room is told
 * fewer states a second, down to one, and more again once they are small for a while: as WaterLoad does for the time
 * of the computation. The settings saved in the map do not change.
 */

/**
 * The most a player is sent of the water of a room, in bytes a second: 100 kB, under a megabit a second, so that a
 * slow network (2 Mbit/s and less) keeps room for the voices, the videos and the rest of the game. A calm lake on the
 * map of the entry (about 10 to 15 kB a state) stays at five states a second; a sea of 600 by 600 cells that runs
 * goes to two; a whole map flooded, to one.
 */
export const WATER_SEND_BUDGET_BYTES_PER_SECOND = 100_000;
/** The size of a state is a mean over about these many states: one big state alone changes nothing. */
const MEAN_STATES = 5;
/** Under this share of the budget at the next cadence up, for CALM_STEPS steps, a level of cadence is given back. */
const RESTORE_SHARE = 0.5;
/** These many steps of the water (10 s) under that share give a level back: never two changes chasing each other. */
const CALM_STEPS = 100;

export class WaterSendLoad {
    /** `budget`: bytes a second a player may be sent (Infinity where nothing travels, in a browser). */
    constructor(private readonly budget: number = WATER_SEND_BUDGET_BYTES_PER_SECOND) {}

    /** The mean size of a state told, in bytes. */
    private mean = 0;
    /** The most states a second allowed now; undefined: whatever the map asks. */
    private ceiling: number | undefined;
    /** The step since which the states are small enough to tell more of them; undefined while they are not. */
    private calmSince: number | undefined;

    /** How many states a second the room is told, for a map that asks for `asked`: never more, never under 1. */
    public updates(asked: number): number {
        return Math.max(1, this.ceiling === undefined ? asked : Math.min(asked, this.ceiling));
    }

    /**
     * How many steps of the water a state waits at least so that the states keep under the budget, the room being
     * told fewer than one a second if it must: what the sea of a tsunami asks for, a whole map flooded and running for
     * minutes (WaterSimulation). Never fewer than `steps`; `steps` until a state was told.
     */
    public stepsUnderBudget(steps: number, stepsPerSecond: number): number {
        if (!(this.mean > 0) || !Number.isFinite(this.budget) || !(this.budget > 0)) return steps;
        return Math.max(steps, Math.ceil((this.mean / this.budget) * stepsPerSecond));
    }

    /** Whether the room is told no more than one state a second though the map asks more: the network is short. */
    public atFloor(asked: number): boolean {
        return asked > 1 && this.updates(asked) <= 1;
    }

    /** A state of `bytes` (all its parts zipped) was told at the step `step`, on a map that asks for `asked` a second. */
    public record(bytes: number, asked: number, step: number): void {
        if (!Number.isFinite(bytes) || bytes < 0) return;
        this.mean = this.mean === 0 ? bytes : this.mean + (bytes - this.mean) / MEAN_STATES;
        const cadence = this.updates(asked);
        if (this.mean * cadence > this.budget) {
            this.calmSince = undefined;
            if (cadence <= 1) return;
            // Straight to what keeps under the budget, a level at least.
            this.ceiling = Math.max(1, Math.min(cadence - 1, Math.floor(this.budget / this.mean)));
            return;
        }
        if (this.ceiling === undefined) return;
        const next = Math.min(asked, cadence + 1);
        if (this.mean * next >= this.budget * RESTORE_SHARE) {
            this.calmSince = undefined;
            return;
        }
        this.calmSince ??= step;
        if (step - this.calmSince < CALM_STEPS) return;
        this.calmSince = step;
        this.ceiling = next >= asked ? undefined : next;
    }
}
