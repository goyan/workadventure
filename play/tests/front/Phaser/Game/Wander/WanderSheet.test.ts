import { describe, expect, it } from "vitest";
import { wanderIdleFrame, wanderWalkFrames } from "../../../../../src/front/Phaser/Game/Wander/WanderSheet";

describe("WanderSheet", () => {
    it("walks on the three frames of the row of the direction, back and forth", () => {
        expect(wanderWalkFrames("down")).toEqual([0, 1, 2, 1]);
        expect(wanderWalkFrames("left")).toEqual([3, 4, 5, 4]);
        expect(wanderWalkFrames("right")).toEqual([6, 7, 8, 7]);
        expect(wanderWalkFrames("up")).toEqual([9, 10, 11, 10]);
    });

    it("stands still on the middle frame of the row of the direction", () => {
        expect(wanderIdleFrame("down")).toBe(1);
        expect(wanderIdleFrame("up")).toBe(10);
    });
});
