import { describe, expect, it } from "vitest";
import {
    companionColumns,
    companionStillFrame,
    companionWalkFrames,
} from "../../../../src/front/Phaser/Companion/CompanionSheet";
import { WANDER_LIE_DOWN_AFTER_MS } from "../../../../src/front/Phaser/Game/Wander/WanderSheet";

describe("CompanionSheet", () => {
    it("reads the number of columns from the width of the sheet", () => {
        expect(companionColumns(96)).toBe(3);
        expect(companionColumns(160)).toBe(5);
        // A sheet narrower than 3 frames keeps the usual numbering.
        expect(companionColumns(64)).toBe(3);
    });

    it("walks on the three first frames of the row of the direction", () => {
        expect(companionWalkFrames("down", 3)).toEqual([0, 1, 2]);
        expect(companionWalkFrames("up", 3)).toEqual([9, 10, 11]);
        expect(companionWalkFrames("left", 5)).toEqual([5, 6, 7]);
        expect(companionWalkFrames("up", 5)).toEqual([15, 16, 17]);
    });

    it("stands on the middle frame without rest poses", () => {
        expect(companionStillFrame("down", 0, 3)).toBe(1);
        expect(companionStillFrame("right", 60_000, 3)).toBe(7);
    });

    it("sits as soon as the player stops, then lies down", () => {
        expect(companionStillFrame("down", 0, 5)).toBe(3);
        expect(companionStillFrame("left", WANDER_LIE_DOWN_AFTER_MS - 1, 5)).toBe(8);
        expect(companionStillFrame("left", WANDER_LIE_DOWN_AFTER_MS, 5)).toBe(9);
        expect(companionStillFrame("up", 60_000, 5)).toBe(19);
    });
});
