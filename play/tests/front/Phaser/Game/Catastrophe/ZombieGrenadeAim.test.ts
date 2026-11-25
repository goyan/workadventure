import { ZOMBIE_PX_PER_METRE } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { zombieGrenadeShotOf } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieGrenadeAim";

/** Where a grenade shot from (1000, 800) goes, in metres along x and y. */
function aheadOf(heading: number): { x: number; y: number } {
    const shot = zombieGrenadeShotOf(1000, 800, heading);
    expect(shot.fromX).toBe(1000);
    expect(shot.fromY).toBe(800);
    return {
        x: Math.round((shot.toX - 1000) / ZOMBIE_PX_PER_METRE),
        y: Math.round((shot.toY - 800) / ZOMBIE_PX_PER_METRE),
    };
}

describe("zombieGrenadeShotOf", () => {
    it("lobs the grenade 20 m ahead the way the avatar looks, not always east", () => {
        // The headings of the Nerf (VehicleFrames): 0 south, 2 west, 4 north, 6 east.
        expect(aheadOf(0)).toEqual({ x: 0, y: 20 });
        expect(aheadOf(2)).toEqual({ x: -20, y: 0 });
        expect(aheadOf(4)).toEqual({ x: 0, y: -20 });
        expect(aheadOf(6)).toEqual({ x: 20, y: 0 });
    });

    it("lobs it on the diagonals as far, when the avatar moves along one", () => {
        expect(aheadOf(1)).toEqual({ x: -14, y: 14 });
        expect(aheadOf(3)).toEqual({ x: -14, y: -14 });
        expect(aheadOf(5)).toEqual({ x: 14, y: -14 });
        expect(aheadOf(7)).toEqual({ x: 14, y: 14 });
    });
});
