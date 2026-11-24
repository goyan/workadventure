import { describe, expect, it } from "vitest";
import {
    boostedAlpha,
    boostedSize,
    COPY_SALT,
    densityPlan,
    MAX_COPIES,
} from "../../../../../src/front/Phaser/Game/Weather/ParticleDensity";
import { snowflakes, flakeMix } from "../../../../../src/front/Phaser/Game/Weather/Snowfall";
import { rainDrops } from "../../../../../src/front/Phaser/Game/Weather/Rain";
import {
    perspectiveCamera,
    perspectiveDrops,
    perspectiveFlakes,
} from "../../../../../src/front/Phaser/Game/Weather/PerspectiveFall";

const view = { x: 0, y: 0, width: 960, height: 720 };
const EPOCH = 1_763_700_000_000;
const calm = { shift: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
const heavySnow = { level: 1, mix: flakeMix({ temperature: -4, humidity: 90 }) };
const camera = perspectiveCamera(view);
const stillAir = { shift: { x: 0, y: 0 }, wind: { x: 0, y: 0 } };
const key = (...parts: number[]): string => parts.map((part) => part.toFixed(6)).join("|");

describe("densityPlan", () => {
    it("draws as many copies as the amount up to MAX_COPIES, each as it is", () => {
        for (const amount of [1, 2, 4]) {
            const copies = Math.min(amount, MAX_COPIES);
            expect(densityPlan(amount)).toEqual({ copies, boost: amount / copies });
        }
        expect(densityPlan(1)).toEqual({ copies: 1, boost: 1 });
    });

    it("draws the amount over the cap as fewer copies, each thicker, whatever the amount", () => {
        for (const amount of [1, 2, 4, 8, 16, 32]) {
            const plan = densityPlan(amount);
            expect(plan.copies).toBeLessThanOrEqual(MAX_COPIES);
            expect(plan.copies * plan.boost).toBeCloseTo(amount, 9);
        }
        expect(densityPlan(32).boost).toBeGreaterThan(densityPlan(8).boost);
    });

    it("never draws less than the rain as it is, whatever it is given", () => {
        for (const amount of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, 0.25]) {
            expect(densityPlan(amount)).toEqual({ copies: 1, boost: 1 });
        }
    });
});

describe("boosted drawing", () => {
    it("keeps a single layer as it is and fills the screen faster with more layers, never past 1", () => {
        expect(boostedAlpha(0.45, 1)).toBe(0.45);
        expect(boostedAlpha(0.45, 2)).toBeCloseTo(1 - 0.55 ** 2, 9);
        expect(boostedAlpha(0.45, 8)).toBeGreaterThan(boostedAlpha(0.45, 2));
        expect(boostedAlpha(0.9, 1000)).toBeLessThanOrEqual(1);
    });

    it("draws bigger by at most twice", () => {
        expect(boostedSize(1)).toBe(1);
        expect(boostedSize(2)).toBeCloseTo(Math.SQRT2, 9);
        expect(boostedSize(64)).toBe(2);
    });
});

describe("the copies of the drops and the flakes", () => {
    it("show more flakes of the heaviest snow, which one copy cannot (its level stops at 1)", () => {
        const one = snowflakes(EPOCH, view, heavySnow, calm, undefined, false, 1);
        const four = snowflakes(EPOCH, view, heavySnow, calm, undefined, false, 4);
        expect(four.length).toBeGreaterThan(one.length * 3);
        expect(four.length).toBeLessThan(one.length * 5);
    });

    it("keep the flakes of the snow as it was, the others added", () => {
        const one = new Set(snowflakes(EPOCH, view, heavySnow, calm).map((flake) => key(flake.x, flake.y)));
        const four = new Set(
            snowflakes(EPOCH, view, heavySnow, calm, undefined, false, 4).map((flake) => key(flake.x, flake.y)),
        );
        for (const place of one) expect(four.has(place), place).toBe(true);
    });

    it("show more drops of the heaviest rain, the same ones first", () => {
        const wind = { x: 0, y: 0 };
        const one = rainDrops(EPOCH, view, 1, wind);
        const four = rainDrops(EPOCH, view, 1, wind, undefined, 4);
        expect(four.length).toBeGreaterThan(one.length * 3);
        expect(four.length).toBeLessThan(one.length * 5);
        const kept = new Set(four.map((drop) => key(drop.x, drop.y)));
        for (const drop of one) expect(kept.has(key(drop.x, drop.y))).toBe(true);
    });

    it("show more of the drops and the flakes in perspective, the same ones first", () => {
        const drops = perspectiveDrops(EPOCH, view, camera, 1, stillAir);
        const moreDrops = perspectiveDrops(EPOCH, view, camera, 1, stillAir, undefined, 4);
        expect(moreDrops.length).toBeGreaterThan(drops.length * 3);
        const droppedAt = new Set(moreDrops.map((drop) => key(drop.headX, drop.headY)));
        for (const drop of drops) expect(droppedAt.has(key(drop.headX, drop.headY))).toBe(true);

        const air = { shift: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
        const flakes = perspectiveFlakes(EPOCH, view, camera, heavySnow, air);
        const moreFlakes = perspectiveFlakes(EPOCH, view, camera, heavySnow, air, undefined, false, 4);
        expect(moreFlakes.length).toBeGreaterThan(flakes.length * 3);
        const flakedAt = new Set(moreFlakes.map((flake) => key(flake.x, flake.y)));
        for (const flake of flakes) expect(flakedAt.has(key(flake.x, flake.y))).toBe(true);
    });

    it("draw each copy apart from the others: no drop twice at the same place", () => {
        expect(COPY_SALT).toBeGreaterThan(300);
        const four = rainDrops(EPOCH, view, 1, { x: 0, y: 0 }, undefined, 4);
        const places = new Set(four.map((drop) => key(drop.x, drop.y)));
        expect(places.size).toBe(four.length);
    });
});
