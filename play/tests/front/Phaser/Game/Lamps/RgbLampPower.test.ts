import { describe, expect, it } from "vitest";
import { RGB_LAMP_POWER_FADE_MS, RgbLampPower } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampPower";

describe("RgbLampPower", () => {
    it("fades over 200 ms", () => {
        expect(RGB_LAMP_POWER_FADE_MS).toBe(200);
    });

    it("does not fade a lamp seen for the first time: it is as the server says at once", () => {
        const power = new RgbLampPower(() => false);
        expect(power.level("on", true, 1000)).toBe(1);
        expect(power.level("off", false, 1000)).toBe(0);
    });

    it("goes out over 200 ms", () => {
        const power = new RgbLampPower(() => false);
        power.level("a", true, 1000);
        expect(power.level("a", false, 1000)).toBe(1);
        expect(power.level("a", false, 1100)).toBeCloseTo(0.5);
        expect(power.level("a", false, 1200)).toBe(0);
        expect(power.level("a", false, 5000)).toBe(0);
    });

    it("comes back on from where it was when switched again while it goes out", () => {
        const power = new RgbLampPower(() => false);
        power.level("a", true, 1000);
        power.level("a", false, 1000);
        expect(power.level("a", false, 1150)).toBeCloseTo(0.25);
        expect(power.level("a", true, 1150)).toBeCloseTo(0.25);
        expect(power.level("a", true, 1250)).toBeCloseTo(0.75);
        expect(power.level("a", true, 1300)).toBe(1);
    });

    it("switches at once with reduced motion", () => {
        const power = new RgbLampPower(() => true);
        power.level("a", true, 1000);
        expect(power.level("a", false, 1000)).toBe(0);
        expect(power.level("a", true, 1001)).toBe(1);
    });

    it("forgets a lamp that is gone: a new one with its id does not fade", () => {
        const power = new RgbLampPower(() => false);
        power.level("a", true, 1000);
        power.forget("a");
        expect(power.level("a", false, 1001)).toBe(0);
    });
});
