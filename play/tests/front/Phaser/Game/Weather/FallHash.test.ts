import { describe, expect, it } from "vitest";
import {
    FALL_CLOCK_PERIOD_S,
    FALL_HASH_WRAP,
    fallHash,
    fallSeconds,
} from "../../../../../src/front/Phaser/Game/Weather/FallHash";

describe("fallHash", () => {
    it("spreads whole numbers evenly over 0 to 1, a salt apart from another", () => {
        const values: number[] = [];
        const others: number[] = [];
        for (let column = -100; column < 100; column++) {
            for (let row = -50; row < 50; row++) {
                values.push(fallHash(column, row, 5));
                others.push(fallHash(column, row, 13));
            }
        }
        expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...values)).toBeLessThan(1);
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        expect(mean).toBeCloseTo(0.5, 1);
        const tenths = Array.from({ length: 10 }, () => 0);
        for (const value of values) tenths[Math.floor(value * 10)]++;
        for (const count of tenths) expect(count / values.length).toBeGreaterThan(0.085);
        const product = values.reduce((sum, value, index) => sum + (value - 0.5) * (others[index] - 0.5), 0);
        expect(Math.abs(product / values.length)).toBeLessThan(0.005);
    });

    it("reads its inputs modulo FALL_HASH_WRAP, as the graphics card does with numbers of any size", () => {
        expect(fallHash(3, 7, 11)).toBe(fallHash(3 + FALL_HASH_WRAP, 7 - FALL_HASH_WRAP, 11 + 5 * FALL_HASH_WRAP));
        expect(fallHash(-1, 0, 0)).toBe(fallHash(FALL_HASH_WRAP - 1, 0, 0));
        expect(fallHash(2.5e10, 1e9, 4000)).toBe(fallHash(2.5e10 % FALL_HASH_WRAP, 1e9 % FALL_HASH_WRAP, 4000));
    });
});

describe("fallSeconds", () => {
    it("goes round every FALL_CLOCK_PERIOD_S, small enough for the 32 bits of the graphics card", () => {
        const epoch = 1_763_700_000_000;
        expect(fallSeconds(epoch)).toBeGreaterThanOrEqual(0);
        expect(fallSeconds(epoch)).toBeLessThan(FALL_CLOCK_PERIOD_S);
        expect(fallSeconds(epoch + 1500) - fallSeconds(epoch)).toBeCloseTo(1.5, 6);
        expect(fallSeconds(epoch + FALL_CLOCK_PERIOD_S * 1000)).toBeCloseTo(fallSeconds(epoch), 6);
        expect(fallSeconds(-500)).toBeCloseTo(FALL_CLOCK_PERIOD_S - 0.5, 6);
        expect(fallSeconds(Number.NaN)).toBe(0);
    });
});
