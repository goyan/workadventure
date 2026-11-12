import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import {
    decodeTorchEquipped,
    TORCH_EQUIPPED_VARIABLE,
    TORCH_RADIUS_TILES,
    torchFlamePose,
} from "../../../../../src/front/Phaser/Game/Torch/TorchProtocol";

describe("TorchProtocol", () => {
    it("shares the torch as a player variable of its own, next to the Nerf's", () => {
        expect(TORCH_EQUIPPED_VARIABLE).toBe("_torchEquipped");
        expect(TORCH_RADIUS_TILES).toBeGreaterThanOrEqual(5);
        expect(TORCH_RADIUS_TILES).toBeLessThanOrEqual(6);
    });

    it("reads a torch only from a true value: anything else, unset included, is no torch", () => {
        expect(decodeTorchEquipped(true)).toBe(true);
        for (const value of [false, undefined, null, "true", 1, {}]) expect(decodeTorchEquipped(value)).toBe(false);
    });

    it("holds the flame above the hand, at the side the avatar faces", () => {
        expect(torchFlamePose(PositionMessage_Direction.RIGHT, false)).toEqual({ x: 5, y: -4 });
        expect(torchFlamePose(PositionMessage_Direction.LEFT, false)).toEqual({ x: -5, y: -4 });
        expect(torchFlamePose(PositionMessage_Direction.UP, false)).toEqual({ x: 5, y: -12 });
        expect(torchFlamePose(PositionMessage_Direction.DOWN, false)).toEqual({ x: 5, y: -2 });
    });

    it("lifts the flame of a seated avatar by 4 px, as the Nerf's blaster", () => {
        expect(torchFlamePose(PositionMessage_Direction.DOWN, true)).toEqual({ x: 5, y: -6 });
    });
});
