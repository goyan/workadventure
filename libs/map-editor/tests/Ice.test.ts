import { describe, expect, it } from "vitest";
import {
    ICE_CURRENT_OPEN_MS,
    ICE_CURRENT_SHEET_MS,
    iceCurrentShare,
    ICE_BEARS_MM,
    ICE_MAX_MM,
    ICE_SLIPS_MM,
    iceByte,
    iceGrowthMmPerDay,
    iceMmOfByte,
    iceThawMmPerHour,
} from "../src/Terrain/Ice";
import { snowMeltMmPerHour } from "../src/Terrain/Snow";

const still = { humidity: 50, windSpeed: 0 };

describe("the ice on the water", () => {
    it("grows by the degrees of frost, slower as it thickens (Stefan)", () => {
        expect(iceGrowthMmPerDay(10, { ...still, temperature: -10 }, 0)).toBeCloseTo(365);
        expect(iceGrowthMmPerDay(100, { ...still, temperature: -10 }, 0)).toBeCloseTo(36.5);
        expect(iceGrowthMmPerDay(10, { ...still, temperature: -20 }, 0)).toBeCloseTo(730);
        // A film of ice grows as one of 10 mm: no growth without end at the start.
        expect(iceGrowthMmPerDay(0, { ...still, temperature: -10 }, 0)).toBeCloseTo(365);
    });

    it("grows faster in the wind, slower under the snow that keeps the cold off", () => {
        expect(iceGrowthMmPerDay(10, { humidity: 50, windSpeed: 30, temperature: -10 }, 0)).toBeCloseTo(730);
        expect(iceGrowthMmPerDay(10, { ...still, temperature: -10 }, 50)).toBeCloseTo(182.5);
    });

    it("does not grow at 0 °C nor above, nor in an air that is not known", () => {
        expect(iceGrowthMmPerDay(10, { ...still, temperature: 0 }, 0)).toBe(0);
        expect(iceGrowthMmPerDay(10, { ...still, temperature: 5 }, 0)).toBe(0);
        expect(iceGrowthMmPerDay(10, { ...still, temperature: Number.NaN }, 0)).toBe(0);
    });

    it("thaws as the snow melts", () => {
        const mild = { temperature: 10, humidity: 50, windSpeed: 20 };
        expect(iceThawMmPerHour(mild)).toBeCloseTo(snowMeltMmPerHour(mild));
        expect(iceThawMmPerHour({ ...still, temperature: -3 })).toBe(0);
    });

    it("bears a walker from 50 mm, is slipped on from 5 mm", () => {
        expect(ICE_BEARS_MM).toBe(50);
        expect(ICE_SLIPS_MM).toBe(5);
    });

    it("is told in a byte, finer near no ice", () => {
        expect(iceByte(0)).toBe(0);
        expect(iceByte(ICE_MAX_MM)).toBe(255);
        expect(iceByte(1)).toBeGreaterThan(0);
        for (const mm of [5, 50, 200]) {
            expect(iceMmOfByte(iceByte(mm))).toBeGreaterThan(mm * 0.85);
            expect(iceMmOfByte(iceByte(mm))).toBeLessThan(mm * 1.15);
        }
    });
});

describe("the ice on running water", () => {
    it("takes as on a pond up to the speed under which a sheet of ice forms, none on water that runs fast", () => {
        // Carstens 1971 (rivers of Norway), cited by Gosink and Osterkamp 1983: moving slush over 0.6 m/s, open over 1.2.
        expect(ICE_CURRENT_SHEET_MS).toBe(0.6);
        expect(ICE_CURRENT_OPEN_MS).toBe(1.2);
        expect(iceCurrentShare(0)).toBe(1);
        expect(iceCurrentShare(ICE_CURRENT_SHEET_MS)).toBe(1);
        expect(iceCurrentShare(0.9)).toBeCloseTo(0.5);
        expect(iceCurrentShare(ICE_CURRENT_OPEN_MS)).toBe(0);
        expect(iceCurrentShare(3)).toBe(0);
        // A speed that is not known: as on still water.
        expect(iceCurrentShare(Number.NaN)).toBe(1);
    });
});
