import { LifeHistory } from "@workadventure/map-editor";
import type { LifeSample } from "@workadventure/map-editor";

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
    /** The dolphins: calves born, and deaths of age or of hunger. */
    predatorBirths: number;
    predatorDeaths: number;
    habitableBodies: number;
    populatedBodies: number;
    capacity: number;
    /** The history of the life, given on joining the room only (empty afterwards). */
    history: LifeSample[];
    historyStepMs: number;
}

export interface LifeEvents {
    arrivals: number;
    births: number;
    diedOfAge: number;
    eaten: number;
    diedDry: number;
    predatorBirths: number;
    predatorDeaths: number;
}
const EVENTS = ["arrivals", "births", "diedOfAge", "eaten", "diedDry", "predatorBirths", "predatorDeaths"] as const;
const noEvents = (): LifeEvents => ({
    arrivals: 0,
    births: 0,
    diedOfAge: 0,
    eaten: 0,
    diedDry: 0,
    predatorBirths: 0,
    predatorDeaths: 0,
});

/** What the dashboard of the life tool shows. */
export interface LifeStatsView {
    males: number;
    females: number;
    /** The fish. */
    prey: number;
    /** The dolphins. */
    predators: number;
    predatorMales: number;
    predatorFemales: number;
    /** Undefined without a predator. */
    preyPerPredator: number | undefined;
    /** Undefined until the server told, and when the map has no life. */
    totals: LifeTotals | undefined;
    lastMinute: LifeEvents;
    /** The prey and the predators over the whole life of the map, oldest first. */
    history: LifeSample[];
}

/**
 * The figures of the life of the water for its dashboard, from what the server tells each second: who lives now, what
 * happened over the last minute (the difference of the totals of the server), and the history of the prey and of the
 * predators (the one the server kept until this page joined, then what it is told).
 */
export class LifeStats {
    private males = 0;
    private females = 0;
    private predatorMales = 0;
    private predatorFemales = 0;
    private totals: LifeTotals | undefined;
    /** The totals of the server as they came, to know what they were a minute ago. */
    private samples: { at: number; totals: LifeTotals }[] = [];
    private history = new LifeHistory();

    public receive(animals: readonly { kind: number }[], totals: LifeTotals | undefined, now: number): void {
        this.males = this.females = this.predatorMales = this.predatorFemales = 0;
        for (const animal of animals) {
            if (animal.kind === 0) this.males++;
            else if (animal.kind === 1) this.females++;
            else if (animal.kind === 2) this.predatorMales++;
            else if (animal.kind === 3) this.predatorFemales++;
        }
        const predators = this.predatorMales + this.predatorFemales;
        const last = this.samples.at(-1)?.totals;
        // Totals that go back, or another start: the life was turned off and on.
        if (!totals || (last && (totals.since !== last.since || EVENTS.some((key) => totals[key] < last[key])))) {
            this.samples = [];
            this.history.clear();
        }
        // On joining, the server gives the history it kept.
        if (totals && totals.history.length > 0) {
            this.history = LifeHistory.from({ stepMs: totals.historyStepMs, samples: totals.history });
        }
        this.totals = totals;
        if (totals) {
            this.samples.push({ at: now, totals });
            // Kept a little beyond the minute, to find what the totals were then.
            while (this.samples.length > 2 && this.samples[1].at <= now - LAST_MINUTE_MS) this.samples.shift();
        }
        if (totals) this.history.add({ at: now, prey: this.males + this.females, predators });
    }

    public view(now: number): LifeStatsView {
        const prey = this.males + this.females;
        const predators = this.predatorMales + this.predatorFemales;
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
            predators,
            predatorMales: this.predatorMales,
            predatorFemales: this.predatorFemales,
            preyPerPredator: predators > 0 ? prey / predators : undefined,
            totals: this.totals,
            lastMinute,
            history: [...this.history.samples],
        };
    }
}

/**
 * The points of a curve of the history in a box: each sample at its time (oldest on the left), `max` at the top.
 * A single sample stands in the middle.
 */
export function chartPoints(
    samples: readonly LifeSample[],
    key: "prey" | "predators",
    max: number,
    width: number,
    height: number,
): string {
    if (samples.length === 0) return "";
    const first = samples[0].at;
    const span = samples[samples.length - 1].at - first;
    return samples
        .map((sample) => {
            const x = span > 0 ? ((sample.at - first) / span) * width : width / 2;
            const y = height * (1 - (max > 0 ? sample[key] / max : 0));
            return `${Math.round(x)},${Math.round(y)}`;
        })
        .join(" ");
}
