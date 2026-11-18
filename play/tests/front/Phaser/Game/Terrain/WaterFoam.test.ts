import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { waterCurrentAt } from "../../../../../src/front/Phaser/Game/Terrain/WaterCurrent";
import {
    FOAM_MAX_FLECKS,
    FOAM_MIN_DEPTH_PX,
    FOAM_SPEED,
    foamStreak,
    sourceRings,
    WaterFoam,
    wetAround,
    whirlDots,
    whirlTurnsPerSecond,
} from "../../../../../src/front/Phaser/Game/Terrain/WaterFoam";

/** Water and relief given cell by cell: `depth(x, y)` pixels of water over ground dug 64 px deep. */
function waterOf(depth: (x: number, y: number) => number) {
    const cells = new Map<string, number>();
    for (let y = -20; y <= 20; y++) for (let x = -20; x <= 20; x++) cells.set(cellKey(x, y), -64);
    const terrain: TerrainData = withHeights(undefined, cells);
    return {
        relief: () => terrain,
        depthAt: (x: number, y: number) => Math.max(0, depth(Math.floor(x / 16), Math.floor(y / 16))),
    };
}
const VIEW = { x: -160, y: -160, width: 320, height: 320 };
/** A sequence of numbers between 0 and 1 that is the same at each run. */
function seeded(): () => number {
    let state = 12345;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}
const foamOver = (water: ReturnType<typeof waterOf>): WaterFoam =>
    new WaterFoam((x, y, now) => waterCurrentAt(water, x, y, now, FOAM_MIN_DEPTH_PX), seeded());
const run = (foam: WaterFoam, frames: number): void => {
    for (let frame = 0; frame < frames; frame++) foam.step(frame * 66, 66, VIEW);
};

describe("waterCurrentAt in shallow water", () => {
    // 4 px of water at most, its surface going down towards the east: too shallow to carry an avatar.
    const stream = waterOf((x) => 4 - 0.1 * x);

    it("carries no one, but still tells which way a shallow stream runs when asked for shallower water", () => {
        expect(waterCurrentAt(stream, 8, 8, 0)).toEqual({ x: 0, y: 0 });
        const shown = waterCurrentAt(stream, 8, 8, 0, FOAM_MIN_DEPTH_PX);
        expect(shown.x).toBeGreaterThan(0);
        expect(shown.y).toBeCloseTo(0, 5);
    });
});

describe("WaterFoam", () => {
    it("shows nothing on still water, nor on dry ground", () => {
        const still = foamOver(waterOf(() => 30));
        run(still, 60);
        expect(still.flecks()).toHaveLength(0);
        const dry = foamOver(waterOf(() => 0));
        run(dry, 60);
        expect(dry.flecks()).toHaveLength(0);
    });

    it("shows flecks on running water, carried the way the water runs", () => {
        // The surface goes down towards the east, 1 px a cell.
        const foam = foamOver(waterOf((x) => 40 - x));
        run(foam, 20);
        const before = foam.flecks().map((fleck) => ({ ...fleck }));
        expect(before.length).toBeGreaterThan(5);
        foam.step(20 * 66, 66, VIEW);
        const after = foam.flecks();
        // The flecks that were there went east, none north nor south, at the speed of their current.
        const first = after[0];
        expect(first.x).toBeGreaterThan(before[0].x);
        expect(first.y).toBeCloseTo(before[0].y, 5);
        expect(first.x - before[0].x).toBeCloseTo(0.5 * FOAM_SPEED * 0.066, 3);
    });

    it("shows more of them where the water runs harder", () => {
        const gentle = foamOver(waterOf((x) => 40 - 0.3 * x));
        const hard = foamOver(waterOf((x) => 60 - 2 * x));
        run(gentle, 8);
        run(hard, 8);
        expect(hard.flecks().length).toBeGreaterThan(gentle.flecks().length * 2);
    });

    it("never holds more than its most flecks, and drops them all when cleared", () => {
        const foam = foamOver(waterOf((x) => 80 - 2 * x));
        run(foam, 400);
        expect(foam.flecks().length).toBeLessThanOrEqual(FOAM_MAX_FLECKS);
        expect(foam.flecks().length).toBeGreaterThan(FOAM_MAX_FLECKS / 4);
        foam.clear();
        expect(foam.flecks()).toHaveLength(0);
    });

    it("lets a fleck fade away where the water stops running, and far out of the screen", () => {
        let running = true;
        const water = waterOf((x) => (running ? 40 - x : 30));
        const foam = foamOver(water);
        run(foam, 20);
        expect(foam.flecks().length).toBeGreaterThan(5);
        running = false;
        for (let frame = 20; frame < 40; frame++) foam.step(frame * 66, 66, VIEW);
        expect(foam.flecks()).toHaveLength(0);
        // Running water again, the screen gone elsewhere: the flecks of the old screen are dropped.
        running = true;
        run(foam, 20);
        foam.step(21 * 66, 66, { x: 5000, y: 5000, width: 320, height: 320 });
        expect(foam.flecks().every((fleck) => fleck.x > 4900)).toBe(true);
    });

    it("draws a fleck as a streak behind it, longer on a harder current, faint as it comes and goes", () => {
        const fleck = { x: 100, y: 50, dirX: 1, dirY: 0, strength: 1, age: 500, life: 2000 };
        const hard = foamStreak(fleck);
        const gentle = foamStreak({ ...fleck, strength: 0.2 });
        expect(hard.toX).toBe(100);
        expect(hard.fromX).toBeLessThan(gentle.fromX);
        expect(gentle.fromX).toBeLessThan(100);
        expect(hard.fromY).toBe(50);
        expect(foamStreak({ ...fleck, age: 10 }).alpha).toBeLessThan(hard.alpha);
        expect(foamStreak({ ...fleck, age: 1990 }).alpha).toBeLessThan(hard.alpha);
    });
});

describe("the whirl of a sink and the rings of a source", () => {
    it("turns faster for a stronger sink, within bounds", () => {
        expect(whirlTurnsPerSecond(60_000_000)).toBeGreaterThan(whirlTurnsPerSecond(6_000));
        expect(whirlTurnsPerSecond(1)).toBeGreaterThan(0.1);
        expect(whirlTurnsPerSecond(Infinity)).toBeLessThanOrEqual(1.5);
        expect(whirlTurnsPerSecond(Number.NaN)).toBeGreaterThan(0.1);
    });

    it("draws arms that stay within the radius, wind towards the middle and turn with time", () => {
        const dots = whirlDots(0, 0.5, 40);
        expect(dots.length).toBeGreaterThan(10);
        for (const dot of dots) expect(Math.hypot(dot.x, dot.y)).toBeLessThanOrEqual(40.001);
        // The same arms a turn later, others in between.
        const later = whirlDots(2, 0.5, 40);
        expect(later[0].x).toBeCloseTo(dots[0].x, 3);
        expect(later[0].y).toBeCloseTo(dots[0].y, 3);
        const between = whirlDots(0.5, 0.5, 40);
        expect(Math.hypot(between[0].x - dots[0].x, between[0].y - dots[0].y)).toBeGreaterThan(5);
    });

    it("draws rings that grow from the source and fade as they grow", () => {
        const rings = sourceRings(0.2, 30);
        expect(rings.length).toBe(2);
        for (const ring of rings) {
            expect(ring.radius).toBeGreaterThan(0);
            expect(ring.radius).toBeLessThanOrEqual(30);
        }
        const [small, large] = [...rings].sort((a, b) => a.radius - b.radius);
        expect(small.alpha).toBeGreaterThan(large.alpha);
    });

    it("tells whether there is water around a sink, whose own disc is often dry", () => {
        // A dry disc of 3 cells around the middle, water beyond.
        const lake = waterOf((x, y) => (Math.hypot(x, y) <= 3 ? 0 : 20));
        expect(wetAround(lake, 8, 8, 5 * 16, 0)).toBeGreaterThan(15);
        expect(
            wetAround(
                waterOf(() => 0),
                8,
                8,
                5 * 16,
                0,
            ),
        ).toBe(0);
    });
});
