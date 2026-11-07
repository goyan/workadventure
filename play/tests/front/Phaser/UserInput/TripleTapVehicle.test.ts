import { describe, expect, it } from "vitest";
import { TripleTapVehicle } from "@wa/front/Phaser/UserInput/TripleTapVehicle";

describe("scooter triple tap", () => {
    it("activates only on a third distinct press of the same direction", () => {
        const taps = new TripleTapVehicle();
        expect(taps.update([1], 0)).toBe(false);
        expect(taps.update([1], 50)).toBe(false);
        taps.update([], 60);
        expect(taps.update([1], 100)).toBe(false);
        taps.update([], 120);
        expect(taps.update([1], 200)).toBe(true);
        expect(taps.update([1], 210)).toBe(false);
    });

    it("does not count slow presses, another direction or input while disabled", () => {
        const taps = new TripleTapVehicle();
        taps.update([1], 0);
        taps.update([], 50);
        expect(taps.update([1], 400)).toBe(false);
        taps.update([], 410);
        expect(taps.update([2], 500)).toBe(false);
        taps.update([], 510);
        expect(taps.update([1], 600)).toBe(false);
        taps.reset();
        expect(taps.update([1], 650)).toBe(false);
    });
});
