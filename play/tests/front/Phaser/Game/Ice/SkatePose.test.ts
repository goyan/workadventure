import { describe, expect, it } from "vitest";
import { getPlayerAnimations, PlayerAnimationTypes } from "../../../../../src/front/Phaser/Player/Animation";
import {
    ICE_SKATE_LEAN,
    moveAnimationType,
    skateLean,
    stepLean,
} from "../../../../../src/front/Phaser/Game/Ice/SkatePose";

describe("SkatePose", () => {
    it("skates with long glides on each foot and a quick step between them", () => {
        const animations = getPlayerAnimations("woka");
        const down = animations.find((a) => a.key === "woka-down-iceSkate");
        expect(down).toMatchObject({ frames: [0, 0, 0, 1, 2, 2, 2, 1], frameRate: 8, repeat: -1 });
        for (const [direction, first] of [
            ["left", 3],
            ["right", 6],
            ["up", 9],
        ] as const) {
            const animation = animations.find((a) => a.key === `woka-${direction}-iceSkate`);
            expect(animation?.frames).toEqual([
                first,
                first,
                first,
                first + 1,
                first + 2,
                first + 2,
                first + 2,
                first + 1,
            ]);
        }
    });

    it("skates on the ice, walks elsewhere, stands still when not moving", () => {
        expect(moveAnimationType(true, true)).toBe(PlayerAnimationTypes.IceSkate);
        expect(moveAnimationType(true, false)).toBe(PlayerAnimationTypes.Walk);
        expect(moveAnimationType(false, true)).toBe(PlayerAnimationTypes.Idle);
        expect(moveAnimationType(false, false)).toBe(PlayerAnimationTypes.Idle);
    });

    it("leans towards the foot it glides on, and stands straight between two pushes", () => {
        expect(skateLean(0)).toBe(ICE_SKATE_LEAN);
        expect(skateLean(1)).toBe(0);
        expect(skateLean(2)).toBe(-ICE_SKATE_LEAN);
        expect(skateLean(9)).toBe(ICE_SKATE_LEAN);
        expect(skateLean(11)).toBe(-ICE_SKATE_LEAN);
        expect(ICE_SKATE_LEAN).toBeCloseTo((4 * Math.PI) / 180);
    });

    it("eases the lean in, whatever the frame rate", () => {
        const fast = stepLean(stepLean(0, ICE_SKATE_LEAN, 50), ICE_SKATE_LEAN, 50);
        const slow = stepLean(0, ICE_SKATE_LEAN, 100);
        expect(fast).toBeGreaterThan(0);
        expect(fast).toBeLessThan(ICE_SKATE_LEAN);
        expect(Math.abs(fast - slow)).toBeLessThan(1e-9);
    });
});
