import { describe, expect, it } from "vitest";
import {
    embersOf,
    FLAME_MAX_HEIGHT_PX,
    FLAME_MAX_SPREAD_SCALE,
    FLAME_MIN_HEIGHT_PX,
    flameOf,
    flameOutline,
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

    it("flickers gently, each tile in its own time: never a flash, never more than a fifth of its height", () => {
        const heights: number[] = [];
        for (let ms = 0; ms < 4000; ms += 16) {
            heights.push(flameOf({ ...still, reducedMotion: false, intensity: 1, seconds: ms / 1000 }).height);
        }
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(64 * 0.8);
        expect(Math.max(...heights)).toBeLessThanOrEqual(64 * 1.2);
        expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(8);
        // From a frame to the next the height hardly moves: a flicker, not a blink.
        for (let index = 1; index < heights.length; index++) {
            expect(Math.abs(heights[index] - heights[index - 1])).toBeLessThan(3);
        }
        const other = flameOf({ ...still, reducedMotion: false, intensity: 1, seconds: 1, seed: 0.8 }).height;
        expect(other).not.toBe(flameOf({ ...still, reducedMotion: false, intensity: 1, seconds: 1 }).height);
    });

    it("stands still for who asked for less motion", () => {
        const one = flameOf({ ...still, intensity: 1, seconds: 1 });
        const two = flameOf({ ...still, intensity: 1, seconds: 2.37 });
        expect(two).toEqual(one);
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

describe("embersOf and smokeOf", () => {
    it("send a few embers up and downwind, fading as they rise; none for who asked for less motion", () => {
        const embers = embersOf({
            ...still,
            reducedMotion: false,
            intensity: 1,
            windFrom: 270,
            windSpeed: 40,
            seconds: 3.3,
        });
        expect(embers.length).toBeGreaterThan(0);
        expect(embers.length).toBeLessThanOrEqual(3);
        for (const ember of embers) {
            expect(ember.y).toBeLessThanOrEqual(0);
            expect(ember.y).toBeGreaterThanOrEqual(-140);
            expect(ember.x).toBeGreaterThanOrEqual(-6);
            expect(ember.alpha).toBeGreaterThanOrEqual(0);
            expect(ember.alpha).toBeLessThanOrEqual(1);
        }
        expect(embersOf({ ...still, intensity: 1, seconds: 3.3 })).toEqual([]);
        expect(embersOf({ ...still, reducedMotion: false, intensity: 0.1, seconds: 3.3 })).toEqual([]);
    });

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
