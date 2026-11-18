import { LIFE_RANGES, LifeHistory, LifeRanges } from "@workadventure/map-editor";
import type { LifeRangeName, LifeSample } from "@workadventure/map-editor";

/** The "last minute" of the dashboard. */
const LAST_MINUTE_MS = 60_000;

export interface SpeciesCount {
    species: number;
    count: number;
}

/** What the server tells of a species (AquaticSpeciesStatsMessage): who lives, and what happened since the start. */
export interface SpeciesTotals {
    /** 0: fish, 1: dolphin, 2: antelope, 3: lion, 4: tiger, 5: gull. */
    species: number;
    males: number;
    females: number;
    /** How many its places can hold. */
    cap: number;
    arrivals: number;
    births: number;
    diedOfAge: number;
    eaten: number;
    starved: number;
    diedDry: number;
    /** What it ate, by species of prey. */
    meals: SpeciesCount[];
}

const EVENTS = ["arrivals", "births", "diedOfAge", "eaten", "starved", "diedDry"] as const;
export type SpeciesEvents = Pick<SpeciesTotals, (typeof EVENTS)[number] | "meals">;

export interface SpeciesRow extends SpeciesTotals {
    /** The same events over the last minute. */
    lastMinute: SpeciesEvents;
    /** Since when it has none left after having lived (the clock of this page); undefined otherwise. */
    extinctSince: number | undefined;
}

/** A sample of the history as the messages carry it. */
interface ToldSample {
    at: number;
    prey: number;
    predators: number;
    counts: SpeciesCount[];
}

/** What the server tells of the species of the life of a map. */
export interface SpeciesTold {
    since: number;
    species: SpeciesTotals[];
    /** The history of the life, given on joining the room only (empty afterwards). */
    history: ToldSample[];
    historyStepMs: number;
    ranges: { name: string; samples: ToldSample[] }[];
}

export interface LifeSpeciesView {
    /** A row for each species the server tells of, in its order. */
    rows: SpeciesRow[];
    /** How many of each species lived (`counts`, by the number of the species), oldest first. */
    history: LifeSample[];
    ranges: Record<LifeRangeName, LifeSample[]>;
}

const sampleOf = (told: ToldSample): LifeSample => ({
    at: told.at,
    prey: told.prey,
    predators: told.predators,
    counts: Object.fromEntries(told.counts.map((entry) => [String(entry.species), entry.count])),
});

/**
 * The history the server tells, without the counts of the species: as the figures of the prey and of the predators
 * (LifeStats) read it.
 */
export function withoutSpeciesCounts<Told extends Pick<SpeciesTold, "history" | "ranges">>(
    told: Told,
): Omit<Told, "history" | "ranges"> & {
    history: LifeSample[];
    ranges: { name: string; samples: LifeSample[] }[];
} {
    const bare = ({ at, prey, predators }: ToldSample): LifeSample => ({ at, prey, predators });
    return {
        ...told,
        history: told.history.map(bare),
        ranges: told.ranges.map((range) => ({ name: range.name, samples: range.samples.map(bare) })),
    };
}

/**
 * The figures of the life species by species, for its dashboard, from what the server tells each second: who lives,
 * what happened over the last minute (the difference of the totals of the server), which species died out, and how
 * many of each lived over time (what the server kept until this page joined, then what it is told).
 */
export class LifeSpeciesStats {
    private since: number | undefined;
    private latest: SpeciesTotals[] = [];
    /** The totals of the server as they came, to know what they were a minute ago. */
    private samples: { at: number; species: SpeciesTotals[] }[] = [];
    private extinct = new Map<number, number>();
    private history = new LifeHistory();
    private ranges = new LifeRanges();
    private counts: Record<string, number> = {};

    public receive(animals: readonly { kind: number }[], told: SpeciesTold | undefined, now: number): void {
        const species = told?.species ?? [];
        const last = this.samples.at(-1)?.species;
        const wentBack = species.some((entry) => {
            const before = last?.find((other) => other.species === entry.species);
            return before !== undefined && EVENTS.some((key) => entry[key] < before[key]);
        });
        // Nothing told, totals that go back, or another start: the life was turned off and on.
        if (!told || species.length === 0 || told.since !== this.since || wentBack) {
            this.samples = [];
            this.extinct.clear();
            this.history.clear();
            this.ranges.clear();
        }
        this.since = told?.since;
        this.latest = species;
        if (!told || species.length === 0) return;
        // On joining, the server gives the history it kept.
        if (told.history.length > 0) {
            this.history = LifeHistory.from({ stepMs: told.historyStepMs, samples: told.history.map(sampleOf) });
        }
        if (told.ranges.length > 0) {
            this.ranges = LifeRanges.from(
                Object.fromEntries(told.ranges.map((range) => [range.name, range.samples.map(sampleOf)])),
            );
        }
        this.samples.push({ at: now, species });
        // Kept a little beyond the minute, to find what the totals were then.
        while (this.samples.length > 2 && this.samples[1].at <= now - LAST_MINUTE_MS) this.samples.shift();
        for (const entry of species) {
            const lived = entry.arrivals + entry.births > 0;
            if (entry.males + entry.females > 0 || !lived) this.extinct.delete(entry.species);
            else if (!this.extinct.has(entry.species)) this.extinct.set(entry.species, now);
        }
        this.counts = {};
        for (const animal of animals) {
            const key = String(animal.kind >> 1);
            this.counts[key] = (this.counts[key] ?? 0) + 1;
        }
        const sample = { at: now, prey: 0, predators: 0, counts: this.counts };
        this.history.add(sample);
        this.ranges.add(sample);
    }

    public view(now: number): LifeSpeciesView {
        // The last sample at least a minute old, or the oldest one known.
        let then = this.samples.length > 0 ? this.samples[0].species : [];
        for (const sample of this.samples) {
            if (sample.at <= now - LAST_MINUTE_MS) then = sample.species;
        }
        const rows = this.latest.map((entry): SpeciesRow => {
            const before = then.find((other) => other.species === entry.species);
            const lastMinute: SpeciesEvents = {
                arrivals: 0,
                births: 0,
                diedOfAge: 0,
                eaten: 0,
                starved: 0,
                diedDry: 0,
                meals: [],
            };
            for (const key of EVENTS) lastMinute[key] = Math.max(0, entry[key] - (before?.[key] ?? entry[key]));
            for (const meal of entry.meals) {
                const eatenBefore = before
                    ? (before.meals.find((other) => other.species === meal.species)?.count ?? 0)
                    : meal.count;
                if (meal.count > eatenBefore)
                    lastMinute.meals.push({ species: meal.species, count: meal.count - eatenBefore });
            }
            return { ...entry, lastMinute, extinctSince: this.extinct.get(entry.species) };
        });
        const ranges = { "5min": [], "1h": [], "4h": [], "1d": [] } as Record<LifeRangeName, LifeSample[]>;
        for (const range of LIFE_RANGES) {
            const samples = this.ranges.samples(range.name).filter((sample) => sample.at >= now - range.spanMs);
            // The samples of a long range are minutes apart: the curve goes on to the present.
            const last = samples.at(-1);
            if (this.latest.length > 0 && (!last || last.at < now)) {
                samples.push({ at: now, prey: 0, predators: 0, counts: this.counts });
            }
            ranges[range.name] = samples;
        }
        return { rows, history: [...this.history.samples], ranges };
    }
}

/** A curve leaves a little room above its largest value. */
const HEADROOM = 1.1;

/**
 * A line for each species in a box, each on its own scale (its largest value near the top, given as `max`): each
 * sample at its time, oldest on the left. A single sample stands in the middle. With a `window`, the box covers that
 * time.
 */
export function speciesChart(
    samples: readonly LifeSample[],
    species: readonly number[],
    width: number,
    height: number,
    window?: { from: number; to: number },
): { species: number; max: number; points: string }[] {
    const countOf = (sample: LifeSample, id: number): number => sample.counts?.[String(id)] ?? 0;
    const first = window ? window.from : (samples[0]?.at ?? 0);
    const span = (window ? window.to : (samples.at(-1)?.at ?? 0)) - first;
    return species.map((id) => {
        const max = Math.max(1, ...samples.map((sample) => countOf(sample, id)));
        return {
            species: id,
            max,
            points: samples
                .map((sample) => {
                    const x = span > 0 ? ((sample.at - first) / span) * width : width / 2;
                    const y = height * (1 - countOf(sample, id) / (max * HEADROOM));
                    return `${Math.round(x)},${Math.round(y)}`;
                })
                .join(" "),
        };
    });
}
