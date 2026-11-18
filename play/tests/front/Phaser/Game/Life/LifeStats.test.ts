import { describe, expect, it } from "vitest";
import { chartPoints, LifeStats } from "../../../../../src/front/Phaser/Game/Life/LifeStats";

const totals = (births: number, eaten = 0) => ({
    since: 1000,
    arrivals: 2,
    births,
    diedOfAge: 0,
    eaten,
    diedDry: 0,
    predatorBirths: 0,
    predatorDeaths: 0,
    habitableBodies: 2,
    populatedBodies: 1,
    capacity: 40,
    history: [] as { at: number; prey: number; predators: number }[],
    historyStepMs: 5000,
    ranges: [] as { name: string; samples: { at: number; prey: number; predators: number }[] }[],
});
const animals = (males: number, females: number, dolphins: number) => [
    ...Array.from({ length: males }, (_, index) => ({ id: index + 1, kind: 0 })),
    ...Array.from({ length: females }, (_, index) => ({ id: 1000 + index, kind: 1 })),
    // The dolphins: males and females in turn.
    ...Array.from({ length: dolphins }, (_, index) => ({ id: 2000 + index, kind: 2 + (index % 2) })),
];

describe("LifeStats", () => {
    it("counts the prey by sex and the predators, and how many prey there are for a predator", () => {
        const stats = new LifeStats();
        stats.receive(animals(7, 5, 2), totals(0), 0);
        expect(stats.view(0)).toMatchObject({ males: 7, females: 5, prey: 12, predators: 2, preyPerPredator: 6 });
        expect(stats.view(0)).toMatchObject({ predatorMales: 1, predatorFemales: 1 });
        stats.receive(animals(3, 3, 0), totals(0), 1000);
        expect(stats.view(1000).preyPerPredator).toBeUndefined();
    });

    it("tells what happened over the last minute, from the totals of the server", () => {
        const stats = new LifeStats();
        stats.receive(animals(1, 1, 0), totals(10, 1), 0);
        stats.receive(animals(1, 1, 0), totals(14, 1), 30_000);
        expect(stats.view(30_000).lastMinute).toMatchObject({ births: 4, eaten: 0 });
        stats.receive(animals(1, 1, 0), totals(20, 3), 90_000);
        // A minute ago the totals were those of the message at 30 s.
        expect(stats.view(90_000).lastMinute).toMatchObject({ births: 6, eaten: 2 });
        stats.receive(animals(1, 1, 0), { ...totals(20, 3), predatorBirths: 2, predatorDeaths: 1 }, 91_000);
        expect(stats.view(91_000).lastMinute).toMatchObject({ predatorBirths: 2, predatorDeaths: 1 });
        expect(stats.view(90_000).totals).toMatchObject({ births: 20, eaten: 3, since: 1000 });
    });

    it("starts the last minute over when the totals of the server go back (life turned off and on)", () => {
        const stats = new LifeStats();
        stats.receive(animals(1, 1, 0), totals(50), 0);
        stats.receive(animals(1, 1, 0), totals(2), 1000);
        expect(stats.view(1000).lastMinute.births).toBe(0);
    });

    it("keeps the history of the prey and of the predators, a sample every five seconds", () => {
        const stats = new LifeStats();
        for (let second = 0; second <= 12; second++) {
            stats.receive(animals(second, 0, 1), totals(0), second * 1000);
        }
        expect(stats.view(0).history).toEqual([
            { at: 0, prey: 0, predators: 1 },
            { at: 5000, prey: 5, predators: 1 },
            { at: 10000, prey: 10, predators: 1 },
        ]);
    });

    it("starts from the history the server gives on joining, then goes on with what it is told", () => {
        const stats = new LifeStats();
        const joined = {
            ...totals(0),
            history: [
                { at: 0, prey: 2, predators: 0 },
                { at: 10_000, prey: 9, predators: 1 },
            ],
            historyStepMs: 10_000,
        };
        stats.receive(animals(5, 5, 1), joined, 12_000);
        // Too close to the last sample of the server: not added yet.
        expect(stats.view(0).history).toHaveLength(2);
        stats.receive(animals(6, 6, 1), totals(0), 20_000);
        expect(stats.view(0).history.at(-1)).toEqual({ at: 20_000, prey: 12, predators: 1 });
    });

    it("forgets its history when the life starts over", () => {
        const stats = new LifeStats();
        stats.receive(animals(1, 1, 0), totals(50), 0);
        stats.receive(animals(1, 1, 0), { ...totals(0), since: 9000 }, 10_000);
        expect(stats.view(0).history).toEqual([{ at: 10_000, prey: 2, predators: 0 }]);
    });

    it("keeps the prey and the predators over each range, up to the present", () => {
        const stats = new LifeStats();
        for (let second = 0; second <= 61; second++) {
            stats.receive(animals(second, 0, 1), totals(0), second * 1000);
        }
        const ranges = stats.view(61_000).ranges;
        // Every message of the server (a second apart) is further than the step of the shortest range.
        expect(ranges["5min"].map((sample) => sample.at).slice(0, 4)).toEqual([0, 3000, 6000, 9000]);
        // The longer ranges: their samples, then the present.
        expect(ranges["1h"]).toEqual([
            { at: 0, prey: 0, predators: 1 },
            { at: 30_000, prey: 30, predators: 1 },
            { at: 60_000, prey: 60, predators: 1 },
            { at: 61_000, prey: 61, predators: 1 },
        ]);
        expect(ranges["1d"]).toEqual([
            { at: 0, prey: 0, predators: 1 },
            { at: 61_000, prey: 61, predators: 1 },
        ]);
    });

    it("shows of a range only what is not older than it", () => {
        const stats = new LifeStats();
        stats.receive(animals(4, 0, 0), totals(0), 0);
        stats.receive(animals(6, 0, 0), totals(0), 100_000);
        // Six minutes later nothing came: the sample at 0 is out of the five minutes.
        expect(stats.view(360_000).ranges["5min"]).toEqual([
            { at: 100_000, prey: 6, predators: 0 },
            { at: 360_000, prey: 6, predators: 0 },
        ]);
    });

    it("starts from the ranges the server gives on joining, and forgets them when the life starts over", () => {
        const stats = new LifeStats();
        const joined = {
            ...totals(0),
            ranges: [
                { name: "1h", samples: [{ at: 1000, prey: 2, predators: 0 }] },
                { name: "unknown", samples: [{ at: 1000, prey: 9, predators: 9 }] },
            ],
        };
        stats.receive(animals(5, 5, 1), joined, 12_000);
        expect(stats.view(12_000).ranges["1h"]).toEqual([
            { at: 1000, prey: 2, predators: 0 },
            { at: 12_000, prey: 10, predators: 1 },
        ]);
        stats.receive(animals(1, 1, 0), { ...totals(0), since: 9000 }, 20_000);
        expect(stats.view(20_000).ranges["1h"]).toEqual([{ at: 20_000, prey: 2, predators: 0 }]);
    });

    it("has nothing to show before the server told anything, nor after the life went", () => {
        const stats = new LifeStats();
        expect(stats.view(0).totals).toBeUndefined();
        stats.receive(animals(1, 1, 0), totals(1), 0);
        stats.receive([], undefined, 1000);
        expect(stats.view(1000)).toMatchObject({ prey: 0, predators: 0, totals: undefined });
    });
});

describe("chartPoints", () => {
    const samples = [
        { at: 0, prey: 0, predators: 0 },
        { at: 30_000, prey: 50, predators: 1 },
        { at: 120_000, prey: 100, predators: 2 },
    ];

    it("places the samples in a given window of time, the present on the right", () => {
        const window = { from: 20_000, to: 120_000 };
        expect(chartPoints(samples.slice(1), "prey", 100, 200, 80, window)).toBe("20,40 200,0");
    });

    it("places each sample at its time, the largest value at the top of the box", () => {
        expect(chartPoints(samples, "prey", 100, 200, 80)).toBe("0,80 50,40 200,0");
        expect(chartPoints(samples, "predators", 4, 200, 80)).toBe("0,80 50,60 200,40");
    });

    it("draws a single sample in the middle, and nothing without any", () => {
        expect(chartPoints([samples[1]], "prey", 100, 200, 80)).toBe("100,40");
        expect(chartPoints([], "prey", 100, 200, 80)).toBe("");
    });
});
