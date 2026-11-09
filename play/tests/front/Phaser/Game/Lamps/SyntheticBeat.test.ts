import { describe, expect, it } from "vitest";
import { syntheticSpectrum } from "../../../../../src/front/Phaser/Game/Lamps/SyntheticBeat";

describe("syntheticSpectrum", () => {
    it("peaks on the beat and falls between two beats, at the given tempo", () => {
        // 120 BPM: a beat every 500 ms.
        const onBeat = syntheticSpectrum(0, 120);
        const between = syntheticSpectrum(300, 120);
        expect(onBeat.bass).toBeGreaterThan(0.8);
        expect(between.bass).toBeLessThan(0.3);
        expect(syntheticSpectrum(500, 120).bass).toBeCloseTo(onBeat.bass, 5);
    });

    it("keeps every band between 0 and 1", () => {
        for (let time = 0; time < 5000; time += 37) {
            const bands = syntheticSpectrum(time, 128);
            for (const value of [bands.bass, bands.mid, bands.treble]) {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(1);
            }
        }
    });

    it("follows a faster tempo", () => {
        // 240 BPM: a beat every 250 ms.
        expect(syntheticSpectrum(250, 240).bass).toBeGreaterThan(0.8);
        expect(syntheticSpectrum(150, 240).bass).toBeLessThan(0.3);
    });
});
