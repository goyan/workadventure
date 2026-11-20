import { describe, expect, it } from "vitest";
import { frostAt, iceAt, isFrozen, towards } from "../../../../../src/front/Phaser/Game/Weather/Frost";

describe("Frost", () => {
    it("whitens the ground from 0 °C, all of it at -10 °C", () => {
        expect(frostAt(5)).toBe(0);
        expect(frostAt(0)).toBe(0);
        expect(frostAt(-5)).toBeCloseTo(0.5);
        expect(frostAt(-25)).toBe(1);
    });

    it("freezes the water from 0 °C, all of it at -15 °C", () => {
        expect(iceAt(5)).toBe(0);
        expect(iceAt(0)).toBe(0);
        expect(iceAt(-7.5)).toBeCloseTo(0.5);
        expect(iceAt(-15)).toBe(1);
        expect(iceAt(-40)).toBe(1);
    });

    it("freezes the shallows first and the deep water last", () => {
        const cold = iceAt(-10);
        expect(isFrozen(4, cold)).toBe(true);
        expect(isFrozen(64, cold)).toBe(false);
        expect(isFrozen(200, iceAt(-15))).toBe(true);
        // No water, no ice.
        expect(isFrozen(0, 1)).toBe(false);
        expect(isFrozen(4, 0)).toBe(false);
    });

    it("moves towards the weather of now at its own pace each way, never past it", () => {
        expect(towards(0, 1, 10, 0.05, 0.01)).toBeCloseTo(0.5);
        expect(towards(1, 0, 10, 0.05, 0.01)).toBeCloseTo(0.9);
        expect(towards(0.9, 1, 60, 0.05, 0.01)).toBe(1);
        expect(towards(0.1, 0, 60, 0.05, 0.01)).toBe(0);
    });
});
