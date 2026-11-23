import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    CLOUD_BILLOW_PERIOD_PX,
    HASH_SINE_BOUND,
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
    });
});
