import { describe, expect, it } from "vitest";
import {
    cellCopies,
    COPY_SALT,
    copyShown,
    MAX_DRAWN_COPIES,
    RAIN_AMOUNT_BASE,
    seenAmount,
    shownCopiesBound,
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

describe("cellCopies", () => {
    it("holds RAIN_AMOUNT_BASE times the drops of the first version a cell at ×1, and the amount times more", () => {
        expect(RAIN_AMOUNT_BASE).toBe(5);
        for (const amount of [1, 2, 4, 8, 16, 32]) expect(cellCopies(amount)).toBe(amount * RAIN_AMOUNT_BASE);
    });

    it("is bounded on the processor, never under one drop a cell", () => {
        expect(cellCopies(32, MAX_DRAWN_COPIES)).toBe(MAX_DRAWN_COPIES);
        expect(cellCopies(1 / RAIN_AMOUNT_BASE)).toBe(1);
        for (const amount of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(cellCopies(amount)).toBe(RAIN_AMOUNT_BASE);
        }
    });
});

describe("seenAmount", () => {
    it("draws at most ×4 on foot and ×8 from a plane at its cruise altitude or higher, the steps under it as they are", () => {
        expect([1, 2, 4, 8, 16, 32].map((amount) => seenAmount(amount, 0))).toEqual([1, 2, 4, 4, 4, 4]);
        expect([1, 2, 4, 8, 16, 32].map((amount) => seenAmount(amount, 1024))).toEqual([1, 2, 4, 8, 8, 8]);
        expect(seenAmount(32, 2048)).toBe(8);
    });

    it("grows with the altitude in between, without a jump", () => {
        expect(seenAmount(32, 512)).toBeCloseTo(6, 9);
        let previous = seenAmount(32, 0);
        for (let altitude = 16; altitude <= 1100; altitude += 16) {
            const amount = seenAmount(32, altitude);
            expect(amount).toBeGreaterThanOrEqual(previous);
            expect(amount - previous).toBeLessThan(0.2);
            previous = amount;
        }
        expect(seenAmount(32, Number.NaN)).toBe(4);
        expect(seenAmount(32, -50)).toBe(4);
    });
});

describe("copyShown", () => {
    it("is the rain of the first version with one copy: a drop shows when its hash is under the share", () => {
        expect(copyShown(0, 1, 0.3, 0.29)).toBe(true);
        expect(copyShown(0, 1, 0.3, 0.31)).toBe(false);
        expect(copyShown(0, 1, 1, 0.999)).toBe(true);
        expect(copyShown(0, 1, 0, 0)).toBe(false);
    });

    it("shows the first whole copies, the next one by its hash, none after", () => {
        // 5 copies at a share of 0.5: 2.5 drops a cell.
        expect(copyShown(0, 5, 0.5, 0.99)).toBe(true);
        expect(copyShown(1, 5, 0.5, 0.99)).toBe(true);
        expect(copyShown(2, 5, 0.5, 0.49)).toBe(true);
        expect(copyShown(2, 5, 0.5, 0.51)).toBe(false);
        expect(copyShown(3, 5, 0.5, 0)).toBe(false);
        expect(shownCopiesBound(5, 0.5)).toBe(3);
    });

    it("only adds drops as the share grows: a drop shown stays shown", () => {
        for (const copies of [1, 5, 40]) {
            for (let copy = 0; copy < copies; copy++) {
                for (const pick of [0, 0.2, 0.5, 0.9]) {
                    let shown = false;
                    for (let share = 0; share <= 1.0001; share += 0.01) {
                        const now = copyShown(copy, copies, share, pick);
                        if (shown) expect(now).toBe(true);
                        shown = now;
                    }
                }
            }
        }
    });

    it("never shows a copy past the bound the graphics card reads", () => {
        for (const share of [0, 0.05, 0.33, 0.7, 1, 1.4]) {
            const bound = shownCopiesBound(160, share);
            expect(copyShown(bound, 160, share, 0)).toBe(false);
        }
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
