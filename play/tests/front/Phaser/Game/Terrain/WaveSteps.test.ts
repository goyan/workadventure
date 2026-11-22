import { describe, expect, it } from "vitest";
import {
    ROUGHNESS_STEP,
    nudgedRoughness,
    roughnessFigure,
} from "../../../../../src/front/Phaser/Game/Terrain/WaveSteps";

describe("the friction of the ground, set to the twentieth", () => {
    it("moves by 0.05", () => {
        expect(ROUGHNESS_STEP).toBe(0.05);
    });

    it("shows two decimals at most, without trailing zeros nor the noise of floats", () => {
        expect(roughnessFigure(0.25)).toBe("0.25");
        expect(roughnessFigure(0.2)).toBe("0.2");
        expect(roughnessFigure(1)).toBe("1");
        expect(roughnessFigure(0.1 + 0.2)).toBe("0.3");
        expect(roughnessFigure(0.15000000000000002)).toBe("0.15");
    });

    it("goes one notch down or up with the buttons, within its bounds, on the twentieth", () => {
        expect(nudgedRoughness(0.35, 1)).toBe(0.4);
        expect(nudgedRoughness(0.4, -1)).toBe(0.35);
        expect(nudgedRoughness(0, -1)).toBe(0);
        expect(nudgedRoughness(10, 1)).toBe(10);
        // A value saved at the former step stays as it is, and the buttons move it on the twentieth.
        expect(nudgedRoughness(0.3, 1)).toBe(0.35);
        expect(nudgedRoughness(0.33, 1)).toBe(0.35);
        expect(nudgedRoughness(0.33, -1)).toBe(0.3);
    });
});
