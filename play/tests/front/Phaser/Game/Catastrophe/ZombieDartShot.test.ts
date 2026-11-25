import { describe, expect, it, vi } from "vitest";
import { zombieDartOf } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieDartShot";
import type { ZombieDartTarget } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieDartShot";
import { zombieDartAsked } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieReceiver";

/** A horde drawn at the step 120, a zombie within `near` px of the barrel. */
function target(near = 100): ZombieDartTarget & { walkingNear: ReturnType<typeof vi.fn> } {
    return {
        step: () => 120,
        walkingNear: vi.fn((_x: number, _y: number, range: number) => near <= range),
    };
}

describe("zombieDartOf", () => {
    it("sends a dart shot on the ground into the horde, from the barrel to its range, at the step drawn", () => {
        const horde = target();
        expect(zombieDartOf(horde, false, 0, 100.4, 200.6, 1, 0)).toEqual({
            fromX: 100,
            fromY: 201,
            toX: 484,
            toY: 201,
            shotStep: 120,
        });
        expect(zombieDartOf(horde, false, 0, 100, 100, 0.6, -0.8)).toEqual({
            fromX: 100,
            fromY: 100,
            toX: 330,
            toY: -207,
            shotStep: 120,
        });
        // As the server is asked it.
        expect(zombieDartAsked({ fromX: 1, fromY: 2, toX: 3, toY: 4, shotStep: 5 })).toMatchObject({
            dart: { fromX: 1, fromY: 2, toX: 3, toY: 4, shotStep: 5 },
            count: 0,
            avatars: "",
        });
    });

    it("sends none in Basique, from a floor or in the air, without a horde drawn, or with no zombie in reach", () => {
        expect(zombieDartOf(target(), true, 0, 100, 100, 1, 0)).toBeUndefined();
        expect(zombieDartOf(target(), false, 64, 100, 100, 1, 0)).toBeUndefined();
        expect(zombieDartOf(undefined, false, 0, 100, 100, 1, 0)).toBeUndefined();
        expect(zombieDartOf({ ...target(), step: () => undefined }, false, 0, 100, 100, 1, 0)).toBeUndefined();
        // Its range and what a zombie runs while it flies: 576 px.
        expect(zombieDartOf(target(570), false, 0, 100, 100, 1, 0)).toBeDefined();
        expect(zombieDartOf(target(600), false, 0, 100, 100, 1, 0)).toBeUndefined();
    });
});
