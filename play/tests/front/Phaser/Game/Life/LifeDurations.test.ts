import { describe, expect, it } from "vitest";
import {
    durationAtSlider,
    formatDuration,
    LIFE_SLIDER_STEPS,
    sliderOfDuration,
} from "../../../../../src/front/Phaser/Game/Life/LifeDurations";

describe("LifeDurations", () => {
    it("goes from the shortest to the longest duration, by steps that grow with it", () => {
        expect(durationAtSlider(0, 10, 3600)).toBe(10);
        expect(durationAtSlider(LIFE_SLIDER_STEPS, 10, 3600)).toBe(3600);
        const low = durationAtSlider(20, 10, 3600) - durationAtSlider(10, 10, 3600);
        const high = durationAtSlider(90, 10, 3600) - durationAtSlider(80, 10, 3600);
        expect(high).toBeGreaterThan(low);
    });

    it("finds the place of a duration on the slider", () => {
        expect(sliderOfDuration(10, 10, 3600)).toBe(0);
        expect(sliderOfDuration(3600, 10, 3600)).toBe(LIFE_SLIDER_STEPS);
        const position = sliderOfDuration(120, 10, 3600);
        expect(Math.abs(durationAtSlider(position, 10, 3600) - 120)).toBeLessThanOrEqual(10);
    });

    it("writes a duration in seconds, minutes or hours", () => {
        expect(formatDuration(45)).toBe("45 s");
        expect(formatDuration(120)).toBe("2 min");
        expect(formatDuration(90)).toBe("1 min 30 s");
        expect(formatDuration(7200)).toBe("2 h");
        expect(formatDuration(5400)).toBe("1 h 30 min");
    });
});
