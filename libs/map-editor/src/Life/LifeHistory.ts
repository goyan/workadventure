import { z } from "zod";

/** A sample of the history is kept this often at first. */
export const LIFE_HISTORY_STEP_MS = 5000;
/** The most samples kept: beyond, one out of two is dropped and the samples come half as often. */
export const LIFE_HISTORY_MAX = 360;

export const LifeSample = z.object({
    at: z.number().finite(),
    prey: z.number().int().min(0),
    predators: z.number().int().min(0),
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
