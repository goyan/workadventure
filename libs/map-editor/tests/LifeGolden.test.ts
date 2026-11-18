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

/** The life of a lake over 2 000 steps, as a fingerprint: the rules must not change it without saying so. */
function fingerprint(seed: number): string {
    const grid = gridOf(Array.from({ length: 30 }, () => "d".repeat(30)));
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
    for (let step = 0; step < 2000; step++) {
        const now = step * LIFE_STEP_MS;
        // An avatar crosses the lake now and then.
        const threats = step % 400 < 60 ? [{ x: 240, y: 240 }] : [];
        const tally = stepPopulation(population, grid, bodies, settings, LIFE_STEP_MS, now, random, threats);
        for (const key of ["arrivals", "births", "diedOfAge", "eaten", "diedDry", "predatorBirths", "predatorDeaths"]) {
            totals[key] = (totals[key] ?? 0) + (tally as unknown as Record<string, number>)[key];
        }
    }
    return createHash("sha256").update(JSON.stringify({ population, totals })).digest("hex").slice(0, 16);
}

describe("the life of a lake, step after step", () => {
    it("is the one the rules gave before they read the table of the species", () => {
        expect([fingerprint(1), fingerprint(2), fingerprint(3)]).toEqual([
            "9793f2b752505ad8",
            "97af95d70e65ec7b",
            "e7e0093f05ffb5df",
        ]);
    });
});
