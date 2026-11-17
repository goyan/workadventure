import { describe, expect, it } from "vitest";
import {
    boundedTo,
    DEFAULT_SKY_LIGHT_SETTINGS,
    MAX_SHADOW_TILES,
    MOON_LIGHT_MAX,
    moonlitNightOpacity,
    moonPhaseLight,
    skyLightAt,
} from "../../../../../src/front/Phaser/Game/Night/SkyLight";
import type { SkyLightSettings } from "../../../../../src/front/Phaser/Game/Night/SkyLight";
import { NIGHT_MAX_OPACITY } from "../../../../../src/front/Phaser/Game/Night/NightClock";

const high = { elevation: 40, azimuth: 180 };
const noon = { elevation: 60, azimuth: 180 };
const down = { elevation: -10, azimuth: 300 };
const red = (color: number): number => (color >> 16) & 0xff;
const green = (color: number): number => (color >> 8) & 0xff;
const blue = (color: number): number => color & 0xff;

/** Settings changed for one body. */
function withSun(sun: Partial<SkyLightSettings["sun"]>): SkyLightSettings {
    return { ...DEFAULT_SKY_LIGHT_SETTINGS, sun: { ...DEFAULT_SKY_LIGHT_SETTINGS.sun, ...sun } };
}
function withMoon(moon: Partial<SkyLightSettings["moon"]>): SkyLightSettings {
    return { ...DEFAULT_SKY_LIGHT_SETTINGS, moon: { ...DEFAULT_SKY_LIGHT_SETTINGS.moon, ...moon } };
}

describe("boundedTo", () => {
    it("brings a value into its range, and lets the maximum win over a higher minimum", () => {
        expect(boundedTo(0.5, { min: 0, max: 1 })).toBe(0.5);
        expect(boundedTo(-1, { min: 0.2, max: 1 })).toBe(0.2);
        expect(boundedTo(3, { min: 0, max: 1.5 })).toBe(1.5);
        expect(boundedTo(0.1, { min: 0.8, max: 0.5 })).toBe(0.5);
        expect(boundedTo(0.9, { min: 0.8, max: 0.5 })).toBe(0.5);
    });
});

/*
 * The realistic curve: Krisciunas & Schaefer, "A model of the brightness of moonlight", PASP 103 (1991), p. 1035,
 * equations (8) and (9) after Allen 1976: m = -12.73 + 0.026 |α| + 4 × 10⁻⁹ α⁴ (α the phase angle in degrees) and
 * I* = 10^(-0.4 (m + 16.57)); scanned paper read on 2026-11-17 at
 * https://cta-redmine.irap.omp.eu/attachments/download/3619/1991PASP__103_1033K.pdf. Against the full moon (α = 0):
 * 10^(-0.4 (0.026 |α| + 4 × 10⁻⁹ α⁴)). The expected values below are that published formula, evaluated.
 */
const published = (alpha: number): number => 10 ** (-0.4 * (0.026 * Math.abs(alpha) + 4e-9 * alpha ** 4));
/** The illuminated fraction at a phase angle (Meeus 48.1). */
const lit = (alpha: number): number => (1 + Math.cos((alpha * Math.PI) / 180)) / 2;

describe("moonPhaseLight", () => {
    it("follows the published brightness of the moon against its phase angle, 1 at the full moon", () => {
        for (const alpha of [0, 30, 60, 90, 120, 150]) {
            // Within 0.001: the curve is shifted by its value at the new moon (0.0003), so that it gives 0 there.
            expect(moonPhaseLight(lit(alpha), "realistic")).toBeCloseTo(published(alpha), 3);
        }
        // A quarter moon lights about a tenth of the full moon, not half of it.
        expect(moonPhaseLight(0.5, "realistic")).toBeCloseTo(published(90), 3);
        expect(published(90)).toBeLessThan(0.1);
        expect(moonPhaseLight(0, "realistic")).toBe(0);
    });

    it("grows with the lit fraction on both curves, linearly on the linear one", () => {
        let previous = -1;
        for (let fraction = 0; fraction <= 1; fraction += 0.05) {
            const realistic = moonPhaseLight(fraction, "realistic");
            expect(realistic).toBeGreaterThanOrEqual(previous);
            previous = realistic;
            expect(moonPhaseLight(fraction, "linear")).toBeCloseTo(fraction, 9);
        }
        expect(moonPhaseLight(1, "realistic")).toBeCloseTo(1, 9);
    });
});

describe("skyLightAt, with the personal settings", () => {
    it("gives the same light with the default settings as without", () => {
        expect(skyLightAt(high, undefined, 0, 0.6, DEFAULT_SKY_LIGHT_SETTINGS)).toEqual(
            skyLightAt(high, undefined, 0, 0.6),
        );
        expect(skyLightAt(down, high, 0.7, 1, DEFAULT_SKY_LIGHT_SETTINGS)).toEqual(skyLightAt(down, high, 0.7));
        expect(skyLightAt(high, undefined, 0)?.shadowLength).toEqual({ min: 0, max: 4 * 32 });
    });

    it("dims the moon of a quarter far more on the realistic curve than on the linear one", () => {
        const realistic = skyLightAt(down, high, 0.5)?.intensity ?? 0;
        const linear = skyLightAt(down, high, 0.5, 1, withMoon({ phaseCurve: "linear" }))?.intensity ?? 0;
        expect(linear).toBeCloseTo(MOON_LIGHT_MAX / 2, 6);
        expect(realistic).toBeCloseTo(MOON_LIGHT_MAX * published(90), 3);
    });

    it("turns each body off on its own: the other one goes on", () => {
        const noSun = withSun({ enabled: false });
        const noMoon = withMoon({ enabled: false });
        const neither = { sun: noSun.sun, moon: noMoon.moon };
        expect(skyLightAt(high, undefined, 0, 1, noSun)).toBeUndefined();
        expect(skyLightAt(down, high, 1, 1, noSun)?.body).toBe("moon");
        expect(skyLightAt(down, high, 1, 1, noMoon)).toBeUndefined();
        expect(skyLightAt(high, high, 1, 1, noMoon)?.body).toBe("sun");
        expect(skyLightAt(high, high, 1, 1, neither)).toBeUndefined();
        expect(skyLightAt(down, high, 1, 1, neither)).toBeUndefined();
        // Without the moon, the night veil is not lightened.
        expect(moonlitNightOpacity(NIGHT_MAX_OPACITY, skyLightAt(down, high, 1, 1, noMoon))).toBe(NIGHT_MAX_OPACITY);
    });

    it("scales the light to the maximum set, keeps it above the minimum while the body is up, and never above 1", () => {
        expect(
            skyLightAt(high, undefined, 0, 0.5, withSun({ intensity: { min: 0, max: 0.5 } }))?.intensity,
        ).toBeCloseTo(0.25, 9);
        // Under an overcast sky (0.15 of the light), a minimum of 60 % holds.
        expect(skyLightAt(high, undefined, 0, 0.15, withSun({ intensity: { min: 0.6, max: 1 } }))?.intensity).toBe(0.6);
        expect(skyLightAt(high, undefined, 0, 1, withSun({ intensity: { min: 0, max: 2 } }))?.intensity).toBe(1);
        // 0 %: nothing is lit by that body.
        expect(skyLightAt(high, undefined, 0, 1, withSun({ intensity: { min: 0, max: 0 } }))).toBeUndefined();
        // A minimum above the maximum: the maximum wins.
        expect(skyLightAt(high, undefined, 0, 0.1, withSun({ intensity: { min: 0.9, max: 0.4 } }))?.intensity).toBe(
            0.4,
        );
    });

    it("gives a little moon even as a thin crescent with a minimum, and none at all once set", () => {
        const crescent = skyLightAt(down, high, 0.02, 1, withMoon({ intensity: { min: 0.5, max: 1 } }));
        expect(crescent?.intensity).toBeCloseTo(MOON_LIGHT_MAX * 0.5, 9);
        expect(
            skyLightAt(down, { elevation: -3, azimuth: 90 }, 1, 1, withMoon({ intensity: { min: 1, max: 1 } })),
        ).toBe(undefined);
        // Nor a sun at night.
        expect(skyLightAt(down, undefined, 0, 1, withSun({ intensity: { min: 1, max: 1 } }))).toBeUndefined();
        // A bright moon set to twice its usual light lightens the veil more, the night still readable.
        const bright = skyLightAt(down, high, 1, 1, withMoon({ intensity: { min: 0, max: 2 } }));
        expect(moonlitNightOpacity(NIGHT_MAX_OPACITY, bright)).toBeGreaterThanOrEqual(NIGHT_MAX_OPACITY * 0.7);
    });

    it("doses the colour of the light: neutral at 0 %, stronger up to 200 %, never weaker than the minimum", () => {
        const low = { elevation: 4, azimuth: 250 };
        const usual = skyLightAt(low, undefined, 0)?.color ?? 0;
        const neutral = skyLightAt(low, undefined, 0, 1, withSun({ color: { min: 0, max: 0 } }))?.color;
        const stronger = skyLightAt(low, undefined, 0, 1, withSun({ color: { min: 0, max: 2 } }))?.color ?? 0;
        expect(neutral).toBe(0xffffff);
        expect(blue(stronger)).toBeLessThan(blue(usual));
        expect(green(stronger)).toBeLessThan(green(usual));
        expect(red(stronger)).toBe(255);
        // A high sun is almost white; a minimum of 100 % keeps it golden.
        const golden = skyLightAt(noon, undefined, 0, 1, withSun({ color: { min: 1, max: 1 } }))?.color;
        expect(golden).toBe(usual);
        // The moon: neutral at 0 %, its cold blue by default.
        expect(skyLightAt(down, high, 1, 1, withMoon({ color: { min: 0, max: 0 } }))?.color).toBe(0xffffff);
    });

    it("gives the shadow length limits set, in map pixels, the maximum never above the hard ceiling", () => {
        expect(skyLightAt(high, undefined, 0, 1, withSun({ shadowLength: { min: 1, max: 6 } }))?.shadowLength).toEqual({
            min: 32,
            max: 192,
        });
        expect(skyLightAt(high, undefined, 0, 1, withSun({ shadowLength: { min: 0, max: 20 } }))?.shadowLength).toEqual(
            { min: 0, max: MAX_SHADOW_TILES * 32 },
        );
        expect(skyLightAt(high, undefined, 0, 1, withSun({ shadowLength: { min: 2, max: 1 } }))?.shadowLength).toEqual({
            min: 32,
            max: 32,
        });
        expect(skyLightAt(down, high, 1, 1, withMoon({ shadowLength: { min: 0, max: 2 } }))?.shadowLength).toEqual({
            min: 0,
            max: 64,
        });
    });
});
