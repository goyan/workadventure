import { describe, expect, it } from "vitest";
import { DRINK_CYCLE_MS, drinkStance } from "../../../../../src/front/Phaser/Game/Wander/WanderDrink";

describe("drinkStance", () => {
    it("bows the animal towards the water on its side, head down most of a cycle", () => {
        const right = drinkStance("right", DRINK_CYCLE_MS / 2, false);
        const left = drinkStance("left", DRINK_CYCLE_MS / 2, false);
        expect(right.angle).toBeGreaterThan(0);
        expect(left.angle).toBe(-right.angle);
        expect(right.scaleY).toBe(1);
    });

    it("crouches an animal that faces the water above or under it", () => {
        const down = drinkStance("down", DRINK_CYCLE_MS / 2, false);
        expect(down.angle).toBe(0);
        expect(down.scaleY).toBeLessThan(1);
        expect(down.dy).toBeGreaterThan(0);
        const up = drinkStance("up", DRINK_CYCLE_MS / 2, false);
        expect(up.scaleY).toBeLessThan(1);
        expect(up.dy).toBe(0);
    });

    it("raises its head at the end of each cycle, then drinks again", () => {
        expect(drinkStance("right", DRINK_CYCLE_MS - 1, false)).toEqual({ dx: 0, dy: 0, angle: 0, scaleY: 1 });
        expect(drinkStance("right", DRINK_CYCLE_MS * 1.5, false)).toEqual(
            drinkStance("right", DRINK_CYCLE_MS / 2, false),
        );
    });

    it("laps: the head moves a pixel to and fro while it is down", () => {
        const offsets = new Set<number>();
        for (let ms = DRINK_CYCLE_MS * 0.3; ms < DRINK_CYCLE_MS * 0.6; ms += 50) {
            offsets.add(drinkStance("right", ms, false).dx);
        }
        expect([...offsets].sort()).toEqual([0, 1]);
    });

    it("moves by steps: the same stance for a tenth of a second", () => {
        expect(drinkStance("left", 1000, false)).toEqual(drinkStance("left", 1099, false));
    });

    it("holds one still stance, head down, when less motion is asked for", () => {
        const stances = new Set<string>();
        for (let ms = 0; ms < DRINK_CYCLE_MS * 2; ms += 100) {
            stances.add(JSON.stringify(drinkStance("right", ms, true)));
        }
        expect(stances.size).toBe(1);
        expect(drinkStance("right", 0, true).angle).toBeGreaterThan(0);
    });
});
