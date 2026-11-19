import { describe, expect, it } from "vitest";
import {
    drawnEmbers,
    drawnFlame,
    FLAME_FRAME_HEIGHT_PX,
    FLAME_FRAME_WIDTH_PX,
    FLAME_FRAMES,
    FLAME_MAX_HEIGHT_PX,
    FLAME_MAX_SPREAD_SCALE,
    FLAME_MIN_HEIGHT_PX,
    flameOf,
    flameOutline,
    flamePose,
    glowShare,
    spreadTiles,
    smokeOf,
    tileSeed,
} from "../../../../../src/front/Phaser/Game/Fire/FlameShape";

const still = { windFrom: 0, windSpeed: 0, seconds: 0, seed: 0.3, reducedMotion: true };

describe("flameOf", () => {
    it("is as tall as the fire is strong, from a low flame to two tiles high", () => {
        expect(FLAME_MIN_HEIGHT_PX).toBe(18);
        expect(FLAME_MAX_HEIGHT_PX).toBe(64);
        expect(flameOf({ ...still, intensity: 0 }).height).toBe(18);
        expect(flameOf({ ...still, intensity: 1 }).height).toBe(64);
        expect(flameOf({ ...still, intensity: 0.5 }).height).toBe(41);
    });

    it("leans the way the wind goes, the more the stronger the wind, never lying flat", () => {
        // A wind from the west blows east: the tip goes right. From the north: down the map.
        const west = flameOf({ ...still, intensity: 1, windFrom: 270, windSpeed: 60 });
        expect(west.tip.x).toBeGreaterThan(20);
        expect(Math.abs(west.tip.y)).toBeLessThan(1);
        const north = flameOf({ ...still, intensity: 1, windFrom: 0, windSpeed: 60 });
        expect(north.tip.y).toBeGreaterThan(5);
        expect(Math.abs(north.tip.x)).toBeLessThan(1);
        expect(flameOf({ ...still, intensity: 1, windFrom: 270, windSpeed: 20 }).tip.x).toBeLessThan(west.tip.x);
        // Even a gale leaves the flame some height on screen.
        // A gale from the north pushes the tip down the screen: it still stands 20 px over its foot.
        const gale = flameOf({ ...still, intensity: 1, windFrom: 0, windSpeed: 120 });
        expect(gale.height - gale.tip.y).toBeGreaterThan(20);
        expect(flameOf({ ...still, intensity: 1 }).tip).toEqual({ x: 0, y: 0 });
    });
});

describe("drawnFlame and flamePose", () => {
    it("draws a loop that flickers gently: never a flash, never more than a fifth of its height, and closes", () => {
        const heights: number[] = [];
        for (let frame = 0; frame <= FLAME_FRAMES; frame++) heights.push(drawnFlame(frame).height);
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(64 * 0.8);
        expect(Math.max(...heights)).toBeLessThanOrEqual(64 * 1.2);
        expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(8);
        // From a frame to the next the height moves by little: a flicker, not a blink. The last joins the first.
        for (let index = 1; index < heights.length; index++) {
            expect(Math.abs(heights[index] - heights[index - 1])).toBeLessThan(6);
        }
        expect(drawnFlame(FLAME_FRAMES).height).toBeCloseTo(drawnFlame(0).height, 9);
        expect(drawnFlame(FLAME_FRAMES).tip.x).toBeCloseTo(drawnFlame(0).tip.x, 9);
    });

    it("keeps every drawn flame and ember inside its frame", () => {
        for (let frame = 0; frame < FLAME_FRAMES; frame++) {
            const flame = drawnFlame(frame);
            for (const point of flameOutline(flame, 1)) {
                expect(Math.abs(point.x)).toBeLessThanOrEqual(FLAME_FRAME_WIDTH_PX / 2);
                expect(-point.y).toBeLessThanOrEqual(FLAME_FRAME_HEIGHT_PX);
            }
            const embers = drawnEmbers(frame);
            expect(embers).toHaveLength(3);
            for (const ember of embers) {
                expect(Math.abs(ember.x) + 1).toBeLessThanOrEqual(FLAME_FRAME_WIDTH_PX / 2);
                expect(-ember.y + 1).toBeLessThanOrEqual(FLAME_FRAME_HEIGHT_PX);
                expect(ember.y).toBeLessThan(0);
                expect(ember.alpha).toBeGreaterThanOrEqual(0);
                expect(ember.alpha).toBeLessThanOrEqual(1);
            }
        }
    });

    it("lays a frame as tall as the fire is strong, upright without wind", () => {
        expect(flamePose({ ...still, intensity: 1 })).toEqual({
            frame: FLAME_FRAMES,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
        });
        const weak = flamePose({ ...still, intensity: 0 });
        expect(weak.scaleY).toBeCloseTo(18 / 64, 9);
        expect(weak.scaleX).toBeCloseTo(26 / 44, 9);
    });

    it("turns the frame the way the wind goes", () => {
        // A wind from the west blows east: the flame turns clockwise, and is as long as its laid tip is far.
        const west = flamePose({ ...still, intensity: 1, windFrom: 270, windSpeed: 80 });
        expect(west.rotation).toBeCloseTo(Math.atan2(0.75, 1), 5);
        expect(west.scaleY).toBeCloseTo(Math.hypot(0.75, 1), 5);
        expect(flamePose({ ...still, intensity: 1, windFrom: 90, windSpeed: 80 }).rotation).toBeCloseTo(
            -west.rotation,
            5,
        );
    });

    it("runs the loop on each tile in its own time, and stands still for who asked for less motion", () => {
        const moving = { ...still, reducedMotion: false, intensity: 1 };
        const frames = new Set<number>();
        for (let ms = 0; ms < 3000; ms += 50) frames.add(flamePose({ ...moving, seconds: ms / 1000 }).frame);
        expect(frames.size).toBe(FLAME_FRAMES);
        expect(Math.max(...frames)).toBe(FLAME_FRAMES - 1);
        const seeds = new Set<number>();
        for (let seed = 0; seed < 1; seed += 0.05) seeds.add(flamePose({ ...moving, seconds: 1, seed }).frame);
        expect(seeds.size).toBeGreaterThan(5);
        expect(flamePose({ ...still, intensity: 1, seconds: 1 })).toEqual(
            flamePose({ ...still, intensity: 1, seconds: 2.37 }),
        );
    });
});

describe("flameOutline", () => {
    it("is a closed tongue of fire: wide at its foot, pointed at its tip, bent to its tip", () => {
        const flame = { height: 60, width: 40, tip: { x: 24, y: 0 } };
        const outline = flameOutline(flame, 1);
        expect(outline.length).toBeGreaterThanOrEqual(12);
        const ys = outline.map((point) => point.y);
        expect(Math.max(...ys)).toBe(0);
        expect(Math.min(...ys)).toBeCloseTo(-60, 5);
        const foot = outline.filter((point) => point.y === 0).map((point) => point.x);
        expect(Math.max(...foot) - Math.min(...foot)).toBeCloseTo(40, 5);
        const top = outline.filter((point) => Math.abs(point.y + 60) < 1e-6).map((point) => point.x);
        expect(Math.max(...top) - Math.min(...top)).toBeLessThan(2);
        expect(top[0]).toBeCloseTo(24, 0);
    });

    it("draws the heart of the flame smaller, from the same foot", () => {
        const flame = { height: 60, width: 40, tip: { x: 0, y: 0 } };
        const heart = flameOutline(flame, 0.4);
        expect(Math.min(...heart.map((point) => point.y))).toBeCloseTo(-24, 5);
        const foot = heart.filter((point) => point.y === 0).map((point) => point.x);
        expect(Math.max(...foot) - Math.min(...foot)).toBeCloseTo(16, 5);
    });
});

describe("smokeOf", () => {
    it("lift smoke over a strong fire, drifting downwind as it rises", () => {
        const puffs = smokeOf({
            ...still,
            reducedMotion: false,
            intensity: 1,
            windFrom: 270,
            windSpeed: 40,
            seconds: 5,
        });
        expect(puffs.length).toBeGreaterThan(0);
        for (const puff of puffs) {
            expect(puff.y).toBeLessThan(0);
            expect(puff.x).toBeGreaterThanOrEqual(0);
            expect(puff.alpha).toBeLessThanOrEqual(0.35);
            expect(puff.radius).toBeGreaterThan(4);
        }
        expect(smokeOf({ ...still, reducedMotion: false, intensity: 0.2, seconds: 5 })).toEqual([]);
        // Less motion: one puff that does not move.
        const calm = smokeOf({ ...still, intensity: 1, seconds: 5 });
        expect(calm).toEqual(smokeOf({ ...still, intensity: 1, seconds: 9 }));
    });
});

describe("tileSeed and spreadTiles", () => {
    it("gives each tile its own time, always the same for a tile", () => {
        expect(tileSeed(3, 4)).toBe(tileSeed(3, 4));
        expect(tileSeed(3, 4)).not.toBe(tileSeed(4, 3));
        expect(tileSeed(3, 4)).toBeGreaterThanOrEqual(0);
        expect(tileSeed(3, 4)).toBeLessThan(1);
    });

    it("thins the flames all over the view when there are too many, and makes them bigger", () => {
        const tiles = [];
        for (let y = 0; y < 40; y++) for (let x = 0; x < 100; x++) tiles.push({ x, y });
        const spread = spreadTiles(tiles, 400);
        expect(spread.tiles.length).toBeGreaterThan(300);
        expect(spread.tiles.length).toBeLessThan(500);
        // Both ends of the view keep flames: no fire is left bare.
        expect(spread.tiles.filter((tile) => tile.x < 20).length).toBeGreaterThan(40);
        expect(spread.tiles.filter((tile) => tile.x >= 80).length).toBeGreaterThan(40);
        expect(spread.scale).toBeGreaterThan(2.8);
        expect(spread.scale).toBeLessThanOrEqual(FLAME_MAX_SPREAD_SCALE);
        // The same tiles each time.
        expect(spreadTiles(tiles, 400).tiles).toEqual(spread.tiles);
    });

    it("keeps every flame at its size when few enough burn", () => {
        const tiles = [
            { x: 0, y: 0 },
            { x: 30, y: 30 },
        ];
        expect(spreadTiles(tiles, 400)).toEqual({ tiles, scale: 1 });
    });
});

describe("glowShare", () => {
    it("leaves a flame alone its whole glow, and shares it in a thick fire", () => {
        expect(glowShare(1)).toBe(1);
        expect(glowShare(3)).toBe(1);
        expect(glowShare(6)).toBe(0.5);
        // The whole square around it on fire: about an eighth each, so the front does not whiten.
        expect(glowShare(25)).toBeCloseTo(0.12, 5);
        expect(glowShare(0)).toBe(1);
    });
});
