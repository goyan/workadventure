import { describe, expect, it } from "vitest";
import {
    drawFlake,
    FLAKE_KINDS,
    FLAKE_LIGHT,
    flakeMix,
    PX_PER_METRE,
    snowflakes,
    snowLevel,
    snowTones,
    snowWind,
} from "../../../../../src/front/Phaser/Game/Weather/Snowfall";
import type { Snowflake, SnowFall } from "../../../../../src/front/Phaser/Game/Weather/Snowfall";
import { SkyDrift } from "../../../../../src/front/Phaser/Game/Weather/Clouds";

const view = { x: 0, y: 0, width: 960, height: 720 };
const calm = { shift: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
const EPOCH = 1_763_700_000_000;

/** The air after `seconds` of a steady wind. */
function steady(velocity: { x: number; y: number }, seconds: number) {
    return { shift: { x: velocity.x * seconds, y: velocity.y * seconds }, velocity };
}

const fallOf = (rate: number, air?: { temperature: number; humidity: number }, share = 1): SnowFall => ({
    level: snowLevel(rate, share),
    mix: flakeMix(air),
});

const id = (flake: Snowflake): string => [flake.kind, flake.plane, flake.column, flake.row, flake.cycle].join("|");
const byId = (flakes: Snowflake[]): Map<string, Snowflake> => new Map(flakes.map((flake) => [id(flake), flake]));
const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("snowfall", () => {
    it("shows no flake without snow", () => {
        expect(snowLevel(3, 0)).toBe(0);
        expect(snowLevel(3, Number.NaN)).toBe(0);
        expect(snowflakes(EPOCH, view, { level: 0, mix: flakeMix(undefined) }, calm)).toEqual([]);
        expect(snowflakes(EPOCH, view, fallOf(2, undefined, 0), calm)).toEqual([]);
    });

    it("shows more flakes the harder it snows, the same ones first", () => {
        const air = { temperature: -4, humidity: 90 };
        const light = snowflakes(EPOCH, view, fallOf(0.2, air), calm);
        const moderate = snowflakes(EPOCH, view, fallOf(1, air), calm);
        const heavy = snowflakes(EPOCH, view, fallOf(4, air), calm);
        expect(light.length).toBeGreaterThan(0);
        expect(light.length * 1.5).toBeLessThan(moderate.length);
        expect(moderate.length).toBeLessThan(heavy.length);
        // A heavy fall is a curtain: hundreds of flakes on the screen.
        expect(heavy.length).toBeGreaterThan(400);
        for (const flake of light) expect(heavy).toContainEqual(flake);
    });

    it("lets a sleet show fewer flakes than a snow of the same rate", () => {
        const air = { temperature: -1, humidity: 95 };
        expect(snowflakes(EPOCH, view, fallOf(2, air, 0.4), calm).length).toBeLessThan(
            snowflakes(EPOCH, view, fallOf(2, air, 1), calm).length,
        );
    });

    it("falls about a metre a second, far slower than rain, the big aggregates a little faster", () => {
        for (const kind of FLAKE_KINDS) {
            expect(kind.fallSpeed).toBeGreaterThan(0.5);
            expect(kind.fallSpeed).toBeLessThan(1.5);
        }
        expect(FLAKE_KINDS[0].fallSpeed).toBeGreaterThan(FLAKE_KINDS[2].fallSpeed);
        expect(FLAKE_KINDS[0].diameterMm).toBeGreaterThan(FLAKE_KINDS[2].diameterMm);
    });

    it("falls in big slow-swaying flakes near 0 °C and in many fine crystals in a hard frost", () => {
        const mild = flakeMix({ temperature: -1, humidity: 93 });
        const frost = flakeMix({ temperature: -20, humidity: 70 });
        expect(mild[0]).toBeGreaterThan(0.5);
        expect(frost[2]).toBeGreaterThan(0.5);
        for (const mix of [mild, frost]) expect(mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        const big = snowflakes(EPOCH, view, fallOf(1, { temperature: -1, humidity: 93 }), calm);
        const fine = snowflakes(EPOCH, view, fallOf(1, { temperature: -20, humidity: 70 }), calm);
        expect(mean(big.map((flake) => flake.size))).toBeGreaterThan(mean(fine.map((flake) => flake.size)) + 1);
        // The same water in small crystals is many more of them.
        expect(fine.length).toBeGreaterThan(big.length * 2);
    });

    it("falls straight down in a calm, at its speed", () => {
        const before = byId(snowflakes(EPOCH, view, fallOf(2), calm));
        const after = snowflakes(EPOCH + 1000, view, fallOf(2), calm);
        let compared = 0;
        for (const flake of after) {
            const was = before.get(id(flake));
            if (!was || was.lying || flake.lying) continue;
            compared++;
            const kind = FLAKE_KINDS[flake.kind];
            // Only its sway moves it sideways.
            expect(Math.abs(flake.x - was.x)).toBeLessThanOrEqual(2 * kind.flutterPx + 0.01);
            const down = flake.y - was.y;
            expect(down).toBeGreaterThan(kind.fallSpeed * PX_PER_METRE * 0.7);
            expect(down).toBeLessThan(kind.fallSpeed * PX_PER_METRE * 1.4);
        }
        expect(compared).toBeGreaterThan(50);
    });

    it("drifts with the wind, in its direction, faster than it falls in a 13 km/h breeze", () => {
        const fromWest = snowWind(270, 13);
        expect(fromWest.x).toBeGreaterThan(0);
        expect(Math.abs(fromWest.y)).toBeLessThan(1e-9);
        const fromSouth = snowWind(180, 13);
        expect(fromSouth.y).toBeLessThan(0);
        expect(snowWind(90, 13).x).toBeLessThan(0);
        expect(snowWind(270, 0).x).toBe(0);
        expect(snowWind(270, 26).x).toBeCloseTo(2 * fromWest.x);
        expect(snowWind(270, 13, 0).x).toBe(0);
        // 13 km/h near the ground is about 2.9 m/s: more than twice the fall of a flake.
        expect(fromWest.x / PX_PER_METRE).toBeGreaterThan(2 * FLAKE_KINDS[0].fallSpeed);
        for (const [speed, ratio] of [
            [13, 1.5],
            [60, 8],
        ] as const) {
            const wind = snowWind(270, speed);
            const before = byId(snowflakes(EPOCH, view, fallOf(2), steady(wind, 100)));
            const after = snowflakes(EPOCH + 500, view, fallOf(2), steady(wind, 100.5));
            let compared = 0;
            for (const flake of after) {
                const was = before.get(id(flake));
                if (!was || was.lying || flake.lying) continue;
                compared++;
                const across = flake.x - was.x;
                const down = flake.y - was.y;
                expect(across).toBeGreaterThan(0);
                // Lying almost flat in a strong wind.
                expect(across).toBeGreaterThan(ratio * Math.abs(down));
            }
            expect(compared).toBeGreaterThan(20);
        }
    });

    it("keeps the flakes fixed to the map when the camera moves", () => {
        const fall = fallOf(2);
        const original = snowflakes(EPOCH, view, fall, calm);
        const shifted = snowflakes(EPOCH, { ...view, x: 200, y: 150 }, fall, calm);
        const inBoth = (flakes: Snowflake[]) =>
            flakes.filter((flake) => flake.x >= 200 && flake.x <= 960 && flake.y >= 150 && flake.y <= 720);
        expect(inBoth(original).length).toBeGreaterThan(50);
        expect(inBoth(shifted)).toEqual(inBoth(original));
    });

    it("never makes a flake jump between two images, even when the wind, the cold or the rate change", () => {
        const drift = new SkyDrift();
        const step = 1000 / 30;
        let previous: Map<string, Snowflake> | undefined;
        let compared = 0;
        for (let frame = 0; frame < 90; frame++) {
            const epoch = EPOCH + frame * step;
            // The wind turns and strengthens, the air cools, the snow thickens, all at once.
            const velocity = snowWind(200 + frame, 5 + frame / 2);
            const air = { shift: drift.at(epoch, velocity), velocity };
            const fall = fallOf(0.5 + frame / 30, { temperature: -1 - frame / 6, humidity: 90 });
            const flakes = snowflakes(epoch, view, fall, air);
            if (previous) {
                for (const flake of flakes) {
                    const was = previous.get(id(flake));
                    if (!was) continue;
                    compared++;
                    const moved = Math.hypot(flake.x - was.x, flake.y - was.y);
                    // The air (at most 45 km/h here) and the fall over a thirtieth of a second, and the sway.
                    expect(moved).toBeLessThan(15);
                }
            }
            previous = byId(flakes);
        }
        expect(compared).toBeGreaterThan(1000);
    });

    it("lets each flake fall a long way, not loop in a small cell", () => {
        const fall = { level: 1, mix: [1, 0, 0] };
        const start = byId(snowflakes(EPOCH, view, fall, calm));
        let longest = 0;
        for (let second = 1; second <= 15; second++) {
            for (const flake of snowflakes(EPOCH + second * 1000, view, fall, calm)) {
                const was = start.get(id(flake));
                if (was && !flake.lying) longest = Math.max(longest, flake.y - was.y);
            }
        }
        // Over 9 m, about the whole height of a screen of a usual zoom.
        expect(longest).toBeGreaterThan(250);
    });

    it("stands still when motion is reduced", () => {
        const fall = fallOf(2);
        const wind = steady(snowWind(270, 30), 0);
        expect(snowflakes(EPOCH + 5000, view, fall, wind, undefined, true)).toEqual(
            snowflakes(EPOCH, view, fall, wind, undefined, true),
        );
        expect(snowflakes(EPOCH, view, fall, wind, undefined, true).length).toBeGreaterThan(0);
    });

    it("bounds the number of flakes, at the heaviest fall and seen from very far", () => {
        const hardest = { level: 1, mix: [0, 0, 1] };
        const near = snowflakes(EPOCH, view, hardest, calm).length;
        const far = snowflakes(EPOCH, { x: 0, y: 0, width: 20000, height: 15000 }, hardest, calm).length;
        expect(near).toBeLessThan(4500);
        expect(far).toBeLessThan(4500);
        expect(far).toBeGreaterThan(near / 4);
    });

    it("snows thicker under a thick cloud, a flake keeping its look for its whole fall", () => {
        const fall = fallOf(1);
        const under = snowflakes(EPOCH, view, fall, calm, () => 1.4).length;
        const gap = snowflakes(EPOCH, view, fall, calm, () => 0.5).length;
        expect(under).toBeGreaterThan(gap);
    });

    it("draws a flake in whole pixels, lit and shaded, darker and fainter at night", () => {
        const calls: string[] = [];
        drawFlake(
            {
                fillStyle: (color: number) => calls.push(`style ${color}`),
                fillRect: (x: number, y: number, width: number, height: number) =>
                    calls.push(`rect ${x} ${y} ${width} ${height}`),
            },
            10.4,
            20.6,
            3,
            1,
            snowTones(0),
        );
        expect(calls[0]).toBe(`style ${FLAKE_LIGHT}`);
        expect(calls.filter((call) => call.startsWith("style"))).toHaveLength(2);
        for (const call of calls.filter((entry) => entry.startsWith("rect"))) {
            for (const value of call.split(" ").slice(1)) expect(Number.isInteger(Number(value))).toBe(true);
        }
        const night = snowTones(1);
        expect(night.light).toBeLessThan(FLAKE_LIGHT);
        expect(night.alpha).toBeLessThan(1);
        expect(snowTones(0).alpha).toBe(1);
    });
});
