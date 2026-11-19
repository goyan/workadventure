import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptyPopulation, LIFE_STEP_MS, stepPopulation } from "../src/Life/Population";
import { waterBodiesOf } from "../src/Life/WaterBodies";
import { LifeSettings } from "../src/types";
import { gridOf } from "./lifeHelpers";

function mulberry32(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const EVENTS = ["arrivals", "births", "diedOfAge", "eaten", "diedDry", "predatorBirths", "predatorDeaths"] as const;
const lake = (): string[] => Array.from({ length: 30 }, () => "d".repeat(30));
/**
 * Two waters: a big lake with a shallow rim (a refuge from the dolphins) that fills the room, and a pond for fish
 * only.
 */
const lakeAndPond = (): string[] => [
    ...Array.from({ length: 50 }, (_, row) =>
        row < 3 || row >= 47
            ? "s".repeat(60) + "." + ".".repeat(12)
            : "sss" + "d".repeat(54) + "sss" + "." + ".".repeat(12),
    ),
    ".".repeat(73),
    ...Array.from({ length: 8 }, () => ".".repeat(61) + "s".repeat(12)),
];

/** A life over many steps, as a fingerprint and what happened: the rules must not change it without saying so. */
function life(rows: string[], seed: number, steps: number): { fingerprint: string; totals: Record<string, number> } {
    const grid = gridOf(rows);
    const bodies = waterBodiesOf(grid);
    const settings = LifeSettings.parse({
        enabled: true,
        reproductionDelay: 10,
        maxLifespan: 120,
        huntInterval: 5,
        dolphinReproductionDelay: 30,
        dolphinMaxLifespan: 300,
    });
    const random = mulberry32(seed);
    const population = emptyPopulation();
    const totals: Record<string, number> = {};
    for (let step = 0; step < steps; step++) {
        const now = step * LIFE_STEP_MS;
        // An avatar crosses the lake now and then.
        const threats = step % 400 < 60 ? [{ x: 240, y: 240 }] : [];
        const tally = stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, now, random, threats);
        for (const key of EVENTS) totals[key] = (totals[key] ?? 0) + tally[key];
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({ population, totals })).digest("hex").slice(0, 16);
    return { fingerprint, totals };
}
const fingerprint = (seed: number): string => life(lake(), seed, 2000).fingerprint;

// The fingerprints were taken again once, on purpose, when the dolphins began to wait for thirty fish before they
// come into a water (FISH_PER_DOLPHIN_COUPLE): with that threshold at 0 the rules gave the fingerprints of before
// (9793f2b752505ad8, 97af95d70e65ec7b, e7e0093f05ffb5df, eb272ede6dd26206, 20aba621aa02b766).
describe("the life of a lake, step after step", () => {
    it("is the one the rules gave before they read the table of the species", () => {
        expect([fingerprint(1), fingerprint(2), fingerprint(3)]).toEqual([
            "b382492b827d9cc9",
            "8b3d10ad49717928",
            "df1edbffcd85105a",
        ]);
    }, 60_000);

    it("covers births, calves, catches and deaths of age and of hunger", () => {
        const { totals } = life(lake(), 1, 2000);
        for (const key of ["births", "eaten", "diedOfAge", "predatorBirths", "predatorDeaths"]) {
            expect(totals[key]).toBeGreaterThan(0);
        }
    }, 60_000);

    it("is the same on a map with two waters, a shallow rim and a full room", () => {
        expect([1, 2].map((seed) => life(lakeAndPond(), seed, 4000).fingerprint)).toEqual([
            "f8c96e726f9befc7",
            "538b3a378dac9a93",
        ]);
    }, 60_000);
});
