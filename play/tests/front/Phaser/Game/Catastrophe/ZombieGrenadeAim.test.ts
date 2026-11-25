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

    it("lobs it not as far facing an edge of the map, on the same line, never off the map", () => {
        const map = { width: 1200, height: 900 };
        // 200 px from the east edge, facing east: to its last pixel.
        expect(zombieGrenadeShotOf(1000, 800, 6, map)).toMatchObject({ toX: 1199, toY: 800 });
        // Facing north-east from near the corner: shortened along the diagonal, inside.
        const corner = zombieGrenadeShotOf(1100, 100, 5, map);
        expect(corner.toX).toBeLessThanOrEqual(1199);
        expect(corner.toY).toBeGreaterThanOrEqual(0);
        expect(corner.toX - 1100).toBe(100 - corner.toY);
        // Far from the edges: as far as ever.
        expect(zombieGrenadeShotOf(600, 450, 6, map)).toEqual(zombieGrenadeShotOf(600, 450, 6));
    });
});
