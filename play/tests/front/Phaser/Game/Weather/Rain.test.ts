import { describe, expect, it } from "vitest";
import {
    forcedRainLevel,
    parseRainLevel,
    rainDrops,
    rainIntensity,
    rainSlant,
    followWind,
    MAX_RAIN_SLANT,
    RAIN_FALL_SPEEDS,
    rainScreenSpeeds,
    rainLoudness,
    rainSplashes,
    rainUnderCloud,
    STORM_RAIN,
    USUAL_RAIN,
    RAIN_NATIVE_SCALE,
    rainCell,
    rainFineness,
} from "../../../../../src/front/Phaser/Game/Weather/Rain";
import { FLAKE_KINDS, groundWind, PX_PER_METRE } from "../../../../../src/front/Phaser/Game/Weather/Snowfall";

const view = { x: 0, y: 0, width: 800, height: 600 };
const EPOCH = 1_794_995_262_000;
const calmAir = { x: 0, y: 0 };
/** A west wind leaning the far drops by about `lean` (pixels sideways for one down). */
const westWind = (lean: number) => ({ x: lean * RAIN_FALL_SPEEDS[0] * PX_PER_METRE, y: 0 });

describe("rainIntensity", () => {
    it("grows with the rate, through the light, moderate and heavy rains of the AMS glossary", () => {
        // Light up to 2.5 mm/h, moderate up to 7.6, heavy over.
        expect(rainIntensity(0.4)).toBeLessThan(rainIntensity(2.5));
        expect(rainIntensity(2.5)).toBeLessThan(rainIntensity(7.6));
        expect(rainIntensity(7.6)).toBeLessThan(rainIntensity(20));
        expect(rainIntensity(500)).toBe(1);
    });

    it("never shows nothing while it rains, and a steady rain when the rate is unknown", () => {
        expect(rainIntensity(0)).toBeGreaterThan(0);
        expect(rainIntensity(undefined)).toBe(USUAL_RAIN);
        expect(rainIntensity(Number.NaN)).toBe(USUAL_RAIN);
    });

    it("keeps a storm hard, whatever its rate", () => {
        expect(rainIntensity(undefined, true)).toBe(STORM_RAIN);
        expect(rainIntensity(0.4, true)).toBe(STORM_RAIN);
        expect(rainIntensity(30, true)).toBe(1);
    });
});

describe("rain in the wind", () => {
    const calm = { x: 0, y: 0 };

    it("falls at the speeds of real drops, about 5 to 9 m/s (Atlas et al. 1973, fit to Gunn and Kinzer 1949)", () => {
        expect(RAIN_FALL_SPEEDS.map((speed) => Math.round(speed * 10) / 10)).toEqual([5.2, 7.9, 9.1]);
        // The planes fall on the screen as fast as their drops, the near one seen 1.25 times faster.
        expect(rainScreenSpeeds().map((speed, index) => speed / (RAIN_FALL_SPEEDS[index] * PX_PER_METRE))).toEqual([
            expect.closeTo(1, 1),
            expect.closeTo(1, 1),
            expect.closeTo(1.25, 1),
        ]);
    });

    it("falls straight down in a calm", () => {
        for (let layer = 0; layer < 3; layer++) expect(rainSlant(calm, layer)).toEqual({ x: 0, y: 0 });
    });

    it("leans the way the wind blows, by the wind over the speed of the drop", () => {
        const west = groundWind(270, 13);
        const slant = rainSlant(west, 0);
        expect(slant.x).toBeCloseTo(west.x / (RAIN_FALL_SPEEDS[0] * PX_PER_METRE));
        expect(slant.x).toBeGreaterThan(0.4);
        expect(slant.x).toBeLessThan(0.7);
        expect(Math.abs(slant.y)).toBeLessThan(1e-9);
        // The big drops fall faster: they lean less.
        expect(rainSlant(west, 2).x).toBeLessThan(slant.x);
        expect(rainSlant(groundWind(90, 13), 0).x).toBeCloseTo(-slant.x);
        // A south wind carries the drops up the screen as they fall, a north wind down.
        expect(rainSlant(groundWind(180, 13), 0).y).toBeCloseTo(-slant.x);
        expect(rainSlant(groundWind(0, 13), 0).y).toBeCloseTo(slant.x);
        // Twice the wind, twice the slant; never lying flatter than the bound, however strong the wind.
        expect(rainSlant(groundWind(270, 26), 0).x).toBeCloseTo(2 * slant.x);
        expect(Math.hypot(rainSlant(groundWind(270, 400), 0).x, rainSlant(groundWind(270, 400), 0).y)).toBeCloseTo(
            MAX_RAIN_SLANT,
        );
    });

    it("leans the rain less than the snow drifts in a sleet, the same way", () => {
        const wind = groundWind(200, 13);
        const flake = { x: wind.x, y: wind.y + FLAKE_KINDS[1].fallSpeed * PX_PER_METRE };
        for (let layer = 0; layer < 3; layer++) {
            const slant = rainSlant(wind, layer);
            const drop = { x: slant.x, y: 1 + slant.y };
            // Same direction across, and the flakes lie flatter.
            expect(Math.sign(drop.x)).toBe(Math.sign(flake.x));
            expect(Math.abs(drop.x / drop.y)).toBeLessThan(Math.abs(flake.x / flake.y));
        }
    });

    it("lets a drop catch a new wind within about a second, without a jump", () => {
        let wind = { x: 0, y: 0 };
        const target = groundWind(270, 30);
        let largest = 0;
        for (let frame = 0; frame < 60; frame++) {
            const next = followWind(wind, target, 1 / 30);
            largest = Math.max(largest, Math.hypot(next.x - wind.x, next.y - wind.y));
            wind = next;
        }
        // Within two seconds it goes with the new wind, all but a few hundredths.
        expect(wind.x / target.x).toBeGreaterThan(0.94);
        // A thirtieth of a second moves the wind by a twentieth of the change at most.
        expect(largest).toBeLessThan(target.x / 20);
        expect(followWind(wind, target, 0)).toEqual(wind);
        expect(followWind({ x: 1, y: 2 }, target, Number.POSITIVE_INFINITY)).toEqual(target);
    });
});

describe("rainDrops", () => {
    const keyOf = (drop: { x: number; y: number; layer: number }) => `${drop.layer}|${drop.x}|${drop.y}`;
    const inView = (drop: { x: number; y: number }) =>
        drop.x >= 0 && drop.x < view.width && drop.y >= 0 && drop.y < view.height;

    it("shows more drops as the rain gets harder, the near ones only in a hard rain", () => {
        const light = rainDrops(EPOCH, view, 0.2, calmAir).filter(inView);
        const usual = rainDrops(EPOCH, view, 0.5, calmAir).filter(inView);
        const heavy = rainDrops(EPOCH, view, 1, calmAir).filter(inView);
        expect(light.length).toBeGreaterThan(0);
        expect(usual.length).toBeGreaterThan(light.length * 2);
        expect(heavy.length).toBeGreaterThan(usual.length * 1.5);
        expect(light.some((drop) => drop.layer === 2)).toBe(false);
        expect(heavy.some((drop) => drop.layer === 2)).toBe(true);
    });

    it("keeps the drops of a lighter rain where they are when it gets harder", () => {
        const light = rainDrops(EPOCH, view, 0.3, westWind(0.2));
        const harder = rainDrops(EPOCH, view, 0.6, westWind(0.2));
        // Compared by a key: thousands of drops, a deep comparison of each against all is too slow.
        const kept = new Set(harder.map(keyOf));
        expect(light.every((drop) => kept.has(keyOf(drop)))).toBe(true);
    });

    it("moves each drop a little from one image to the next, over a long fall", () => {
        const before = rainDrops(EPOCH, view, 1, westWind(0.5));
        const after = rainDrops(EPOCH + 16, view, 1, westWind(0.5));
        expect(after).toHaveLength(before.length);
        let restarted = 0;
        before.forEach((drop, index) => {
            const fallen = after[index].y - drop.y;
            // A few pixels down, or a new drop higher up in the same cell.
            if (fallen < 0) restarted++;
            else expect(fallen > 0 && fallen < 8).toBe(true);
        });
        // A fall lasts about a second: few drops start again within one image.
        expect(restarted).toBeLessThan(before.length * 0.05);
    });

    it("keeps most drops falling straight on for a third of a second", () => {
        const first = rainDrops(EPOCH, view, 1, calmAir);
        const later = rainDrops(EPOCH + 300, view, 1, calmAir);
        const still = first.filter((drop, index) => later[index].y > drop.y && later[index].x === drop.x);
        expect(still.length).toBeGreaterThan(first.length * 0.6);
    });

    it("barely moves the drops when the wind turns a little", () => {
        const before = rainDrops(EPOCH, view, 1, westWind(0.5));
        const after = rainDrops(EPOCH, view, 1, westWind(0.51));
        // The same drops at the same height, each a few pixels aside at most (the cells looked at may differ).
        // Several drops may share a height (the hash keeps the digits of a float of the graphics card).
        const byHeight = new Map<string, number[]>();
        for (const drop of after) {
            const key = `${drop.layer}|${drop.y}`;
            byHeight.set(key, [...(byHeight.get(key) ?? []), drop.x]);
        }
        for (const drop of before.filter((one) => one.x > 100 && one.x < 700)) {
            const moved = byHeight.get(`${drop.layer}|${drop.y}`) ?? [];
            expect(moved.some((x) => Math.abs(x - drop.x) < 4)).toBe(true);
        }
    });

    it("keeps the drops fixed to the map when the camera moves", () => {
        const original = rainDrops(EPOCH, view, 0.7, westWind(0.3)).filter(inView);
        const scrolled = rainDrops(EPOCH, { ...view, x: 64 }, 0.7, westWind(0.3)).filter(inView);
        const fixed = new Set(original.map(keyOf));
        expect(scrolled.every((drop) => fixed.has(keyOf(drop)))).toBe(true);
    });

    it("rains harder under the thick of a cloud than in a gap", () => {
        // The left half of the view under a thick cloud, the right half under none.
        const local = (x: number) => rainUnderCloud(x < 400 ? 1 : 0);
        const drops = rainDrops(EPOCH, view, 0.5, calmAir, local).filter(inView);
        const under = drops.filter((drop) => drop.x < 400).length;
        expect(under).toBeGreaterThan((drops.length - under) * 1.5);
        expect(drops.length - under).toBeGreaterThan(0);
    });

    it("moves the drops along their streak: down and aside the way the wind blows, up the screen in a south wind", () => {
        for (const [wind, across, down] of [
            [calmAir, 0, 1],
            [westWind(0.5), 1, 1],
            [{ x: -westWind(0.5).x, y: 0 }, -1, 1],
            [{ x: 0, y: -2 * RAIN_FALL_SPEEDS[0] * PX_PER_METRE }, 0, -1],
        ] as const) {
            const before = rainDrops(EPOCH, view, 1, wind).filter((drop) => drop.layer === 0);
            const after = rainDrops(EPOCH + 16, view, 1, wind).filter((drop) => drop.layer === 0);
            let moved = 0;
            before.forEach((drop, index) => {
                const next = after[index];
                const dx = next.x - drop.x;
                const dy = next.y - drop.y;
                // A new drop elsewhere in its cell: not a move.
                if (Math.hypot(dx, dy) > 12) return;
                moved++;
                expect(Math.sign(Math.round(dx * 1000))).toBe(across);
                expect(Math.sign(Math.round(dy * 1000))).toBe(down);
                // Along its own streak.
                expect(dx * drop.dy - dy * drop.dx).toBeCloseTo(0, 6);
            });
            expect(moved).toBeGreaterThan(before.length * 0.9);
        }
    });

    it("bounds the work zoomed far out", () => {
        expect(rainDrops(EPOCH, { ...view, width: 20000, height: 20000 }, 1, westWind(1)).length).toBeLessThan(6000);
    });
});

describe("rainSplashes", () => {
    it("splashes more as the rain gets harder, each splash in three stages", () => {
        const count = (intensity: number) => {
            let total = 0;
            for (let time = 0; time < 900; time += 30) total += rainSplashes(EPOCH + time, view, intensity).length;
            return total;
        };
        expect(count(0.2)).toBeGreaterThan(0);
        expect(count(1)).toBeGreaterThan(count(0.2) * 2);
        const stages = new Set(rainSplashes(EPOCH, view, 1).map((splash) => splash.stage));
        expect([...stages].sort()).toEqual([0, 1, 2]);
    });

    it("keeps a splash where it began for its short life", () => {
        const start = rainSplashes(EPOCH, view, 1).filter((splash) => splash.stage === 0);
        const later = rainSplashes(EPOCH + 60, view, 1);
        const kept = start.filter((splash) => later.some((other) => other.x === splash.x && other.y === splash.y));
        expect(kept.length).toBeGreaterThan(start.length * 0.9);
    });
});

describe("rain sound and development override", () => {
    it("is as loud as before for the usual rain, louder for a downpour", () => {
        expect(rainLoudness(USUAL_RAIN)).toBeCloseTo(0.14);
        expect(rainLoudness(1)).toBeGreaterThan(rainLoudness(0.2));
    });

    it("reads ?rainLevel in development only", () => {
        expect(parseRainLevel("?rainLevel=0.8", true)).toBe(0.8);
        expect(parseRainLevel("?rainLevel=cycle", true)).toBe("cycle");
        expect(parseRainLevel("?rainLevel=0.8", false)).toBeUndefined();
        expect(parseRainLevel("?rainLevel=7", true)).toBeUndefined();
        expect(parseRainLevel("", true)).toBeUndefined();
        expect(forcedRainLevel(0.3, 5)).toBe(0.3);
        expect(forcedRainLevel("cycle", 0)).toBeCloseTo(0);
        expect(forcedRainLevel("cycle", 20_000)).toBeCloseTo(1);
        expect(forcedRainLevel(undefined, 5)).toBeUndefined();
    });
});

describe("rainCell", () => {
    const screen = { width: 1920, height: 1080 };
    /** The view of a finer grid (rainFineness) for a screen seen at this scale: the map view, `fine` times finer. */
    const finerView = (scale: number) => {
        const fine = rainFineness(scale);
        return {
            view: { x: 0, y: 0, width: (screen.width / scale) * fine, height: (screen.height / scale) * fine },
            fine,
        };
    };

    // Seen from close the drops are `onScreen` times wider than at a usual zoom: the rain is as thick on the screen with
    // as many times fewer of them. Without it the cell was a power of two of the view alone: twice as wide or not between
    // two zooms, so four times the drops (10 % of the screen covered at a scale of 1.25 and 2.7 % at 1, measured).
    it("holds as many drops on the screen at a scale past the usual zooms as at the usual ones", () => {
        const usual = finerView(1.25);
        const perScreenAtUsual = (usual.view.width * usual.view.height) / rainCell(usual.view) ** 2;
        for (const scale of [1.6, 2, 3, 4, 6.5, 8, 16, 30]) {
            const { view, fine } = finerView(scale);
            const onScreen = scale / fine;
            const cells = (view.width * view.height) / rainCell(view, onScreen) ** 2;
            // The same cover (drops times the square of their size), as the cell is a power of two: within a share of two.
            const cover = (cells * onScreen ** 2) / (perScreenAtUsual * 1.25 ** 2);
            expect(cover).toBeGreaterThan(0.5);
            expect(cover).toBeLessThan(2);
        }
    });

    it("is the cell of the view alone without a finer grid, and keeps the grid for a small zoom", () => {
        const wide = { x: 0, y: 0, width: 1920, height: 1080 };
        expect(rainCell(wide)).toBe(rainCell(wide, undefined));
        expect(rainCell({ ...wide, width: 1930, height: 1085 })).toBe(rainCell(wide));
        expect(rainCell(wide, Number.NaN)).toBe(rainCell(wide));
    });
});

describe("rainFineness", () => {
    it("draws the rain in map pixels at the usual zooms", () => {
        expect(rainFineness(0.2)).toBe(1);
        expect(rainFineness(1)).toBe(1);
        expect(rainFineness(1.5)).toBe(1);
        expect(RAIN_NATIVE_SCALE).toBe(1.5);
    });

    // Zoomed in the flakes were each wider on the screen while their number stayed: 10 % of the screen covered at a
    // scale of 2.5 and over, against 1.8 % at 1 and 3.8 % at 1.5 (measured, flat snow), and the map could not be read.
    it("draws it finer and finer past them, so a drop or a flake keeps on screen the size it has at a usual zoom", () => {
        expect(rainFineness(1.6)).toBe(2);
        expect(rainFineness(3)).toBe(2);
        expect(rainFineness(3.1)).toBe(4);
        expect(rainFineness(5)).toBe(4);
        expect(rainFineness(6.1)).toBe(8);
        expect(rainFineness(16)).toBe(16);
        // On screen a map pixel of rain never takes more than at the top of the usual zooms, nor much less.
        for (const scale of [1.6, 2.5, 3, 3.1, 4.9, 7, 12, 19, 40]) {
            const onScreen = scale / rainFineness(scale);
            expect(onScreen).toBeLessThanOrEqual(1.5);
            expect(onScreen).toBeGreaterThan(0.75);
        }
    });

    it("stays at 1 for a scale that is not a number", () => {
        expect(rainFineness(Number.NaN)).toBe(1);
        expect(rainFineness(Number.POSITIVE_INFINITY)).toBe(1);
    });
});
