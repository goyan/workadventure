import { z } from "zod";

/** A sample of the history is kept this often at first. */
export const LIFE_HISTORY_STEP_MS = 5000;
/** The most samples kept: beyond, one out of two is dropped and the samples come half as often. */
export const LIFE_HISTORY_MAX = 360;

export const LifeSample = z.object({
    at: z.number().finite(),
    prey: z.number().int().min(0),
    predators: z.number().int().min(0),
    /** How many of each species lived then; absent from a sample taken before the species were counted. */
    counts: z.record(z.string(), z.number().int().min(0)).optional(),
});
export type LifeSample = z.infer<typeof LifeSample>;

const SavedHistory = z.object({
    stepMs: z.number().positive(),
    samples: z.array(LifeSample).max(LIFE_HISTORY_MAX),
});

/**
 * How many prey and predators lived in the water of a map over time, for the curve of the life tool. It covers the
 * whole life of the map with a bounded number of samples: when full, it keeps one sample out of two and takes the
 * next ones half as often (five seconds apart for the first half hour, ten for the next hour…).
 */
export class LifeHistory {
    public samples: LifeSample[] = [];
    public stepMs = LIFE_HISTORY_STEP_MS;

    public add(sample: LifeSample): void {
        const last = this.samples.length > 0 ? this.samples[this.samples.length - 1] : undefined;
        if (last && sample.at - last.at < this.stepMs) return;
        this.samples.push(sample);
        if (this.samples.length > LIFE_HISTORY_MAX) {
            this.samples = this.samples.filter((_, index) => index % 2 === 0);
            this.stepMs *= 2;
        }
    }

    public clear(): void {
        this.samples = [];
        this.stepMs = LIFE_HISTORY_STEP_MS;
    }

    public save(): { stepMs: number; samples: LifeSample[] } {
        return { stepMs: this.stepMs, samples: this.samples };
    }

    /** The history that was saved, or an empty one when it cannot be read. */
    public static from(saved: unknown): LifeHistory {
        const history = new LifeHistory();
        const read = SavedHistory.safeParse(saved);
        if (read.success) {
            history.samples = read.data.samples;
            history.stepMs = read.data.stepMs;
        }
        return history;
    }
}

/**
 * The ranges of time the curve of the life tool can show, each with its own samples: how far back it goes, and how
 * far apart its samples are (about 120 samples each).
 */
export const LIFE_RANGES = [
    { name: "5min", spanMs: 5 * 60_000, stepMs: 2500 },
    { name: "1h", spanMs: 60 * 60_000, stepMs: 30_000 },
    { name: "4h", spanMs: 4 * 60 * 60_000, stepMs: 2 * 60_000 },
    { name: "1d", spanMs: 24 * 60 * 60_000, stepMs: 10 * 60_000 },
] as const;
export type LifeRangeName = (typeof LIFE_RANGES)[number]["name"];
/** No range keeps more samples than this. */
export const LIFE_RANGE_MAX = 150;

const SavedRange = z.array(LifeSample).max(LIFE_RANGE_MAX);

/**
 * The prey and the predators over the last five minutes, hour, four hours and day: for each range, a sample every
 * step of that range, and nothing older than the range. Unlike `LifeHistory`, the recent past stays fine however old
 * the life of the map is.
 */
export class LifeRanges {
    private kept = new Map<LifeRangeName, LifeSample[]>();

    public add(sample: LifeSample): void {
        for (const range of LIFE_RANGES) {
            const samples = this.samples(range.name);
            const last = samples.length > 0 ? samples[samples.length - 1] : undefined;
            if (last && sample.at - last.at < range.stepMs) continue;
            samples.push(sample);
            while (samples[0].at < sample.at - range.spanMs || samples.length > LIFE_RANGE_MAX) samples.shift();
            this.kept.set(range.name, samples);
        }
    }

    /** The samples of a range, oldest first. */
    public samples(name: LifeRangeName): LifeSample[] {
        return this.kept.get(name) ?? [];
    }

    public clear(): void {
        this.kept.clear();
    }

    public save(): Record<LifeRangeName, LifeSample[]> {
        return {
            "5min": this.samples("5min"),
            "1h": this.samples("1h"),
            "4h": this.samples("4h"),
            "1d": this.samples("1d"),
        };
    }

    /** The ranges that were saved; a range that is missing or cannot be read starts empty. */
    public static from(saved: unknown): LifeRanges {
        const ranges = new LifeRanges();
        if (typeof saved !== "object" || saved === null) return ranges;
        for (const range of LIFE_RANGES) {
            const read = SavedRange.safeParse((saved as Record<string, unknown>)[range.name]);
            if (read.success) ranges.kept.set(range.name, read.data);
        }
        return ranges;
    }
}
