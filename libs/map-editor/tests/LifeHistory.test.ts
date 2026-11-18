import { describe, expect, it } from "vitest";
import {
    LIFE_HISTORY_MAX,
    LIFE_HISTORY_STEP_MS,
    LIFE_RANGE_MAX,
    LIFE_RANGES,
    LifeHistory,
    LifeRanges,
} from "../src/Life/LifeHistory";

describe("LifeHistory", () => {
    it("keeps a sample every five seconds, not more", () => {
        const history = new LifeHistory();
        for (let second = 0; second <= 12; second++) history.add({ at: second * 1000, prey: second, predators: 1 });
        expect(history.samples.map((sample) => sample.at)).toEqual([0, 5000, 10000]);
        expect(history.samples[1]).toEqual({ at: 5000, prey: 5, predators: 1 });
        expect(history.stepMs).toBe(LIFE_HISTORY_STEP_MS);
    });

    it("covers the whole life with a bounded number of samples: full, it keeps one sample out of two", () => {
        const history = new LifeHistory();
        const count = LIFE_HISTORY_MAX * 3;
        for (let index = 0; index < count; index++) {
            history.add({ at: index * LIFE_HISTORY_STEP_MS, prey: index, predators: 0 });
        }
        expect(history.samples.length).toBeLessThanOrEqual(LIFE_HISTORY_MAX);
        expect(history.samples.length).toBeGreaterThan(LIFE_HISTORY_MAX / 2);
        // The first sample is still there, and the samples are now further apart.
        expect(history.samples[0].at).toBe(0);
        expect(history.stepMs).toBe(LIFE_HISTORY_STEP_MS * 4);
        const gaps = history.samples.slice(1).map((sample, index) => sample.at - history.samples[index].at);
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(LIFE_HISTORY_STEP_MS * 2);
    });

    it("starts again from what was saved, and from nothing when that cannot be read", () => {
        const history = new LifeHistory();
        for (let second = 0; second <= 20; second += 5) history.add({ at: second * 1000, prey: 3, predators: 1 });
        const back = LifeHistory.from(JSON.parse(JSON.stringify(history.save())));
        expect(back.samples).toEqual(history.samples);
        expect(back.stepMs).toBe(history.stepMs);
        expect(LifeHistory.from({ stepMs: "x", samples: 3 }).samples).toEqual([]);
        expect(LifeHistory.from(undefined).samples).toEqual([]);
    });

    it("forgets everything when cleared", () => {
        const history = new LifeHistory();
        history.add({ at: 0, prey: 1, predators: 0 });
        history.clear();
        expect(history.samples).toEqual([]);
        expect(history.stepMs).toBe(LIFE_HISTORY_STEP_MS);
    });
});

describe("LifeRanges", () => {
    const span = (name: string) => LIFE_RANGES.find((range) => range.name === name)!;

    it("keeps, for each range, a sample every step of that range", () => {
        const ranges = new LifeRanges();
        // Two samples a second for a minute and a half.
        for (let half = 0; half <= 180; half++) ranges.add({ at: half * 500, prey: half, predators: 0 });
        const fine = ranges.samples("5min").map((sample) => sample.at);
        expect(fine.slice(0, 3)).toEqual([0, 2500, 5000]);
        expect(fine).toHaveLength(37);
        expect(ranges.samples("1h").map((sample) => sample.at)).toEqual([0, 30_000, 60_000, 90_000]);
        expect(ranges.samples("4h").map((sample) => sample.at)).toEqual([0]);
        expect(ranges.samples("1d").map((sample) => sample.at)).toEqual([0]);
    });

    it("forgets what is older than the range", () => {
        const ranges = new LifeRanges();
        // Two hours, a sample every ten seconds.
        for (let at = 0; at <= 2 * 3_600_000; at += 10_000) ranges.add({ at, prey: 1, predators: 0 });
        const last = 2 * 3_600_000;
        for (const name of ["5min", "1h"] as const) {
            const samples = ranges.samples(name);
            expect(samples[samples.length - 1].at).toBe(last);
            expect(samples[0].at).toBeGreaterThanOrEqual(last - span(name).spanMs);
            expect(samples[0].at).toBeLessThan(last - span(name).spanMs + 2 * span(name).stepMs);
            expect(samples.length).toBeLessThanOrEqual(LIFE_RANGE_MAX);
        }
        // The longer ranges still know the beginning.
        expect(ranges.samples("4h")[0].at).toBe(0);
        expect(ranges.samples("1d")[0].at).toBe(0);
    });

    it("starts again from what was saved, range by range, and from nothing when that cannot be read", () => {
        const ranges = new LifeRanges();
        for (let at = 0; at <= 120_000; at += 500) ranges.add({ at, prey: 3, predators: 1 });
        const back = LifeRanges.from(JSON.parse(JSON.stringify(ranges.save())));
        for (const range of LIFE_RANGES) expect(back.samples(range.name)).toEqual(ranges.samples(range.name));
        // A range that is missing or unknown: the others are still read.
        const partial = LifeRanges.from({ "1h": [{ at: 5, prey: 1, predators: 0 }], other: [] });
        expect(partial.samples("1h")).toEqual([{ at: 5, prey: 1, predators: 0 }]);
        expect(partial.samples("5min")).toEqual([]);
        expect(LifeRanges.from({ "1h": "x" }).samples("1h")).toEqual([]);
        expect(LifeRanges.from(undefined).samples("1d")).toEqual([]);
    });

    it("forgets everything when cleared", () => {
        const ranges = new LifeRanges();
        ranges.add({ at: 0, prey: 1, predators: 0 });
        ranges.clear();
        for (const range of LIFE_RANGES) expect(ranges.samples(range.name)).toEqual([]);
    });
});
