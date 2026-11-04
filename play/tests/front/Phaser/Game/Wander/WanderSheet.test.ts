import { describe, expect, it } from "vitest";
import {
    WANDER_LIE_DOWN_AFTER_MS,
    wanderIdleFrame,
    wanderStillFrame,
    wanderWalkFrames,
} from "../../../../../src/front/Phaser/Game/Wander/WanderSheet";

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

    it("walks on the first three frames of the row of a 5 column sheet", () => {
        expect(wanderWalkFrames("down", 5)).toEqual([0, 1, 2, 1]);
        expect(wanderWalkFrames("left", 5)).toEqual([5, 6, 7, 6]);
        expect(wanderWalkFrames("up", 5)).toEqual([15, 16, 17, 16]);
        expect(wanderIdleFrame("right", 5)).toBe(11);
    });

    it("stays on the idle frame when the sheet has no rest poses", () => {
        expect(wanderStillFrame("down", 0, 3)).toBe(1);
        expect(wanderStillFrame("left", 60_000, 3)).toBe(4);
        // A 4 column sheet has no complete pair of rest poses.
        expect(wanderStillFrame("left", 60_000, 4)).toBe(5);
    });

    it("sits as soon as it stops, then lies down", () => {
        expect(wanderStillFrame("down", 0, 5)).toBe(3);
        expect(wanderStillFrame("down", WANDER_LIE_DOWN_AFTER_MS - 1, 5)).toBe(3);
        expect(wanderStillFrame("down", WANDER_LIE_DOWN_AFTER_MS, 5)).toBe(4);
        expect(wanderStillFrame("right", 0, 5)).toBe(13);
        expect(wanderStillFrame("up", 60_000, 5)).toBe(19);
    });
});
