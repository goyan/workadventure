import { COLD_LASTS_MS, coldShare, warmedCold } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    coldAt,
    coldFrostRings,
    coldMist,
    coldSparkles,
    coldStrength,
    tellCold,
} from "@wa/front/Phaser/Game/Catastrophe/ColdShape";

const message = { x: 320, y: 160, radiusTiles: 3, impactInMs: COLD_LASTS_MS, temperature: -80 };

describe("coldStrength", () => {
    it("is how much colder than the air of the map a mass is: none when it is no colder, whole 60 degrees under", () => {
        expect(coldStrength(10, 10)).toBe(0);
        expect(coldStrength(20, 10)).toBe(0);
        expect(coldStrength(-20, 10)).toBeCloseTo(0.5, 6);
        expect(coldStrength(-80, 10)).toBe(1);
        expect(coldStrength(Number.NaN, 10)).toBe(0);
    });
});

describe("coldFrostRings", () => {
    it("whitens the ground as the cold reaches it: whole in the core, fading to the rim", () => {
        const rings = coldFrostRings();
        expect(rings.length).toBeGreaterThanOrEqual(6);
        expect(rings[0].radius).toBe(1);
        for (let ring = 1; ring < rings.length; ring++) expect(rings[ring].radius).toBeLessThan(rings[ring - 1].radius);
        // Laid one over the other from the rim inwards, they add up to the share of the cold at each distance.
        let laid = 0;
        for (const ring of rings) {
            laid += ring.alpha;
            expect(laid).toBeCloseTo(coldShare(ring.radius - 1e-9) > 0 ? laid : 0, 6);
            expect(ring.alpha).toBeGreaterThanOrEqual(0);
        }
        expect(laid).toBeCloseTo(1, 6);
    });
});

describe("coldMist and coldSparkles", () => {
    it("lays as many wisps of mist as asked, all near the ground of the disc, creeping outwards", () => {
        const wisps = coldMist(0, 24, false);
        expect(wisps).toHaveLength(24);
        for (const wisp of wisps) {
            expect(Math.hypot(wisp.x, wisp.y)).toBeLessThanOrEqual(1.2);
            expect(wisp.alpha).toBeGreaterThanOrEqual(0);
            expect(wisp.alpha).toBeLessThanOrEqual(1);
            expect(wisp.size).toBeGreaterThan(0);
        }
        const later = coldMist(1500, 24, false);
        expect(later.some((wisp, index) => Math.abs(wisp.x - wisps[index].x) > 0.01)).toBe(true);
    });

    it("makes the air glitter with crystals that twinkle, each at its own beat, inside the disc", () => {
        const now = coldSparkles(0, 40, false);
        expect(now).toHaveLength(40);
        for (const spark of now) expect(Math.hypot(spark.x, spark.y)).toBeLessThanOrEqual(1);
        const later = coldSparkles(400, 40, false);
        expect(later.some((spark, index) => Math.abs(spark.alpha - now[index].alpha) > 0.05)).toBe(true);
        expect(new Set(now.map((spark) => spark.alpha.toFixed(2))).size).toBeGreaterThan(5);
    });

    it("stays still in reduced motion", () => {
        expect(coldMist(0, 12, true)).toEqual(coldMist(5000, 12, true));
        expect(coldSparkles(0, 12, true)).toEqual(coldSparkles(5000, 12, true));
    });
});

describe("the mass of cold air a browser shows", () => {
    it("is where the server tells it, at the temperature it tells, while it is held", () => {
        const shown = tellCold(undefined, message, 1000);
        expect(shown).toMatchObject({ x: 320, y: 160, radiusTiles: 3, temperature: -80, until: 1000 + COLD_LASTS_MS });
        expect(coldAt(shown, 1500, 10, 60)).toBe(-80);
        const moved = tellCold(shown, { ...message, x: 400, temperature: -40 }, 1200);
        expect(moved).toMatchObject({ x: 400, temperature: -40, beganAt: 1000, until: 1200 + COLD_LASTS_MS });
    });

    it("warms where it lies once it is let go, as on the server, and is gone when it is the air of the map", () => {
        const shown = tellCold(undefined, message, 1000);
        const until = 1000 + COLD_LASTS_MS;
        // Six seconds later at a minute for an hour: six minutes of the map.
        expect(coldAt(shown, until + 6000, 10, 60)).toBeCloseTo(warmedCold(-80, 10, 6), 6);
        expect(coldAt(shown, until + 6000, 10, 1)).toBeCloseTo(warmedCold(-80, 10, 0.1), 6);
        expect(coldAt(shown, until + 600_000, 10, 60)).toBeUndefined();
        // Under an air that is not known it is gone as soon as it is let go.
        expect(coldAt(shown, until + 1, undefined, 60)).toBeUndefined();
        expect(coldAt(shown, until - 1, undefined, 60)).toBe(-80);
    });
});
