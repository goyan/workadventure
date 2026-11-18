import { describe, expect, it } from "vitest";
import { LifeStats, LIFE_HISTORY_SAMPLES } from "../../../../../src/front/Phaser/Game/Life/LifeStats";

const totals = (births: number, eaten = 0) => ({
    since: 1000,
    arrivals: 2,
    births,
    diedOfAge: 0,
    eaten,
    diedDry: 0,
    habitableBodies: 2,
    populatedBodies: 1,
    capacity: 40,
});
const animals = (males: number, females: number, dolphins: number) => [
    ...Array.from({ length: males }, (_, index) => ({ id: index + 1, kind: 0 })),
    ...Array.from({ length: females }, (_, index) => ({ id: 1000 + index, kind: 1 })),
    ...Array.from({ length: dolphins }, (_, index) => ({ id: 2000 + index, kind: 2 })),
];

describe("LifeStats", () => {
    it("counts the prey by sex and the predators, and how many prey there are for a predator", () => {
        const stats = new LifeStats();
        stats.receive(animals(7, 5, 2), totals(0), 0);
        expect(stats.view(0)).toMatchObject({ males: 7, females: 5, prey: 12, predators: 2, preyPerPredator: 6 });
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
        expect(stats.view(90_000).totals).toMatchObject({ births: 20, eaten: 3, since: 1000 });
    });

    it("starts the last minute over when the totals of the server go back (life turned off and on)", () => {
        const stats = new LifeStats();
        stats.receive(animals(1, 1, 0), totals(50), 0);
        stats.receive(animals(1, 1, 0), totals(2), 1000);
        expect(stats.view(1000).lastMinute.births).toBe(0);
    });

    it("keeps the history of the prey and of the predators, the oldest samples forgotten", () => {
        const stats = new LifeStats();
        for (let second = 0; second < LIFE_HISTORY_SAMPLES + 10; second++) {
            stats.receive(animals(second, 0, 1), totals(0), second * 1000);
        }
        const { history } = stats.view(0);
        expect(history).toHaveLength(LIFE_HISTORY_SAMPLES);
        expect(history[0]).toEqual({ prey: 10, predators: 1 });
        expect(history.at(-1)).toEqual({ prey: LIFE_HISTORY_SAMPLES + 9, predators: 1 });
    });

    it("has nothing to show before the server told anything, nor after the life went", () => {
        const stats = new LifeStats();
        expect(stats.view(0).totals).toBeUndefined();
        stats.receive(animals(1, 1, 0), totals(1), 0);
        stats.receive([], undefined, 1000);
        expect(stats.view(1000)).toMatchObject({ prey: 0, predators: 0, totals: undefined });
    });
});
