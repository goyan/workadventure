import { describe, expect, it } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import {
    effectiveWeather,
    keepOutdoorParticles,
    stormGlow,
    weatherParticles,
    weatherAtTime,
} from "../../../../../src/front/Phaser/Game/Weather/WeatherFrame";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import { SeasonalTheme } from "../../../../../src/front/Phaser/Game/Seasonal/SeasonalTheme";

const view = { x: 0, y: 0, width: 800, height: 600 };

describe("world weather", () => {
    it("does no particle work for clear sky", () => {
        expect(weatherParticles(WeatherType.Clear, 1000, view)).toEqual([]);
    });
    it("keeps overlapping particles fixed in the world when the camera moves", () => {
        const original = weatherParticles(WeatherType.Rain, 1000, view);
        const shifted = weatherParticles(WeatherType.Rain, 1000, { ...view, x: 64 });
        expect(original.filter((particle) => particle.x >= 0 && particle.x < 800)).toEqual(
            shifted.filter((particle) => particle.x >= 0 && particle.x < 800),
        );
        expect(weatherParticles(WeatherType.Rain, 1100, view)).not.toEqual(original);
    });
    it("bounds particle work even when zoomed far out", () => {
        expect(weatherParticles(WeatherType.Snow, 1000, { ...view, width: 20000, height: 20000 }).length).toBeLessThan(
            500,
        );
    });
    it("uses a gentle single storm glow and the same phase for every client", () => {
        expect(stormGlow(600)).toBeCloseTo(0.12);
        expect(stormGlow(23600)).toBeCloseTo(stormGlow(600));
        expect(stormGlow(2000)).toBe(0);
        expect(stormGlow(22999)).toBe(0);
    });
});

describe("common automatic weather", () => {
    it("replaces snowy phases with rain outside November through March", () => {
        for (const date of ["2026-07-01T01:30:00Z", "2026-04-01T01:30:00Z", "2026-10-01T01:30:00Z"]) {
            const clock = new Date(date);
            expect(weatherAtTime(WeatherType.Automatic, clock)).toBe(WeatherType.Rain);
            expect(weatherAtTime(WeatherType.Snow, clock)).toBe(WeatherType.Rain);
        }
        expect(weatherAtTime(WeatherType.Automatic, new Date("2026-11-01T01:30:00Z"))).toBe(WeatherType.Snow);
    });

    it("changes exactly every thirty minutes and repeats after two hours", () => {
        const halfHour = 30 * 60 * 1000;
        expect(weatherAtTime(WeatherType.Automatic, new Date(halfHour - 1))).toBe(WeatherType.Clear);
        for (const [phase, weather] of [
            WeatherType.Clear,
            WeatherType.Rain,
            WeatherType.Storm,
            WeatherType.Snow,
            WeatherType.Clear,
        ].entries()) {
            expect(weatherAtTime(WeatherType.Automatic, new Date(phase * halfHour))).toBe(weather);
            expect(weatherAtTime(WeatherType.Automatic, new Date(phase * halfHour + halfHour - 1))).toBe(weather);
        }
    });
    it("keeps manual choices and waits for a valid server clock", () => {
        expect(weatherAtTime(WeatherType.Rain, undefined)).toBe(WeatherType.Rain);
        expect(weatherAtTime(WeatherType.Automatic, undefined)).toBe(WeatherType.Clear);
        expect(weatherAtTime(WeatherType.Automatic, new Date(NaN))).toBe(WeatherType.Clear);
    });
});

describe("outdoor weather", () => {
    const closedRoom = OutdoorGrid.fromWalls(320, 320, 32, [
        { x: 64, y: 64, width: 160, height: 32 },
        { x: 64, y: 192, width: 160, height: 32 },
        { x: 64, y: 96, width: 32, height: 96 },
        { x: 192, y: 96, width: 32, height: 96 },
    ]);
    const particles = [
        { x: 140, y: 140, length: 2 },
        { x: 10, y: 10, length: 2 },
    ];

    it("keeps every particle without a grid", () => {
        expect(keepOutdoorParticles(particles, undefined)).toEqual(particles);
    });

    it("drops particles above indoor cells", () => {
        expect(keepOutdoorParticles(particles, (x, y) => closedRoom.isOutdoorAt(x, y))).toEqual([particles[1]]);
    });

    it("christmas forces snow", () => {
        expect(effectiveWeather(WeatherType.Rain, SeasonalTheme.Christmas)).toBe(WeatherType.Snow);
        expect(effectiveWeather(WeatherType.Rain, undefined)).toBe(WeatherType.Rain);
        expect(effectiveWeather(WeatherType.Clear, SeasonalTheme.Christmas)).toBe(WeatherType.Snow);
        // Autumn keeps the map weather: its leaves fall on top of it.
        expect(effectiveWeather(WeatherType.Rain, SeasonalTheme.Autumn)).toBe(WeatherType.Rain);
    });
});
