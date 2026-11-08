import { describe, expect, it } from "vitest";
import { FadingPool } from "../../../../../src/front/Phaser/Game/Christmas/FadingPool";

describe("FadingPool", () => {
    it("evicts the oldest past capacity", () => {
        const pool = new FadingPool<string>(2, 45_000);
        expect(pool.add("a", 0)).toBeUndefined();
        expect(pool.add("b", 1)).toBeUndefined();
        expect(pool.add("c", 2)).toBe("a");
        expect(pool.size).toBe(2);
    });

    it("fades linearly", () => {
        const pool = new FadingPool<string>(400, 45_000);
        expect(pool.alphaAt(0, 22_500, 0.5)).toBe(0.25);
        expect(pool.alphaAt(0, 45_000, 0.5)).toBe(0);
        expect(pool.alphaAt(0, 90_000, 0.5)).toBe(0);
    });

    it("expires items older than their lifetime", () => {
        const pool = new FadingPool<string>(400, 45_000);
        pool.add("old", 0);
        pool.add("new", 30_000);
        expect(pool.expire(44_999)).toEqual([]);
        expect(pool.expire(45_000)).toEqual(["old"]);
        expect(pool.size).toBe(1);
    });
});
