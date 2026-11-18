import type { LifeSample } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    LifeSpeciesStats,
    speciesChart,
    withoutSpeciesCounts,
} from "../../../../../src/front/Phaser/Game/Life/LifeSpeciesStats";
import { LifeStats } from "../../../../../src/front/Phaser/Game/Life/LifeStats";
import type { SpeciesTotals } from "../../../../../src/front/Phaser/Game/Life/LifeSpeciesStats";

const FISH = 0;
const DOLPHIN = 1;
const species = (id: number, more: Partial<SpeciesTotals> = {}): SpeciesTotals => ({
    species: id,
    males: 1,
    females: 1,
    cap: 12,
    arrivals: 2,
    births: 0,
    diedOfAge: 0,
    eaten: 0,
    starved: 0,
    diedDry: 0,
    meals: [],
    ...more,
});
const told = (list: SpeciesTotals[], since = 1000) => ({
    since,
    species: list,
    history: [],
    historyStepMs: 5000,
    ranges: [],
});
const animals = (fish: number, dolphins: number) => [
    ...Array.from({ length: fish }, (_, index) => ({ kind: index % 2 })),
    ...Array.from({ length: dolphins }, (_, index) => ({ kind: 2 + (index % 2) })),
];

describe("LifeSpeciesStats", () => {
    it("tells what happened to each species over the last minute, from the totals of the server", () => {
        const stats = new LifeSpeciesStats();
        stats.receive(animals(2, 0), told([species(FISH, { births: 4 })]), 0);
        stats.receive(animals(2, 0), told([species(FISH, { births: 9 })]), 30_000);
        expect(stats.view(30_000).rows[0]).toMatchObject({ species: FISH, births: 9, lastMinute: { births: 5 } });
        stats.receive(animals(2, 0), told([species(FISH, { births: 9 })]), 91_000);
        expect(stats.view(91_000).rows[0].lastMinute.births).toBe(0);
    });

    it("tells what each predator ate over the last minute", () => {
        const stats = new LifeSpeciesStats();
        const dolphin = (count: number) => species(DOLPHIN, { meals: [{ species: FISH, count }] });
        stats.receive(animals(2, 2), told([species(FISH), dolphin(3)]), 0);
        stats.receive(animals(2, 2), told([species(FISH), dolphin(5)]), 20_000);
        const row = stats.view(20_000).rows[1];
        expect(row.meals).toEqual([{ species: FISH, count: 5 }]);
        expect(row.lastMinute.meals).toEqual([{ species: FISH, count: 2 }]);
    });

    it("tells since when a species that lived has none left, until one comes back", () => {
        const stats = new LifeSpeciesStats();
        stats.receive(animals(2, 2), told([species(FISH), species(DOLPHIN)]), 0);
        expect(stats.view(0).rows[1].extinctSince).toBeUndefined();
        const gone = species(DOLPHIN, { males: 0, females: 0, starved: 2 });
        stats.receive(animals(2, 0), told([species(FISH), gone]), 10_000);
        stats.receive(animals(2, 0), told([species(FISH), gone]), 11_000);
        expect(stats.view(11_000).rows[1].extinctSince).toBe(10_000);
        stats.receive(animals(2, 2), told([species(FISH), species(DOLPHIN, { arrivals: 4 })]), 12_000);
        expect(stats.view(12_000).rows[1].extinctSince).toBeUndefined();
    });

    it("does not call extinct a species that has room but never lived", () => {
        const stats = new LifeSpeciesStats();
        stats.receive(animals(2, 0), told([species(FISH), species(DOLPHIN, { males: 0, females: 0, arrivals: 0 })]), 0);
        expect(stats.view(0).rows[1].extinctSince).toBeUndefined();
    });

    it("shows nothing when the server tells nothing of the species", () => {
        const stats = new LifeSpeciesStats();
        stats.receive(animals(2, 0), told([]), 0);
        expect(stats.view(0).rows).toEqual([]);
        stats.receive(animals(2, 0), undefined, 1000);
        expect(stats.view(1000).rows).toEqual([]);
    });

    it("starts over when the life of the map does", () => {
        const stats = new LifeSpeciesStats();
        stats.receive(animals(2, 0), told([species(FISH, { births: 9 })]), 0);
        stats.receive(animals(2, 0), told([species(FISH, { births: 12 })], 5000), 10_000);
        expect(stats.view(10_000).rows[0].lastMinute.births).toBe(0);
        expect(stats.view(10_000).history).toEqual([{ at: 10_000, prey: 0, predators: 0, counts: { "0": 2 } }]);
    });

    it("keeps how many of each species lived: what the server kept, then what it is told", () => {
        const stats = new LifeSpeciesStats();
        stats.receive(
            animals(4, 2),
            {
                ...told([species(FISH), species(DOLPHIN)]),
                history: [
                    {
                        at: 0,
                        prey: 3,
                        predators: 1,
                        counts: [
                            { species: FISH, count: 3 },
                            { species: DOLPHIN, count: 1 },
                        ],
                    },
                ],
                ranges: [
                    {
                        name: "5min",
                        samples: [{ at: 0, prey: 3, predators: 1, counts: [{ species: FISH, count: 3 }] }],
                    },
                ],
            },
            10_000,
        );
        const view = stats.view(10_000);
        expect(view.history.map((sample) => sample.counts)).toEqual([
            { "0": 3, "1": 1 },
            { "0": 4, "1": 2 },
        ]);
        expect(view.ranges["5min"].map((sample) => sample.counts)).toEqual([{ "0": 3 }, { "0": 4, "1": 2 }]);
    });
});

describe("speciesChart", () => {
    it("draws a line for each species, each on its own scale, with a little room above", () => {
        const samples: LifeSample[] = [
            { at: 0, prey: 0, predators: 0, counts: { "0": 110 } },
            { at: 10, prey: 0, predators: 0, counts: { "0": 220, "1": 5 } },
        ];
        expect(speciesChart(samples, [FISH, DOLPHIN], 100, 44)).toEqual([
            { species: FISH, max: 220, points: "0,24 100,4" },
            { species: DOLPHIN, max: 5, points: "0,44 100,4" },
        ]);
    });

    it("draws nothing without a sample", () => {
        expect(speciesChart([], [FISH], 100, 40)).toEqual([{ species: FISH, max: 1, points: "" }]);
    });
});

describe("withoutSpeciesCounts", () => {
    it("lets the figures of the prey and of the predators read the history the server tells with the species", () => {
        const stats = new LifeStats();
        const sample = { at: 0, prey: 3, predators: 1, counts: [{ species: FISH, count: 3 }] };
        stats.receive(
            [{ kind: 0 }],
            withoutSpeciesCounts({
                since: 1000,
                arrivals: 2,
                births: 0,
                diedOfAge: 0,
                eaten: 0,
                diedDry: 0,
                predatorBirths: 0,
                predatorDeaths: 0,
                habitableBodies: 1,
                populatedBodies: 1,
                capacity: 12,
                history: [sample],
                historyStepMs: 5000,
                ranges: [{ name: "5min", samples: [sample] }],
            }),
            10_000,
        );
        expect(stats.view(10_000).history[0]).toEqual({ at: 0, prey: 3, predators: 1 });
        expect(stats.view(10_000).ranges["5min"][0]).toEqual({ at: 0, prey: 3, predators: 1 });
    });
});
