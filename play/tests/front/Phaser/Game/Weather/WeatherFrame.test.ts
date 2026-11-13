import { describe, expect, it } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import {
    effectiveWeather,
    keepOutdoorParticles,
    leafParticles,
    stormGlow,
    weatherParticles,
    weatherAtTime,
} from "../../../../../src/front/Phaser/Game/Weather/WeatherFrame";
import { autoWeatherAt } from "../../../../../src/front/Phaser/Game/Weather/WeatherSchedule";
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
    const halfHour = 30 * 60 * 1000;
    it("replaces fixed snow with rain outside November through March, and never snows there in automatic", () => {
        for (const date of ["2026-07-01T01:30:00Z", "2026-04-01T01:30:00Z", "2026-10-01T01:30:00Z"]) {
            expect(weatherAtTime(WeatherType.Snow, new Date(date))).toBe(WeatherType.Rain);
        }
        expect(weatherAtTime(WeatherType.Snow, new Date("2026-11-01T01:30:00Z"))).toBe(WeatherType.Snow);
        for (const month of ["2026-04", "2026-07", "2026-10"]) {
            for (let t = Date.parse(`${month}-01T00:00:00Z`); t < Date.parse(`${month}-28T00:00:00Z`); t += halfHour) {
                expect(weatherAtTime(WeatherType.Automatic, new Date(t))).not.toBe(WeatherType.Snow);
            }
        }
    });

    it("follows the seasonal schedule in automatic", () => {
        const auto = { frequency: "stormy" as const, include: [WeatherType.Rain, WeatherType.Fog] };
        for (const date of [
            "2026-01-05T08:10:00Z",
            "2026-04-20T17:45:00Z",
            "2026-07-14T12:00:00Z",
            "2026-11-08T13:31:00Z",
        ]) {
            const clock = new Date(date);
            expect(weatherAtTime(WeatherType.Automatic, clock)).toBe(autoWeatherAt(clock));
            expect(weatherAtTime(WeatherType.Automatic, clock, auto)).toBe(autoWeatherAt(clock, auto));
        }
    });

    it("changes only on thirty-minute boundaries", () => {
        const first = Date.parse("2026-01-12T00:00:00Z");
        for (let slot = 0; slot < 48; slot++) {
            const weather = weatherAtTime(WeatherType.Automatic, new Date(first + slot * halfHour));
            expect(weatherAtTime(WeatherType.Automatic, new Date(first + slot * halfHour + halfHour - 1))).toBe(
                weather,
            );
        }
    });

    it("keeps manual choices, fog all day, and waits for a valid server clock", () => {
        expect(weatherAtTime(WeatherType.Rain, undefined)).toBe(WeatherType.Rain);
        for (let hour = 0; hour < 24; hour++) {
            expect(weatherAtTime(WeatherType.Fog, new Date(Date.UTC(2026, 6, 1, hour)))).toBe(WeatherType.Fog);
        }
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

describe("leafParticles", () => {
    const view = { x: 0, y: 0, width: 1280, height: 720 };
    const inView = (particle: { x: number; y: number }) =>
        particle.x >= view.x &&
        particle.x < view.x + view.width &&
        particle.y >= view.y &&
        particle.y < view.y + view.height;

    it("is about three times sparser than snow", () => {
        const snow = weatherParticles(WeatherType.Snow, 0, view).filter(inView).length;
        const leaves = leafParticles(0, view).filter(inView).length;
        expect(leaves).toBeGreaterThan((snow / 3) * 0.8);
        expect(leaves).toBeLessThan((snow / 3) * 1.2);
    });

    it("is the same for everyone at the same time, and falls", () => {
        expect(leafParticles(5000, view)).toEqual(leafParticles(5000, view));
        const before = leafParticles(5000, view);
        const after = leafParticles(5500, view);
        const fell = before.filter((particle, index) => after[index].y > particle.y).length;
        expect(fell).toBeGreaterThan(before.length * 0.9);
    });
});
