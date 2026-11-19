import { describe, expect, it } from "vitest";
import { SPECIES_IDS } from "../src/Life/Species";
import { runBalance } from "./lifeBalance";

/**
 * The default settings must give a life that lasts: on a plain with a lake, over two hours of the map, every
 * species comes, none stays away for long, the prey are neither wiped out nor stuck at the most their places hold.
 * The defaults were chosen with the same run over a day and several seeds; this shorter one guards them.
 */
describe("the life of a map with the default settings", () => {
    it("lasts: every species comes and stays, the prey neither wiped out nor always at their most", () => {
        const { species, bySpecies } = runBalance(1, 2);
        for (const id of SPECIES_IDS) {
            expect(species[id].max, id).toBeGreaterThan(0);
            expect(species[id].zeroShare, id).toBeLessThan(0.2);
        }
        expect(species.fish.last).toBeGreaterThan(100);
        expect(species.antelope.last).toBeGreaterThan(10);
        expect(species.antelope.atCapShare).toBeLessThan(0.8);
        // Everyone eats what it should, and no predator starves while the prey are there.
        expect(bySpecies.dolphin?.meals.fish).toBeGreaterThan(0);
        expect(bySpecies.lion?.meals.antelope).toBeGreaterThan(0);
        expect(bySpecies.tiger?.meals.antelope).toBeGreaterThan(0);
        expect((bySpecies.lion?.meals.fish ?? 0) + (bySpecies.tiger?.meals.fish ?? 0)).toBeGreaterThan(0);
        expect(bySpecies.dolphin?.starved).toBe(0);
    }, 120_000);
});
