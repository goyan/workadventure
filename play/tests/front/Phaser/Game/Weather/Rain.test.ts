import { describe, expect, it } from "vitest";
import {
    forcedRainLevel,
    parseRainLevel,
    rainDrops,
    rainIntensity,
    rainLean,
    rainLoudness,
    rainSplashes,
    rainUnderCloud,
    STORM_RAIN,
    USUAL_RAIN,
    rainFineness,
} from "../../../../../src/front/Phaser/Game/Weather/Rain";

const view = { x: 0, y: 0, width: 800, height: 600 };
const EPOCH = 1_794_995_262_000;

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

describe("rainLean", () => {
    it("leans away from the wind: to the east for a west wind, to the west for an east wind", () => {
        expect(rainLean(270, 40)).toBeGreaterThan(0);
        expect(rainLean(90, 40)).toBeLessThan(0);
        expect(rainLean(90, 40)).toBeCloseTo(-rainLean(270, 40));
    });

    it("falls straight under a north or south wind and in a calm, more aslant as the wind grows", () => {
        expect(rainLean(0, 40)).toBeCloseTo(0);
        expect(rainLean(180, 40)).toBeCloseTo(0);
        expect(rainLean(270, 0)).toBeCloseTo(0);
        expect(rainLean(270, 20)).toBeLessThan(rainLean(270, 50));
        expect(rainLean(270, 300)).toBeCloseTo(rainLean(270, 60));
    });

    it("leans to the east without a known wind, as the clouds drift", () => {
        expect(rainLean(undefined)).toBeGreaterThan(0);
    });
});

describe("rainDrops", () => {
    const keyOf = (drop: { x: number; y: number; layer: number }) => `${drop.layer}|${drop.x}|${drop.y}`;
    const inView = (drop: { x: number; y: number }) =>
        drop.x >= 0 && drop.x < view.width && drop.y >= 0 && drop.y < view.height;

    it("shows more drops as the rain gets harder, the near ones only in a hard rain", () => {
        const light = rainDrops(EPOCH, view, 0.2, 0).filter(inView);
        const usual = rainDrops(EPOCH, view, 0.5, 0).filter(inView);
        const heavy = rainDrops(EPOCH, view, 1, 0).filter(inView);
        expect(light.length).toBeGreaterThan(0);
        expect(usual.length).toBeGreaterThan(light.length * 2);
        expect(heavy.length).toBeGreaterThan(usual.length * 1.5);
        expect(light.some((drop) => drop.layer === 2)).toBe(false);
        expect(heavy.some((drop) => drop.layer === 2)).toBe(true);
    });

    it("keeps the drops of a lighter rain where they are when it gets harder", () => {
        const light = rainDrops(EPOCH, view, 0.3, 0.2);
        const harder = rainDrops(EPOCH, view, 0.6, 0.2);
        // Compared by a key: thousands of drops, a deep comparison of each against all is too slow.
        const kept = new Set(harder.map(keyOf));
        expect(light.every((drop) => kept.has(keyOf(drop)))).toBe(true);
    });

    it("moves each drop a little from one image to the next, over a long fall", () => {
        const before = rainDrops(EPOCH, view, 1, 0.5);
        const after = rainDrops(EPOCH + 16, view, 1, 0.5);
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
        const first = rainDrops(EPOCH, view, 1, 0);
        const later = rainDrops(EPOCH + 300, view, 1, 0);
        const still = first.filter((drop, index) => later[index].y > drop.y && later[index].x === drop.x);
        expect(still.length).toBeGreaterThan(first.length * 0.6);
    });

    it("barely moves the drops when the wind turns a little", () => {
        const before = rainDrops(EPOCH, view, 1, 0.5);
        const after = rainDrops(EPOCH, view, 1, 0.51);
        // The same drops at the same height, each a few pixels aside at most (the cells looked at may differ).
        const byHeight = new Map(after.map((drop) => [`${drop.layer}|${drop.y}`, drop.x]));
        for (const drop of before.filter((one) => one.x > 100 && one.x < 700)) {
            const moved = byHeight.get(`${drop.layer}|${drop.y}`);
            expect(moved !== undefined && Math.abs(moved - drop.x) < 4).toBe(true);
        }
    });

    it("keeps the drops fixed to the map when the camera moves", () => {
        const original = rainDrops(EPOCH, view, 0.7, 0.3).filter(inView);
        const scrolled = rainDrops(EPOCH, { ...view, x: 64 }, 0.7, 0.3).filter(inView);
        const fixed = new Set(original.map(keyOf));
        expect(scrolled.every((drop) => fixed.has(keyOf(drop)))).toBe(true);
    });

    it("rains harder under the thick of a cloud than in a gap", () => {
        // The left half of the view under a thick cloud, the right half under none.
        const local = (x: number) => rainUnderCloud(x < 400 ? 1 : 0);
        const drops = rainDrops(EPOCH, view, 0.5, 0, local).filter(inView);
        const under = drops.filter((drop) => drop.x < 400).length;
        expect(under).toBeGreaterThan((drops.length - under) * 1.5);
        expect(drops.length - under).toBeGreaterThan(0);
    });

    it("bounds the work zoomed far out", () => {
        expect(rainDrops(EPOCH, { ...view, width: 20000, height: 20000 }, 1, 1).length).toBeLessThan(6000);
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

describe("rainFineness", () => {
    it("draws the rain in map pixels at the usual zooms", () => {
        expect(rainFineness(0.2)).toBe(1);
        expect(rainFineness(1)).toBe(1);
        expect(rainFineness(2.5)).toBe(1);
    });

    // Zoomed in to the full a drop was a streak as thick as a finger, and the drops hid the map.
    it("draws it finer and finer past them, so a drop keeps on screen the size it has at a usual zoom", () => {
        expect(rainFineness(3)).toBe(2);
        expect(rainFineness(5)).toBe(2);
        expect(rainFineness(8)).toBe(4);
        expect(rainFineness(10)).toBe(4);
        expect(rainFineness(16)).toBe(8);
        // On screen a map pixel of rain never takes more than at the usual zooms.
        for (const scale of [3, 4.9, 7, 12, 19, 40]) {
            const onScreen = scale / rainFineness(scale);
            expect(onScreen).toBeLessThanOrEqual(2.5);
            expect(onScreen).toBeGreaterThan(1.25);
        }
    });

    it("stays at 1 for a scale that is not a number", () => {
        expect(rainFineness(Number.NaN)).toBe(1);
        expect(rainFineness(Number.POSITIVE_INFINITY)).toBe(1);
    });
});
