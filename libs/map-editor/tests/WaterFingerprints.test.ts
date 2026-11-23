import { describe, expect, it } from "vitest";
import { playScenario, SCENARIO_TIMEOUT_MS, SCENARIOS, WATER_ALONE } from "./helpers/WaterScenarios";

/**
 * The water of a whole map, fingerprinted: each scenario below ends on a fingerprint of everything the grid holds
 * and tells (depths, flows, speeds, tallies, bytes sent). A change that is meant to leave the water as it is, to
 * the bit (a faster loop), keeps them all; one that changes the physics on purpose records them again:
 * `RECORD_WATER_FINGERPRINTS=1 npx vitest run tests/WaterFingerprints.test.ts`.
 *
 * Those of the water alone (WATER_ALONE) were recorded with the code as it was at the commit eb17d9b92 of the
 * fork. So were the whole ones, but for the eight scenarios that lose water: the water lost at a step is now
 * summed row by row (depthsPass), so that several threads may share the rows, which changed that figure in its
 * last places (by 3 parts in a hundred million million at most) and nothing else.
 */

describe("WaterGrid, the same water to the bit", () => {
    // RECORD_WATER_FINGERPRINTS=1 prints the fingerprints instead of checking them.
    const record = process.env.RECORD_WATER_FINGERPRINTS === "1";

    for (const scenario of SCENARIOS) {
        it(
            `ends on the fingerprint of the water as it was: ${scenario.name}`,
            () => {
                const { whole, water } = playScenario(scenario);
                if (record) {
                    process.stdout.write(`FINGERPRINT\t${scenario.name}\t${whole}\t${water}\n`);
                    return;
                }
                expect(water).toBe(WATER_ALONE[scenario.name]);
                expect(whole).toBe(scenario.fingerprint);
            },
            SCENARIO_TIMEOUT_MS,
        );
    }
});
