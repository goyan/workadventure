import { describe, expect, it } from "vitest";
import { LIFE_HISTORY_MAX, LIFE_HISTORY_STEP_MS, LifeHistory, LifeRanges } from "../src/Life/LifeHistory";

describe("the history of the life, species by species", () => {
    it("keeps how many of each species lived, through a save", () => {
        const history = new LifeHistory();
        history.add({ at: 0, prey: 5, predators: 1, counts: { fish: 5, dolphin: 1 } });
        const read = LifeHistory.from(JSON.parse(JSON.stringify(history.save())));
        expect(read.samples).toEqual([{ at: 0, prey: 5, predators: 1, counts: { fish: 5, dolphin: 1 } }]);
    });

    it("reads a history saved before the species were counted", () => {
        const read = LifeHistory.from({ stepMs: LIFE_HISTORY_STEP_MS, samples: [{ at: 0, prey: 5, predators: 1 }] });
        expect(read.samples).toEqual([{ at: 0, prey: 5, predators: 1 }]);
    });

    it("keeps the counts with their sample when it thins out", () => {
        const history = new LifeHistory();
        for (let index = 0; index <= LIFE_HISTORY_MAX; index++) {
            history.add({ at: index * LIFE_HISTORY_STEP_MS, prey: index, predators: 0, counts: { fish: index } });
        }
        expect(history.samples.length).toBeLessThan(LIFE_HISTORY_MAX);
        for (const sample of history.samples) expect(sample.counts).toEqual({ fish: sample.prey });
    });

    it("keeps them in the ranges too, through a save", () => {
        const ranges = new LifeRanges();
        ranges.add({ at: 0, prey: 3, predators: 2, counts: { fish: 3, dolphin: 2 } });
        const read = LifeRanges.from(JSON.parse(JSON.stringify(ranges.save())));
        expect(read.samples("5min")).toEqual([{ at: 0, prey: 3, predators: 2, counts: { fish: 3, dolphin: 2 } }]);
    });
});
