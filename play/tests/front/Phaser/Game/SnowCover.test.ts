import { describe, expect, it } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import {
    snowCell,
    snowCoverage,
    SNOW_ACCUMULATION_MS,
    SNOW_MELT_MS,
    WEATHER_PHASE_MS,
} from "@wa/front/Phaser/Game/Weather/SnowCover";

const start = 3 * WEATHER_PHASE_MS;
describe("shared progressive ground snow", () => {
    it("accumulates over ten minutes and melts in the following clear phase, even after a reload", () => {
        expect(snowCoverage(WeatherType.Automatic, start)).toBe(0);
        expect(snowCoverage(WeatherType.Automatic, start + SNOW_ACCUMULATION_MS / 2)).toBe(0.5);
        expect(snowCoverage(WeatherType.Automatic, start + SNOW_ACCUMULATION_MS)).toBe(1);
        expect(snowCoverage(WeatherType.Automatic, 4 * WEATHER_PHASE_MS)).toBe(1);
        expect(snowCoverage(WeatherType.Automatic, 4 * WEATHER_PHASE_MS + SNOW_MELT_MS / 2)).toBe(0.5);
        expect(snowCoverage(WeatherType.Automatic, 4 * WEATHER_PHASE_MS + SNOW_MELT_MS)).toBe(0);
        expect(snowCoverage(WeatherType.Automatic, 5 * WEATHER_PHASE_MS)).toBe(0);
    });
    it("uses the server episode date for manual snow and rejects invalid clocks", () => {
        expect(snowCoverage(WeatherType.Snow, start + 60_000, start)).toBe(0.1);
        expect(snowCoverage(WeatherType.Snow, start - 60_000, start)).toBe(0);
        expect(snowCoverage(WeatherType.Rain, start + 60_000, start)).toBe(0);
        expect(snowCoverage(WeatherType.Snow, NaN, start)).toBe(0);
        expect(snowCoverage(WeatherType.Snow, start)).toBe(1);
    });
    it("keeps variants stable and patches monotonic across all accumulation levels", () => {
        for (let row = -10; row < 10; row++) {
            for (let col = -10; col < 10; col++) {
                let previous = 0;
                const variant = snowCell(col, row, 0).variant;
                for (const coverage of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
                    const cell = snowCell(col, row, coverage);
                    expect(cell.variant).toBe(variant);
                    expect(cell.alpha).toBeGreaterThanOrEqual(previous);
                    previous = cell.alpha;
                }
                expect(previous).toBe(1);
                expect(variant).toBeGreaterThanOrEqual(0);
                expect(variant).toBeLessThan(8);
                expect(snowCell(col, row, 0).alpha).toBe(0);
            }
        }
    });
});
