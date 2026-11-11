import { describe, expect, it } from "vitest";
import { NERF_BLINK_MS, nerfBlinkTinted } from "../../../../../src/front/Phaser/Game/Nerf/NerfBlink";

describe("nerfBlinkTinted", () => {
    it("alternates red and normal every 75 ms for 600 ms", () => {
        expect(NERF_BLINK_MS).toBe(600);
        expect([0, 74, 75, 149, 150, 599].map((elapsed) => nerfBlinkTinted(elapsed, false))).toEqual([
            true,
            true,
            false,
            false,
            true,
            false,
        ]);
        expect(nerfBlinkTinted(600, false)).toBeUndefined();
    });

    it("shows a single red flash of 150 ms when the player prefers less motion", () => {
        expect(nerfBlinkTinted(0, true)).toBe(true);
        expect(nerfBlinkTinted(149, true)).toBe(true);
        expect(nerfBlinkTinted(150, true)).toBeUndefined();
    });
});
