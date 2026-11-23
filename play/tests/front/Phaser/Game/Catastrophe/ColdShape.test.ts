import { airBroughtTo, COLD_LASTS_MS, coldShare, hoarFrost, warmedCold } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    coldAt,
    coldFrostAt,
    coldFrostBands,
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

describe("coldFrostBands", () => {
    const mild = { temperature: 10, humidity: 50, windSpeed: 0 };

    it("lays the hoar frost of the air of the ground: a core, then bands out to the rim, none where it is over zero", () => {
        const bands = coldFrostBands(-80, mild);
        expect(bands[0]).toMatchObject({ inner: 0, outer: 0.5 });
        expect(bands.at(-1)?.outer).toBeCloseTo(1, 9);
        for (let band = 1; band < bands.length; band++) expect(bands[band].inner).toBeCloseTo(bands[band - 1].outer, 9);
        // The frost of each distance is what the rule of the frost says of the air there.
        for (const away of [0, 0.3, 0.6, 0.8, 0.95]) {
            const here = airBroughtTo(mild, 10 - 90 * coldShare(away));
            expect(coldFrostAt(-80, mild, away)).toBeCloseTo(hoarFrost({ ...here, humidity: here.humidity ?? 0 }), 9);
        }
        // A band is that frost, with a little of its neighbours: never further from it than they are.
        for (let band = 1; band < bands.length - 1; band++) {
            const own = coldFrostAt(-80, mild, (bands[band].inner + bands[band].outer) / 2);
            const around = [bands[band - 1], bands[band + 1]].map((other) =>
                coldFrostAt(-80, mild, other.inner === 0 ? 0 : (other.inner + other.outer) / 2),
            );
            expect(bands[band].frost).toBeGreaterThanOrEqual(Math.min(own, ...around) - 1e-9);
            expect(bands[band].frost).toBeLessThanOrEqual(Math.max(own, ...around) + 1e-9);
        }
        // Frost in the core, thicker where the air is only a few degrees under zero, none at the rim (still over 0 °C).
        expect(bands[0].frost).toBeGreaterThan(0.3);
        expect(Math.max(...bands.map((band) => band.frost))).toBeGreaterThan(bands[0].frost);
        expect(bands.at(-1)?.frost).toBe(0);
    });

    it("lays none under a mass no colder than the air of the map, and goes by the cold alone when the humidity is not known", () => {
        expect(coldFrostBands(15, mild).every((band) => band.frost === 0)).toBe(true);
        const unknown = coldFrostBands(-80, { temperature: 10 });
        expect(unknown[0].frost).toBe(1);
        expect(unknown.at(-1)?.frost).toBeLessThan(0.2);
        expect(coldFrostBands(-80, undefined)[0].frost).toBe(1);
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
        // Two seconds later at a minute for an hour: two minutes of the map. In real time: a thirtieth of a minute.
        expect(coldAt(shown, until + 2000, 10, 60)).toBeCloseTo(warmedCold(-80, 10, 2), 6);
        expect(coldAt(shown, until + 2000, 10, 1)).toBeCloseTo(warmedCold(-80, 10, 2 / 60), 6);
        // Sooner in the wind, as on the server.
        expect(coldAt(shown, until + 2000, 10, 60, 10)).toBeCloseTo(warmedCold(-80, 10, 2, 10), 6);
        expect(coldAt(shown, until + 600_000, 10, 60)).toBeUndefined();
        // Under an air that is not known it is gone as soon as it is let go.
        expect(coldAt(shown, until + 1, undefined, 60)).toBeUndefined();
        expect(coldAt(shown, until - 1, undefined, 60)).toBe(-80);
    });
});
