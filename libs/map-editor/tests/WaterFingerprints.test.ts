import { describe, expect, it } from "vitest";
import { playScenario, SCENARIO_TIMEOUT_MS, SCENARIOS } from "./helpers/WaterScenarios";

/**
 * The water of a whole map, fingerprinted: each scenario below ends on a fingerprint of everything the grid holds
 * and tells (depths, flows, speeds, tallies, bytes sent), recorded with the code as it was at the commit eb17d9b92
 * of the fork. A change that is meant to leave the water as it is, to the bit (a faster loop), keeps them all; one
 * that changes the physics on purpose records them again:
 * `RECORD_WATER_FINGERPRINTS=1 npx vitest run tests/WaterFingerprints.test.ts`.
 */

describe("WaterGrid, the same water to the bit", () => {
    // RECORD_WATER_FINGERPRINTS=1 prints the fingerprints instead of checking them.
    const record = process.env.RECORD_WATER_FINGERPRINTS === "1";

    for (const scenario of SCENARIOS) {
        it(
            `ends on the fingerprint of the water as it was: ${scenario.name}`,
            () => {
                const fingerprint = playScenario(scenario);
                if (record) process.stdout.write(`FINGERPRINT\t${scenario.name}\t${fingerprint}\n`);
                else expect(fingerprint).toBe(scenario.fingerprint);
            },
            SCENARIO_TIMEOUT_MS,
        );
    }
});
