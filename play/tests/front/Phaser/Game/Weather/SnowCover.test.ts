import { describe, expect, it } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import {
    snowCell,
    snowCoverage,
    SNOW_ACCUMULATION_MS,
    SNOW_MELT_MS,
    WEATHER_PHASE_MS,
} from "@wa/front/Phaser/Game/Weather/SnowCover";
import { autoWeatherAt } from "@wa/front/Phaser/Game/Weather/WeatherSchedule";

const start = 3 * WEATHER_PHASE_MS;
const isSnow = (epoch: number): boolean => autoWeatherAt(new Date(epoch)) === WeatherType.Snow;

/** First January slot (UTC half-hour) whose snow status matches, found on the real schedule. */
function findSlot(wasSnow: boolean, snow: boolean): number {
    const first = Date.parse("2026-01-01T00:00:00Z");
    for (let t = first; t < first + 60 * 24 * 3600_000; t += WEATHER_PHASE_MS) {
        if (isSnow(t - 1) === wasSnow && isSnow(t) === snow) return t;
    }
    throw new Error("no such slot");
}
describe("shared progressive ground snow", () => {
    it("never accumulates or melts imaginary snow in warm months", () => {
        for (const time of ["2026-07-01T01:40:00Z", "2026-07-01T02:00:00Z"]) {
            const epoch = Date.parse(time);
            expect(snowCoverage(WeatherType.Automatic, epoch)).toBe(0);
            expect(snowCoverage(WeatherType.Snow, epoch)).toBe(0);
        }
    });

    it("accumulates over ten minutes when snow starts, whatever the slot", () => {
        const slot = findSlot(false, true);
        expect(snowCoverage(WeatherType.Automatic, slot)).toBe(0);
        expect(snowCoverage(WeatherType.Automatic, slot + SNOW_ACCUMULATION_MS / 2)).toBe(0.5);
        expect(snowCoverage(WeatherType.Automatic, slot + SNOW_ACCUMULATION_MS)).toBe(1);
        expect(snowCoverage(WeatherType.Automatic, slot + WEATHER_PHASE_MS - 1)).toBe(1);
    });

    it("melts over ten minutes in the slot that follows snow, even after a reload", () => {
        const slot = findSlot(true, false);
        expect(snowCoverage(WeatherType.Automatic, slot)).toBe(1);
        expect(snowCoverage(WeatherType.Automatic, slot + SNOW_MELT_MS / 2)).toBe(0.5);
        expect(snowCoverage(WeatherType.Automatic, slot + SNOW_MELT_MS)).toBe(0);
        expect(snowCoverage(WeatherType.Automatic, slot + WEATHER_PHASE_MS - 1)).toBe(0);
    });

    it("keeps the ground white between two snowy slots", () => {
        const slot = findSlot(true, true);
        expect(snowCoverage(WeatherType.Automatic, slot)).toBe(1);
        expect(snowCoverage(WeatherType.Automatic, slot + SNOW_ACCUMULATION_MS / 2)).toBe(1);
    });

    it("has no snow on the ground when the schedule never snows", () => {
        const auto = { frequency: "normal" as const, include: [WeatherType.Rain] };
        const slot = findSlot(false, true);
        expect(snowCoverage(WeatherType.Automatic, slot + SNOW_ACCUMULATION_MS, undefined, auto)).toBe(0);
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
