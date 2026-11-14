import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import {
    decodeTorchEquipped,
    decodeTorchIntensity,
    TORCH_EQUIPPED_VARIABLE,
    TORCH_INTENSITY_VARIABLE,
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

    it("shares the intensity as a second variable: an older client keeps reading _torchEquipped alone", () => {
        expect(TORCH_INTENSITY_VARIABLE).toBe("_torchIntensity");
    });

    it("reads the intensity in percent, from 10 to 100 by steps of 10; unset or invalid is the full 100", () => {
        for (const value of [10, 50, 70, 100]) expect(decodeTorchIntensity(value)).toBe(value);
        // An older client never sets it, and anything but a finite number is ignored.
        for (const value of [undefined, null, "50", true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(decodeTorchIntensity(value)).toBe(100);
        }
        // Out of range or between two steps: kept within the range, on the nearest step.
        expect(decodeTorchIntensity(0)).toBe(10);
        expect(decodeTorchIntensity(-20)).toBe(10);
        expect(decodeTorchIntensity(130)).toBe(100);
        expect(decodeTorchIntensity(47)).toBe(50);
        expect(decodeTorchIntensity(44)).toBe(40);
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
