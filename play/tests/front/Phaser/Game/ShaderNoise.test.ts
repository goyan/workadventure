import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    billowDrift,
    CLOUD_BILLOW_PERIOD_PX,
    DRIFT_BAND_FROM,
    driftPhase,
    groundDrifts,
    HASH_SINE_BOUND,
    octaveDrifts,
    NOISE_GLSL,
    SHADER_CLOCK_PERIOD_S,
    shaderSeconds,
    shaderWrap,
} from "../../../../src/front/Phaser/Game/ShaderNoise";

const GAME = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../src/front/Phaser/Game");
const sourceOf = (file: string): string => readFileSync(resolve(GAME, file), "utf8");

describe("the noise of the shaders, however long a page stays open", () => {
    it("reads a clock that goes round once a day: never more than 86 400 s, exact within the day", () => {
        expect(SHADER_CLOCK_PERIOD_S).toBe(86_400);
        expect(shaderSeconds(60_000)).toBe(60);
        expect(shaderSeconds(3_600_000)).toBe(3600);
        // A week, a month: back under a day, the time of the day kept to the millisecond.
        expect(shaderSeconds(7 * 86_400_000 + 1234)).toBeCloseTo(1.234, 9);
        expect(shaderSeconds(30 * 86_400_000 + 45_678_901)).toBeCloseTo(45_678.901, 6);
        expect(shaderSeconds(Number.NaN)).toBe(0);
    });

    it("brings the drift of the clouds into one period of their billows, whole cells of the hash", () => {
        expect(CLOUD_BILLOW_PERIOD_PX % (30 * 4096)).toBe(0);
        // The drift read from the clock of the world: billions of pixels.
        const drift = 60 * (Date.UTC(2026, 10, 23) / 1000);
        expect(shaderWrap(drift, CLOUD_BILLOW_PERIOD_PX)).toBeGreaterThanOrEqual(0);
        expect(shaderWrap(drift, CLOUD_BILLOW_PERIOD_PX)).toBeLessThan(CLOUD_BILLOW_PERIOD_PX);
        expect(shaderWrap(-5, 100)).toBe(95);
    });

    it("keeps the hash of always where a GPU computes its sine right, and goes without sine beyond", () => {
        expect(HASH_SINE_BOUND).toBe(6.0e6);
        expect(NOISE_GLSL).toContain("fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453)");
        expect(NOISE_GLSL).toContain("float hashWide(vec2 p)");
        expect(NOISE_GLSL).toContain("mod(p.xyx, 4096.0)");
        expect(NOISE_GLSL).toContain("> 6000000.0");
    });

    it("is the only noise of the shaders of the ground, the water and the clouds, read on the clock that goes round", () => {
        for (const file of ["Terrain/GroundSplat.ts", "Weather/CloudLayer.ts"]) {
            const source = sourceOf(file);
            // No hash of their own: a sine of a large number would come back.
            expect(source, file).not.toContain("fract(sin(");
            expect(source, file).toContain("${NOISE_GLSL}");
            expect(source, file).toContain("shaderSeconds(this.scene.time.now)");
            expect(source, file).not.toMatch(/scene\.time\.now \/ 1000/);
        }
        expect(sourceOf("Weather/CloudLayer.ts")).toContain("shaderWrap(frame.sky.x, CLOUD_BILLOW_PERIOD_PX)");
    });
});

describe("the drifts of the noises, computed on the processor", () => {
    it("are the drift as it is for a long while: the noise looks as it did", () => {
        expect(driftPhase(60, 0.06)).toBeCloseTo(3.6, 12);
        expect(driftPhase(60, -0.08)).toBeCloseTo(-4.8, 12);
        // At 3 cells a second, the fastest, the band is reached after a day.
        expect(driftPhase(86_000, 3)).toBe(258_000);
    });

    it("then go round in a band where the noise repeats, without a jump", () => {
        expect(DRIFT_BAND_FROM % 4096).toBe(0);
        // Into the band where it is reached, the same number.
        expect(driftPhase(DRIFT_BAND_FROM, 1)).toBe(DRIFT_BAND_FROM);
        // A turn of the band later: the same phase, to the noise that reads it modulo 4096.
        for (const seconds of [1e6, 3e6, 2.6e6 + 0.37]) {
            const now = driftPhase(seconds, 0.35);
            const later = driftPhase(seconds + 4096 / 0.35, 0.35);
            expect(later).toBeCloseTo(now, 6);
            expect(now).toBeGreaterThanOrEqual(DRIFT_BAND_FROM);
            expect(now).toBeLessThan(DRIFT_BAND_FROM + 4096);
        }
        // A drift that runs negative goes round in the same band, above (large negative noise does not repeat on Metal).
        expect(driftPhase(1e7, -0.25)).toBeGreaterThanOrEqual(DRIFT_BAND_FROM);
        expect(Number.isFinite(driftPhase(Number.NaN, 1))).toBe(true);
    });

    it("give each octave of fbm its own drift: x 1, x 2.03, x 4.01", () => {
        const { first, third } = octaveDrifts(100, 0.09, 0.05);
        expect(first).toEqual([
            driftPhase(100, 0.09),
            driftPhase(100, 0.05),
            driftPhase(100, 0.09 * 2.03),
            driftPhase(100, 0.05 * 2.03),
        ]);
        expect(third).toEqual([driftPhase(100, 0.09 * 4.01), driftPhase(100, 0.05 * 4.01)]);
        expect(billowDrift(100_000).first[0]).toBeCloseTo(1.2, 12);
        const drifts = groundDrifts(30 * 86_400_000);
        for (const value of [...drifts.fire, ...drifts.waterNear.first, ...drifts.boil.third, drifts.glint]) {
            expect(Math.abs(value)).toBeLessThan(DRIFT_BAND_FROM + 4096);
        }
        expect(drifts.wave).toBeGreaterThanOrEqual(0);
        expect(drifts.wave).toBeLessThan(2 * Math.PI);
    });

    it("are what the shaders drift by: no drift of their own computed from the clock", () => {
        const ground = sourceOf("Terrain/GroundSplat.ts");
        // What stays on the clock: the whitecaps (they go round every two hours) and the ripples of the current (their
        // speed differs at every pixel: no phase to compute beforehand).
        const onClock = ground.match(/\b(t|uTime) \* [0-9.]+/g) ?? [];
        expect(onClock).toEqual([]);
        expect(ground).toContain("fbmDrift(p, uWaterNearA, uWaterNearB)");
        expect(ground).toContain("sin(uWavePhase + drift * 12.0)");
        expect(ground).toContain("groundDrifts(this.scene.time.now)");
        const clouds = sourceOf("Weather/CloudLayer.ts");
        expect(clouds).not.toMatch(/uTime \* 0\./);
        expect(clouds).toContain("fbmDrift(p / 30.0, uBillowA, uBillowB)");
    });
});
