import { describe, expect, it } from "vitest";
import { zombieDirection, zombieSpedUp } from "@workadventure/map-editor";
import type { ZombieHorde } from "@workadventure/map-editor";
import { zombieShoveOf, zombieShownOf } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieShown";

const START = 1_800_000_000_000;
const horde: ZombieHorde = {
    id: 1,
    seed: 1,
    count: 2000,
    durationMs: 6 * 60_000,
    heading: 270,
    startedAt: START,
    anchorStep: 0,
    anchorAt: START,
    msPerStep: 100,
    ...zombieDirection(270),
    anchorX: 0,
    anchorY: 0,
    widthCells: 10,
    heightCells: 10,
    terrain: "",
    avatars: "",
    safeStep: 0,
};

describe("zombieShownOf", () => {
    it("tells the time left by the clock of the horde: ten times faster on a map ten times faster", () => {
        expect(zombieShownOf(horde, 6, START + 1000)?.secondsLeft).toBe(359);
        // Sped up ten times at its start: six minutes of the horde take 36 s.
        const fast = zombieSpedUp(horde, 10, START);
        expect(zombieShownOf(fast, 6, START + 1000)?.secondsLeft).toBe(35);
        expect(zombieShownOf(undefined, 6, START)).toBeUndefined();
        expect(zombieShownOf(horde, undefined, START)).toBeUndefined();
    });
});

describe("zombieShoveOf", () => {
    const view = { active: () => true, shoveAt: () => ({ x: 30, y: 0 }) };
    const dry = () => 0;

    it("shoves the avatar on dry ground, never in Basique, nor while no horde is drawn, nor into deep water", () => {
        expect(zombieShoveOf(view, false, 100, 100, dry, 20)).toEqual({ x: 30, y: 0 });
        expect(zombieShoveOf(view, true, 100, 100, dry, 20)).toBeUndefined();
        expect(zombieShoveOf({ ...view, active: () => false }, false, 100, 100, dry, 20)).toBeUndefined();
        expect(zombieShoveOf(undefined, false, 100, 100, dry, 20)).toBeUndefined();
        expect(zombieShoveOf(view, false, 100, 100, (x) => (x > 110 ? 25 : 0), 20)).toBeUndefined();
        expect(zombieShoveOf({ ...view, shoveAt: () => ({ x: 0, y: 0 }) }, false, 100, 100, dry, 20)).toBeUndefined();
    });
});
