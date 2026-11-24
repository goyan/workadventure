import { describe, expect, it } from "vitest";
import { fireballEmbers, FIREBALL_EMBER_REACH, FIREBALL_MAX_EMBERS } from "../src/Catastrophe/Fireball";

describe("the embers of a fireball", () => {
    it("are 12 around a crater of 4 tiles, 3 around the smallest and 24 around the largest", () => {
        expect(fireballEmbers(1, 4)).toHaveLength(12);
        expect(fireballEmbers(1, 1)).toHaveLength(3);
        expect(fireballEmbers(1, 8)).toHaveLength(24);
        // Never more than that many, whatever a meteor may be.
        expect(FIREBALL_MAX_EMBERS).toBe(48);
        // Around the smallest crater they still land outside it, within twice its radius.
        for (const { dx, dy } of fireballEmbers(3, 1)) {
            expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(1);
            expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(2);
        }
    });

    it("land between 1 and 2 times the radius of the crater", () => {
        expect(FIREBALL_EMBER_REACH).toBe(2);
        for (const { dx, dy } of fireballEmbers(7, 6)) {
            const far = Math.hypot(dx, dy);
            expect(far).toBeGreaterThanOrEqual(6);
            expect(far).toBeLessThanOrEqual(12);
        }
    });

    it("are the same for the same fireball, and differ from one to the next", () => {
        expect(fireballEmbers(3, 4)).toEqual(fireballEmbers(3, 4));
        expect(fireballEmbers(3, 4)).not.toEqual(fireballEmbers(4, 4));
    });

    it("keep the size within what a meteor may be", () => {
        expect(fireballEmbers(1, Number.NaN)).toHaveLength(12);
        expect(fireballEmbers(1, 99)).toHaveLength(24);
    });
});
