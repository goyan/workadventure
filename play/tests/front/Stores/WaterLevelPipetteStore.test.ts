import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    armWaterLevelPipette,
    disarmWaterLevelPipette,
    endWaterLevelGesture,
    waterLevelPipetteArmed,
    noteWaterLevelPress,
    takeWaterLevel,
    waterLevelPipetteOwnsPointer,
    waterLevelPipetteStore,
} from "../../../src/front/Stores/WaterLevelPipetteStore";

afterEach(() => {
    disarmWaterLevelPipette();
    noteWaterLevelPress();
});

describe("the pipette of the level of the water", () => {
    it("is armed by a panel, and the next click on the map gives it the point and disarms it", () => {
        const take = vi.fn();
        armWaterLevelPipette(take);
        expect(get(waterLevelPipetteStore)).toBeDefined();
        expect(takeWaterLevel({ x: 480, y: 640 }, true)).toBe(true);
        expect(take.mock.calls).toEqual([[{ x: 480, y: 640 }, true]]);
        expect(get(waterLevelPipetteStore)).toBeUndefined();
        // Nothing armed: a click is left to the rest.
        expect(takeWaterLevel({ x: 1, y: 1 }, false)).toBe(false);
        expect(take).toHaveBeenCalledTimes(1);
    });

    it("is disarmed without taking anything", () => {
        const take = vi.fn();
        armWaterLevelPipette(take);
        disarmWaterLevelPipette();
        expect(takeWaterLevel({ x: 1, y: 1 }, false)).toBe(false);
        expect(take).not.toHaveBeenCalled();
    });

    it("owns the whole gesture pressed while armed, to the end of its release", async () => {
        expect(waterLevelPipetteOwnsPointer()).toBe(false);
        armWaterLevelPipette(vi.fn());
        expect(waterLevelPipetteArmed()).toBe(true);
        expect(waterLevelPipetteOwnsPointer()).toBe(true);
        noteWaterLevelPress();
        takeWaterLevel({ x: 1, y: 1 }, false);
        endWaterLevelGesture();
        // Disarmed by the release, the rest of that release (its drag end, told in the same frame) is still its own.
        expect(waterLevelPipetteArmed()).toBe(false);
        expect(waterLevelPipetteOwnsPointer()).toBe(true);
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
        expect(waterLevelPipetteOwnsPointer()).toBe(false);
        // A press while nothing aims is free.
        noteWaterLevelPress();
        expect(waterLevelPipetteOwnsPointer()).toBe(false);
    });
});
