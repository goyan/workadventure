import { cellKey, withHeights } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    BreakingFoam,
    closedSidesOf,
    foamOfCell,
    FOAM_HALF_LIFE_MS,
} from "../../../../../src/front/Phaser/Game/Terrain/BreakingFoam";
import type { SettledWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";

/** A state of the water over a grid of `width` by `height` cells from the cell 0, 0. */
function state(
    width: number,
    height: number,
    depthOf: (x: number, y: number) => number,
    beforeOf: (x: number, y: number) => number = depthOf,
): SettledWater {
    const depths = new Float32Array(width * height);
    const before = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            depths[y * width + x] = depthOf(x, y);
            before[y * width + x] = beforeOf(x, y);
        }
    }
    return { x: 0, y: 0, width, height, depths, before, seconds: 1 };
}

describe("foamOfCell", () => {
    it("makes no foam on a swell over deep water, however long, nor on still water", () => {
        // A crest 6 px high over 60 px of water, spread over 40 cells: the long wave of an impact at sea.
        const swell = state(60, 5, (x) => 60 + 6 * Math.exp(-(((x - 30) / 12) ** 2)));
        for (let x = 5; x < 55; x++) expect(foamOfCell(swell, undefined, x, 2)).toBe(0);
        expect(
            foamOfCell(
                state(9, 9, () => 20),
                undefined,
                4,
                4,
            ),
        ).toBe(0);
        expect(
            foamOfCell(
                state(9, 9, () => 0),
                undefined,
                4,
                4,
            ),
        ).toBe(0);
    });

    it("makes foam where the same crest runs in shallow water: the wave breaks", () => {
        // A crest of 12 px (40 cm), steeper as waves get near a shore, over 5 px of water.
        const crest = (high: number): SettledWater => state(60, 5, (x) => 5 + high * Math.exp(-(((x - 30) / 3) ** 2)));
        const most = (water: SettledWater): number => {
            let found = 0;
            for (let x = 20; x < 40; x++) found = Math.max(found, foamOfCell(water, undefined, x, 2));
            return found;
        };
        const breaker = crest(12);
        expect(most(breaker)).toBeGreaterThan(0.6);
        // A lower wave that breaks leaves less foam; a ripple, none.
        expect(most(crest(6))).toBeGreaterThan(0.2);
        expect(most(crest(6))).toBeLessThan(most(breaker));
        expect(most(crest(2))).toBe(0);
        // Away from the crest the shallows are calm.
        expect(foamOfCell(breaker, undefined, 5, 2)).toBe(0);
    });

    it("makes foam where the rim of an impact falls back: a front steep even for deep water", () => {
        const rim = state(40, 5, (x) => (x < 20 ? 90 : 55));
        expect(foamOfCell(rim, undefined, 19, 2)).toBeGreaterThan(0.5);
        expect(foamOfCell(rim, undefined, 5, 2)).toBe(0);
    });

    it("makes foam at the front of a flood that reaches dry ground, not on a pond the rain fills", () => {
        // The water came from the west: the cell 10 was dry, its neighbour already under water.
        const front = state(
            20,
            5,
            (x) => (x <= 10 ? 4 : 0),
            (x) => (x <= 9 ? 4 : 0),
        );
        expect(foamOfCell(front, undefined, 10, 2)).toBeGreaterThanOrEqual(0.6);
        // Rain: every cell was dry and all rise together.
        const rain = state(
            20,
            5,
            () => 2,
            () => 0,
        );
        expect(foamOfCell(rain, undefined, 10, 2)).toBe(0);
    });

    it("makes foam down a waterfall: the surface drops with the ground under running water", () => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 5; y++) for (let x = 0; x < 20; x++) cells.set(cellKey(x, y), x < 10 ? 40 : 0);
        const fall = state(20, 5, () => 3);
        expect(foamOfCell(fall, withHeights(undefined, cells), 9, 2)).toBe(1);
        expect(foamOfCell(fall, withHeights(undefined, cells), 3, 2)).toBe(0);
    });
});

describe("foamOfCell, what is not a wave", () => {
    /** A bank that goes down 12 px a cell towards the east, from the altitude 60 at the cell 0. */
    const shore = (() => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 5; y++) for (let x = 0; x < 12; x++) cells.set(cellKey(x, y), 60 - 12 * x);
        return withHeights(undefined, cells);
    })();
    /** A sheet of 2.5 px lying all over it, running at `speed` cells a second (as the server tells it). */
    const sheet = (speed: number | undefined): SettledWater => ({
        ...state(12, 5, () => 2.5),
        ...(speed === undefined ? {} : { speedAt: () => ({ x: speed, y: 0 }) }),
    });

    it("makes no foam on a sheet of water that creeps down a shore: the slope of the ground is not a wave", () => {
        // 0.3 cell a second (16 cm/s) under 2.5 px of water: a trickle.
        for (let x = 1; x < 11; x++) expect(foamOfCell(sheet(0.3), shore, x, 2)).toBe(0);
        // Nor on a sheet that stands still.
        for (let x = 1; x < 11; x++) expect(foamOfCell(sheet(0), shore, x, 2)).toBe(0);
    });

    it("makes foam on the same sheet when it rushes down: white water, by the speed the server tells", () => {
        // Waves run at 1.7 cell a second in 2.5 px of water: at 4 cells a second (2 m/s) the sheet is a torrent.
        expect(foamOfCell(sheet(4), shore, 5, 2)).toBeGreaterThan(0.6);
        // Just faster than its waves: a little foam; slower: none.
        const quick = foamOfCell(sheet(2.2), shore, 5, 2);
        expect(quick).toBeGreaterThan(0);
        expect(quick).toBeLessThan(foamOfCell(sheet(4), shore, 5, 2));
        expect(foamOfCell(sheet(1.5), shore, 5, 2)).toBe(0);
    });

    it("makes no foam on a fast current that falls nowhere: white water is water that rushes down", () => {
        // 30 px of water running at 12 cells a second over a flat bed, faster than its waves (6 cells a second).
        const current: SettledWater = { ...state(12, 5, () => 30), speedAt: () => ({ x: 12, y: 0 }) };
        for (let x = 1; x < 11; x++) expect(foamOfCell(current, undefined, x, 2)).toBe(0);
    });

    it("reads the speed off the slope where the server tells none: a steep shore foams, a gentle one does not", () => {
        // Without inertia a sheet of 2.5 px down 12 px a cell runs at about 10 cells a second.
        expect(foamOfCell(sheet(undefined), shore, 5, 2)).toBeGreaterThan(0.6);
        const cells = new Map<string, number>();
        for (let y = 0; y < 5; y++) for (let x = 0; x < 12; x++) cells.set(cellKey(x, y), 12 - x);
        expect(foamOfCell(sheet(undefined), withHeights(undefined, cells), 5, 2)).toBe(0);
    });

    it("makes no foam between two waters a wall keeps apart, each at its level", () => {
        // 40 px of water west of a wall, 10 px east of it, both still: a pool and the room next to it.
        const waters = state(20, 5, (x) => (x < 10 ? 40 : 10));
        // Without the wall, it is the rim of an impact that falls back.
        expect(foamOfCell(waters, undefined, 9, 2)).toBeGreaterThan(0.5);
        const east = new Set<string>();
        for (let y = 0; y < 5; y++) east.add(cellKey(9, y));
        const closed = closedSidesOf({ east, south: new Set() });
        for (let x = 5; x < 15; x++) expect(foamOfCell(waters, undefined, x, 2, closed)).toBe(0);
        // A wall along the south side of a row, the same way.
        const rows = state(5, 20, (_x, y) => (y < 10 ? 40 : 10));
        const south = new Set<string>();
        for (let x = 0; x < 5; x++) south.add(cellKey(x, 9));
        expect(foamOfCell(rows, undefined, 2, 9)).toBeGreaterThan(0.5);
        expect(foamOfCell(rows, undefined, 2, 9, closedSidesOf({ east: new Set(), south }))).toBe(0);
    });

    it("still breaks a wave on a shore: a crest that stands in the water it runs in", () => {
        // A beach that rises 1 px a cell, 6 px of water at its foot, and a crest of 9 px coming in.
        const cells = new Map<string, number>();
        for (let y = 0; y < 5; y++) for (let x = 0; x < 30; x++) cells.set(cellKey(x, y), -6 + Math.max(0, x - 20));
        const beach = withHeights(undefined, cells);
        const wave: SettledWater = {
            ...state(30, 5, (x) => Math.max(0, 6 - Math.max(0, x - 20)) + 9 * Math.exp(-(((x - 18) / 2) ** 2))),
            speedAt: () => ({ x: 0.5, y: 0 }),
        };
        let most = 0;
        for (let x = 10; x < 26; x++) most = Math.max(most, foamOfCell(wave, beach, x, 2));
        expect(most).toBeGreaterThan(0.5);
    });
});

describe("BreakingFoam", () => {
    const breaker = state(40, 5, (x) => (x < 20 ? 90 : 55));
    const calm = state(40, 5, () => 55);

    it("keeps the foam a moment behind the wave, fading by half every so long, then none", () => {
        const foam = new BreakingFoam();
        expect(foam.active(0)).toBe(false);
        foam.absorb(breaker, undefined, 1000);
        const born = foam.foamAt(19, 2, 1000);
        expect(born).toBeGreaterThan(0.5);
        expect(foam.active(1000)).toBe(true);
        // The wave went by: the water is calm again, the foam it left is still there, fainter.
        foam.absorb(calm, undefined, 1000 + FOAM_HALF_LIFE_MS);
        expect(foam.foamAt(19, 2, 1000 + FOAM_HALF_LIFE_MS)).toBeCloseTo(born / 2, 5);
        expect(foam.foamAt(19, 2, 1000 + 2 * FOAM_HALF_LIFE_MS)).toBeCloseTo(born / 4, 5);
        expect(foam.active(1000 + 10 * FOAM_HALF_LIFE_MS)).toBe(false);
        expect(foam.foamAt(19, 2, 1000 + 10 * FOAM_HALF_LIFE_MS)).toBe(0);
    });

    it("has none on dry cells, outside its grid, nor after another grid came", () => {
        const foam = new BreakingFoam();
        foam.absorb(breaker, undefined, 0);
        expect(foam.foamAt(-5, 2, 0)).toBe(0);
        expect(foam.foamAt(19, 99, 0)).toBe(0);
        foam.absorb(
            state(10, 5, () => 0),
            undefined,
            100,
        );
        expect(foam.active(100)).toBe(false);
        foam.absorb(breaker, undefined, 200);
        foam.clear();
        expect(foam.active(200)).toBe(false);
    });
});

describe("BreakingFoam, whatever how often the water is told", () => {
    /** A crest of 12 px over 5 px of water that runs east at a cell and a half a second: it breaks all the way. */
    const crestAt = (seconds: number, between: number): SettledWater => ({
        ...state(70, 3, (x) => 5 + 12 * Math.exp(-(((x - 10 - 1.5 * seconds) / 3) ** 2))),
        seconds: between,
    });
    /** All the foam of the grid at a time, the states of the crest being told `rate` times a second. */
    function foamOver(rate: number): { mean: number; swing: number; jump: number } {
        const foam = new BreakingFoam();
        const between = 1 / rate;
        const totals: number[] = [];
        let told = -1;
        // Read every 50 ms, as a browser draws it, over 24 s; the first 4 s let it settle.
        for (let tick = 0; tick <= 480; tick++) {
            const now = tick * 50;
            const due = Math.floor(now / 1000 / between + 1e-9);
            if (due > told) {
                told = due;
                foam.absorb(crestAt(due * between, between), undefined, due * between * 1000);
            }
            if (now < 4000) continue;
            let total = 0;
            for (let x = 0; x < 70; x++) total += foam.foamAt(x, 1, now);
            totals.push(total);
        }
        const mean = totals.reduce((sum, total) => sum + total, 0) / totals.length;
        let jump = 0;
        for (let at = 1; at < totals.length; at++) jump = Math.max(jump, Math.abs(totals[at] - totals[at - 1]));
        return { mean, swing: (Math.max(...totals) - Math.min(...totals)) / mean, jump: jump / mean };
    }

    it("makes as much foam of a wave that breaks all along at one, two and five states a second", () => {
        const [one, two, five] = [1, 2, 5].map(foamOver);
        expect(one.mean).toBeGreaterThan(five.mean * 0.9);
        expect(one.mean).toBeLessThan(five.mean * 1.1);
        expect(two.mean).toBeGreaterThan(five.mean * 0.9);
        expect(two.mean).toBeLessThan(five.mean * 1.1);
    });

    it("makes it steadily, not in puffs: the foam of a state comes as the water glides to it", () => {
        for (const rate of [1, 2, 5]) {
            const { swing, jump } = foamOver(rate);
            // From its faintest to its strongest, and from a drawing to the next (50 ms).
            expect(swing, `swing at ${rate} a second`).toBeLessThan(0.25);
            expect(jump, `jump at ${rate} a second`).toBeLessThan(0.08);
        }
    });

    it("lets the front of a flood come in, not blink: it rises while the water gets there, then fades", () => {
        // The water comes from the west, a cell a second, told once a second.
        const frontAt = (second: number): SettledWater =>
            state(
                20,
                3,
                (x) => (x <= 5 + second ? 4 : 0),
                (x) => (x <= 4 + second ? 4 : 0),
            );
        const foam = new BreakingFoam();
        const seen: number[] = [];
        for (let tick = 0; tick <= 100; tick++) {
            const now = tick * 50;
            if (now % 1000 === 0) foam.absorb(frontAt(now / 1000), undefined, now);
            // The cell the front reaches at the third second.
            if (now >= 3000) seen.push(foam.foamAt(8, 1, now));
        }
        expect(seen[0]).toBe(0);
        expect(Math.max(...seen)).toBeGreaterThanOrEqual(0.6);
        for (let at = 1; at < seen.length; at++) expect(Math.abs(seen[at] - seen[at - 1])).toBeLessThan(0.1);
    });
});
