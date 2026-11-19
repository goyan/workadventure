import { landPlacesOf } from "../src/Life/LandPlaces";
import { emptyPopulation, LIFE_STEP_MS, speciesCensus, stepPopulation } from "../src/Life/Population";
import type { SpeciesTallies } from "../src/Life/Population";
import { SPECIES_IDS } from "../src/Life/Species";
import type { SpeciesId } from "../src/Life/Species";
import { waterBodiesOf } from "../src/Life/WaterBodies";
import { LifeSettings } from "../src/types";
import { gridOf } from "./lifeHelpers";

export function mulberry32(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A map of 120 × 90 tiles (240 × 180 cells): a plain, with a lake of 70 × 50 cells in its middle whose rim, three
 * cells wide, is shallow.
 */
export function balanceMap(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 180; y++) {
        let row = "";
        for (let x = 0; x < 240; x++) {
            const inLake = x >= 85 && x < 155 && y >= 65 && y < 115;
            const inDeep = x >= 88 && x < 152 && y >= 68 && y < 112;
            row += inDeep ? "d" : inLake ? "s" : ".";
        }
        rows.push(row);
    }
    return rows;
}

export interface BalanceReport {
    /**
     * For each species, after its first arrival: its fewest and most, its last count, how often it died out, and the
     * shares of the time it spent at the most its places hold, and with none left.
     */
    species: Record<
        SpeciesId,
        { min: number; max: number; last: number; extinctions: number; atCapShare: number; zeroShare: number }
    >;
    bySpecies: SpeciesTallies;
}

/** The life of the balance map over `hours` of the time of the map, with the default settings (or others). */
export function runBalance(seed: number, hours: number, custom: Record<string, unknown> = {}): BalanceReport {
    const grid = gridOf(balanceMap());
    const bodies = waterBodiesOf(grid);
    const land = landPlacesOf({
        width: 240,
        height: 180,
        walls: { east: new Set(), south: new Set() },
        depthAt: (x, y) => grid.depthAt(x, y),
    });
    const settings = LifeSettings.parse({ enabled: true, landEnabled: true, gullsEnabled: true, ...custom });
    const random = mulberry32(seed);
    const population = emptyPopulation();
    const bySpecies: SpeciesTallies = {};
    const caps = new Map(speciesCensus(population, bodies, land).map((entry) => [entry.species, entry.cap]));
    const report = Object.fromEntries(
        SPECIES_IDS.map((id) => [id, { min: Infinity, max: 0, last: 0, extinctions: 0, atCapShare: 0, zeroShare: 0 }]),
    ) as BalanceReport["species"];
    const lived = new Set<SpeciesId>();
    const steps = (hours * 3600 * 1000) / LIFE_STEP_MS;
    const counts = new Map<SpeciesId, number>();
    for (let step = 0; step < steps; step++) {
        stepPopulation(
            population,
            grid,
            bodies,
            settings,
            LIFE_STEP_MS,
            step * LIFE_STEP_MS,
            random,
            [],
            bySpecies,
            land,
        );
        if (step % 20 !== 0) continue;
        counts.clear();
        for (const animal of population.animals) counts.set(animal.kind, (counts.get(animal.kind) ?? 0) + 1);
        for (const id of SPECIES_IDS) {
            const count = counts.get(id) ?? 0;
            const entry = report[id];
            if (count > 0) lived.add(id);
            if (!lived.has(id)) continue;
            if (count === 0 && entry.last > 0) entry.extinctions++;
            entry.min = Math.min(entry.min, count);
            entry.max = Math.max(entry.max, count);
            entry.last = count;
            if (count >= (caps.get(id) ?? Infinity)) entry.atCapShare += 20 / steps;
            if (count === 0) entry.zeroShare += 20 / steps;
        }
    }
    return { species: report, bySpecies };
}
