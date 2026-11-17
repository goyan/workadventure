import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { moonPhaseAt, moonPositionAt } from "../../../../../src/front/Phaser/Game/Night/MoonClock";
import { NIGHT_MAX_OPACITY, sunPositionAt } from "../../../../../src/front/Phaser/Game/Night/NightClock";
import {
    MOON_LIGHT_MAX,
    moonlitNightOpacity,
    skyLightAt,
    skyWeatherFactor,
} from "../../../../../src/front/Phaser/Game/Night/SkyLight";

const blue = (color: number): number => color & 0xff;
const red = (color: number): number => (color >> 16) & 0xff;

const high = { elevation: 40, azimuth: 180 };
const low = { elevation: 3, azimuth: 240 };
const down = { elevation: -10, azimuth: 300 };

describe("skyLightAt", () => {
    it("is the sun, at full strength and almost white, while it is high", () => {
        const light = skyLightAt(high, high, 1);
        expect(light?.body).toBe("sun");
        expect(light?.intensity).toBe(1);
        expect(light?.azimuth).toBe(180);
        expect(light?.elevation).toBe(40);
        expect(red(light?.color ?? 0) - blue(light?.color ?? 0)).toBeLessThan(40);
    });

    it("is a weaker, warmer sun near the horizon", () => {
        const light = skyLightAt(low, undefined, 0);
        const noon = skyLightAt(high, undefined, 0);
        expect(light?.body).toBe("sun");
        expect(light?.intensity).toBeGreaterThan(0);
        expect(light?.intensity).toBeLessThan(1);
        expect(blue(light?.color ?? 0)).toBeLessThan(blue(noon?.color ?? 0));
    });

    it("is the moon at night, cold and much weaker than the sun, in proportion to its lit fraction", () => {
        const full = skyLightAt(down, high, 1);
        const half = skyLightAt(down, high, 0.5);
        expect(full?.body).toBe("moon");
        expect(full?.intensity).toBeCloseTo(MOON_LIGHT_MAX, 6);
        expect(MOON_LIGHT_MAX).toBeLessThanOrEqual(0.4);
        expect(half?.intensity).toBeCloseTo(MOON_LIGHT_MAX / 2, 6);
        expect(blue(full?.color ?? 0)).toBeGreaterThan(red(full?.color ?? 0));
    });

    it("gives no light at night without a moon: set, new, or not known", () => {
        expect(skyLightAt(down, { elevation: -5, azimuth: 90 }, 1)).toBeUndefined();
        expect(skyLightAt(down, high, 0)).toBeUndefined();
        expect(skyLightAt(down, undefined, 1)).toBeUndefined();
        expect(skyLightAt(undefined, undefined, 1)).toBeUndefined();
    });

    it("never lets the moon cast shadows while the sun still does", () => {
        // A full moon high in the sky at sunset: the sun keeps the shadows until it has gone.
        expect(skyLightAt(low, high, 1)?.body).toBe("sun");
    });

    it("is dimmed by the weather", () => {
        expect(skyLightAt(high, undefined, 0, 0.25)?.intensity).toBeCloseTo(0.25, 6);
        expect(skyLightAt(down, high, 1, 0.5)?.intensity).toBeCloseTo(MOON_LIGHT_MAX / 2, 6);
    });

    /*
     * Evening and dawn of the full moon of 2026-11-24 in Paris (the moon rises at 16:22 local time, sets at 09:41 the
     * next morning), and evening of the new moon of 2026-11-09, minute by minute: the light never jumps, and changes
     * from one body to the other only once it is out (never two sets of shadows at once).
     */
    for (const [label, from, to] of [
        ["the evening of the full moon", "2026-11-24T14:30:00Z", "2026-11-24T18:30:00Z"],
        ["the dawn after the full moon", "2026-11-25T05:30:00Z", "2026-11-25T08:30:00Z"],
        ["the evening of the new moon", "2026-11-09T15:00:00Z", "2026-11-09T18:00:00Z"],
    ] as const) {
        it(`fades from one body to the other over ${label}`, () => {
            const paris = { latitude: 48.8566, longitude: 2.3522 };
            let previous: { body: string | undefined; intensity: number } | undefined;
            const bodies = new Set<string>();
            for (let time = Date.parse(from); time <= Date.parse(to); time += 60_000) {
                const date = new Date(time);
                const light = skyLightAt(
                    sunPositionAt(date, paris),
                    moonPositionAt(date, paris),
                    moonPhaseAt(date).illuminated,
                );
                const now = { body: light?.body, intensity: light?.intensity ?? 0 };
                if (now.body) bodies.add(now.body);
                if (previous) {
                    expect(Math.abs(now.intensity - previous.intensity)).toBeLessThanOrEqual(0.05);
                    // A change of body only once both lights are as good as out (within what a minute of sun can light).
                    const out = now.intensity <= 0.05 && previous.intensity <= 0.05;
                    if (now.body && previous.body && now.body !== previous.body && !out) {
                        throw new Error(`${previous.body} turned into ${now.body} at ${date.toISOString()}`);
                    }
                }
                previous = now;
            }
            expect(bodies.has("sun")).toBe(true);
        });
    }
});

describe("skyWeatherFactor", () => {
    it("leaves a clear sky alone and takes the shadows almost all away under an overcast one", () => {
        expect(skyWeatherFactor(WeatherType.Clear, 0)).toBe(1);
        expect(skyWeatherFactor(WeatherType.Clear, 0.5)).toBeLessThan(1);
        expect(skyWeatherFactor(WeatherType.Clear, 0.5)).toBeGreaterThan(skyWeatherFactor(WeatherType.Clear, 1));
        expect(skyWeatherFactor(WeatherType.Clear, 1)).toBeLessThanOrEqual(0.2);
    });

    it("takes the shadows almost all away in the rain, the snow, the storm and the fog", () => {
        for (const weather of [WeatherType.Rain, WeatherType.Snow, WeatherType.Storm, WeatherType.Fog]) {
            expect(skyWeatherFactor(weather, 0)).toBeLessThanOrEqual(0.2);
        }
    });
});

describe("moonlitNightOpacity", () => {
    it("lightens the night veil a little under a bright moon, and leaves it alone otherwise", () => {
        const full = skyLightAt(down, high, 1);
        const lightened = moonlitNightOpacity(NIGHT_MAX_OPACITY, full);
        expect(lightened).toBeLessThan(NIGHT_MAX_OPACITY);
        expect(lightened).toBeGreaterThanOrEqual(NIGHT_MAX_OPACITY * 0.8);
        expect(moonlitNightOpacity(NIGHT_MAX_OPACITY, undefined)).toBe(NIGHT_MAX_OPACITY);
        expect(moonlitNightOpacity(NIGHT_MAX_OPACITY, skyLightAt(down, high, 0))).toBe(NIGHT_MAX_OPACITY);
        expect(moonlitNightOpacity(0.3, skyLightAt(low, undefined, 0))).toBe(0.3);
    });
});
