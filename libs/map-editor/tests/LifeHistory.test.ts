import { describe, expect, it } from "vitest";
import { LIFE_HISTORY_MAX, LIFE_HISTORY_STEP_MS, LifeHistory } from "../src/Life/LifeHistory";

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
