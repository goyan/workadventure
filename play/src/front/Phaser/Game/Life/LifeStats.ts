/** How many samples of the history are kept: one a second, five minutes. */
export const LIFE_HISTORY_SAMPLES = 300;
/** The "last minute" of the dashboard. */
const LAST_MINUTE_MS = 60_000;

/** What the server tells of the life of the map since it began (AquaticLifeStatsMessage). */
export interface LifeTotals {
    since: number;
    arrivals: number;
    births: number;
    diedOfAge: number;
    eaten: number;
    diedDry: number;
    habitableBodies: number;
    populatedBodies: number;
    capacity: number;
}

export interface LifeEvents {
    arrivals: number;
    births: number;
    diedOfAge: number;
    eaten: number;
    diedDry: number;
}
const EVENTS = ["arrivals", "births", "diedOfAge", "eaten", "diedDry"] as const;
const noEvents = (): LifeEvents => ({ arrivals: 0, births: 0, diedOfAge: 0, eaten: 0, diedDry: 0 });

/** What the dashboard of the life tool shows. */
export interface LifeStatsView {
    males: number;
    females: number;
    /** The fish. */
    prey: number;
    /** The dolphins. */
    predators: number;
    /** Undefined without a predator. */
    preyPerPredator: number | undefined;
    /** Undefined until the server told, and when the map has no life. */
    totals: LifeTotals | undefined;
    lastMinute: LifeEvents;
    /** The prey and the predators over the last minutes, oldest first. */
    history: { prey: number; predators: number }[];
}

/**
 * The figures of the life of the water for its dashboard, from what the server tells each second: who lives now, what
 * happened over the last minute (the difference of the totals of the server), and the history of the prey and of the
 * predators since this page was opened.
 */
export class LifeStats {
    private males = 0;
    private females = 0;
    private predators = 0;
    private totals: LifeTotals | undefined;
    /** The totals of the server as they came, to know what they were a minute ago. */
    private samples: { at: number; totals: LifeTotals }[] = [];
    private history: { prey: number; predators: number }[] = [];

    public receive(animals: readonly { kind: number }[], totals: LifeTotals | undefined, now: number): void {
        this.males = this.females = this.predators = 0;
        for (const animal of animals) {
            if (animal.kind === 0) this.males++;
            else if (animal.kind === 1) this.females++;
            else if (animal.kind === 2) this.predators++;
        }
        const last = this.samples.at(-1)?.totals;
        // Totals that go back, or another start: the life was turned off and on.
        if (!totals || (last && (totals.since !== last.since || EVENTS.some((key) => totals[key] < last[key])))) {
            this.samples = [];
        }
        this.totals = totals;
        if (totals) {
            this.samples.push({ at: now, totals });
            // Kept a little beyond the minute, to find what the totals were then.
            while (this.samples.length > 2 && this.samples[1].at <= now - LAST_MINUTE_MS) this.samples.shift();
        }
        this.history.push({ prey: this.males + this.females, predators: this.predators });
        if (this.history.length > LIFE_HISTORY_SAMPLES) this.history.shift();
    }

    public view(now: number): LifeStatsView {
        const prey = this.males + this.females;
        const lastMinute = noEvents();
        const latest = this.samples.at(-1)?.totals;
        if (latest) {
            // The last sample at least a minute old, or the oldest one known.
            let then = this.samples[0].totals;
            for (const sample of this.samples) {
                if (sample.at <= now - LAST_MINUTE_MS) then = sample.totals;
            }
            for (const key of EVENTS) lastMinute[key] = Math.max(0, latest[key] - then[key]);
        }
        return {
            males: this.males,
            females: this.females,
            prey,
            predators: this.predators,
            preyPerPredator: this.predators > 0 ? prey / this.predators : undefined,
            totals: this.totals,
            lastMinute,
            history: [...this.history],
        };
    }
}
