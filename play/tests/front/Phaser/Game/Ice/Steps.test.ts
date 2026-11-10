import { describe, expect, it } from "vitest";
import { takesSteps } from "../../../../../src/front/Phaser/Game/Ice/Steps";

const character = (riding: boolean, onIce: boolean) => ({
    isRidingVehicle: () => riding,
    isOnIce: () => onIce,
});

describe("Steps", () => {
    it("a walker takes steps: footstep sounds and footprints", () => {
        expect(takesSteps(character(false, false))).toBe(true);
    });

    it("a skater glides on the ice, and a rider rolls: no steps", () => {
        expect(takesSteps(character(false, true))).toBe(false);
        expect(takesSteps(character(true, false))).toBe(false);
    });
});
