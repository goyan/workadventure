import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { whitecapShare, windHeading } from "../../../../../src/front/Phaser/Game/Terrain/Whitecaps";

describe("whitecapShare", () => {
    it("is nothing in a light wind, a little at force 4, more and more at force 5 and 6", () => {
        // Beaufort: force 2 up to 11 km/h, force 4 from 20 to 28, force 5 from 29 to 38, force 6 from 39 to 49.
        expect(whitecapShare(8)).toBe(0);
        expect(whitecapShare(undefined)).toBe(0);
        expect(whitecapShare(Number.NaN)).toBe(0);
        const force4 = whitecapShare(24);
        const force5 = whitecapShare(34);
        const force6 = whitecapShare(44);
        expect(force4).toBeGreaterThan(0.001);
        expect(force4).toBeLessThan(0.006);
        expect(force5).toBeGreaterThan(force4 * 2);
        expect(force6).toBeGreaterThan(force5 * 2);
        expect(force6).toBeLessThan(0.05);
        expect(whitecapShare(100000)).toBe(1);
    });
});

describe("windHeading", () => {
    it("is where the wind goes: south under a north wind, west under an east wind", () => {
        expect(windHeading(0)).toEqual({ x: 0, y: 1 });
        const east = windHeading(90);
        expect(east?.x).toBeCloseTo(-1, 5);
        expect(east?.y).toBeCloseTo(0, 5);
        expect(windHeading(undefined)).toBeUndefined();
    });
});

describe("the whitecaps drawn by the water shader (GroundSplat)", () => {
    const source = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../src/front/Phaser/Game/Terrain/GroundSplat.ts"),
        "utf8",
    );
    const whitecaps = source.slice(source.indexOf("float whitecapsAt("), source.indexOf("const vec3 SHALLOW"));

    it("draws the chance of a cell without sin, from numbers kept small however long the game ran", () => {
        // The sine of a large number is computed badly by the GPUs: on Metal, hash() returned the same value
        // everywhere once the clock had run an hour, and every cell broke (a regular grid of crests on the water).
        expect(whitecaps.length).toBeGreaterThan(100);
        expect(whitecaps).not.toMatch(/[^a-zA-Z]hash\(/);
        expect(whitecaps).toMatch(/mod\(t, 7200\.0\)/);
        expect(whitecaps).toMatch(/mod\(floor\(p\), 4096\.0\)/);
        expect(whitecaps).toMatch(/mod\(floor\(phase\), 4096\.0\)/);
    });

    /** capHash of the shader, in 32-bit floats as a GPU computes it. */
    const f = Math.fround;
    const fract = (v: number): number => f(v - Math.floor(v));
    function capHash(x: number, y: number): number {
        let a = fract(f(f(x) * f(0.1031)));
        let b = fract(f(f(y) * f(0.1031)));
        let c = fract(f(f(x) * f(0.1031)));
        const d = f(f(a * f(b + 33.33)) + f(f(b * f(c + 33.33)) + f(c * f(a + 33.33))));
        a = f(a + d);
        b = f(b + d);
        c = f(c + d);
        return fract(f(f(a + b) * c));
    }

    it("lets as many cells break as the wind asks, wherever and whenever (32-bit floats)", () => {
        // 22 km/h: 0.18 % of the water, ten times as many cells. Every cell and every turn the shader may draw.
        const target = Math.min(1, whitecapShare(22) * 10);
        for (const [turn, x0, y0] of [
            [0, 0, 0],
            [2400, 0, 0],
            [4095, 0, 0],
            [100, 3900, 3900],
        ]) {
            let broken = 0;
            let cells = 0;
            for (let y = y0; y < y0 + 160; y++) {
                for (let x = x0; x < x0 + 160; x++) {
                    cells++;
                    if (capHash(x + turn * 17 + 11, y + turn * 29 + 5) <= target) broken++;
                }
            }
            expect(broken / cells, `turn ${turn} at ${x0}, ${y0}`).toBeGreaterThan(target * 0.75);
            expect(broken / cells, `turn ${turn} at ${x0}, ${y0}`).toBeLessThan(target * 1.25);
        }
    });
});
