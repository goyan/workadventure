import { describe, expect, it } from "vitest";
import { DEBRIS_MAX, DebrisField, debrisShare, debrisVelocity } from "@wa/front/Phaser/Game/Catastrophe/DebrisField";
import type { DebrisWind } from "@wa/front/Phaser/Game/Catastrophe/DebrisField";

const VIEW = { x: 0, y: 0, width: 800, height: 600 };
/** A sequence of numbers between 0 and 1 that is the same at each run. */
function seeded(): () => number {
    let state = 12345;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}
const live = (field: DebrisField, seconds: number, windAt: (x: number, y: number) => DebrisWind | undefined): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) field.step(1 / 60, VIEW, windAt);
};

describe("the debris a very strong wind carries", () => {
    it("are torn off from gusts of 120 km/h, every one that may be at 250", () => {
        expect(debrisShare(119)).toBe(0);
        expect(debrisShare(120)).toBe(0);
        expect(debrisShare(185)).toBeCloseTo(0.5);
        expect(debrisShare(250)).toBe(1);
        expect(debrisShare(400)).toBe(1);
    });

    it("go with the wind: a wind from the north carries them south, one from the east to the west", () => {
        const south = debrisVelocity(100, 0);
        expect(south.vx).toBeCloseTo(0);
        expect(south.vy).toBeGreaterThan(0);
        const west = debrisVelocity(100, 90);
        expect(west.vx).toBeLessThan(0);
        expect(west.vy).toBeCloseTo(0);
        expect(Math.hypot(west.vx, west.vy)).toBeGreaterThan(Math.hypot(debrisVelocity(50, 90).vx, 0));
    });

    it("none in a light wind, nor in the calm of the eye; a bounded number in the strongest wind", () => {
        const light = new DebrisField(seeded());
        live(light, 3, () => ({ speed: 80, gust: 100, from: 0 }));
        expect(light.bits).toHaveLength(0);
        const eye = new DebrisField(seeded());
        live(eye, 3, () => ({ speed: 250, gust: 300, from: 0, calm: true }));
        expect(eye.bits).toHaveLength(0);
        const storm = new DebrisField(seeded());
        live(storm, 5, () => ({ speed: 250, gust: 300, from: 0 }));
        expect(storm.bits.length).toBeGreaterThan(DEBRIS_MAX / 2);
        expect(storm.bits.length).toBeLessThanOrEqual(DEBRIS_MAX);
    });

    it("are densest where the gusts are strongest: at the eyewall more than in the outer bands", () => {
        const field = new DebrisField(seeded());
        // The left half of the view in the wall of a storm, the right half in its bands.
        live(field, 5, (x) => (x < 400 ? { speed: 220, gust: 270, from: 0 } : { speed: 120, gust: 150, from: 0 }));
        const wall = field.bits.filter((bit) => bit.x < 400).length;
        const bands = field.bits.filter((bit) => bit.x >= 400).length;
        expect(wall).toBeGreaterThan(2 * bands);
    });

    it("let go of a bit that comes into the eye, and of all when the wind falls", () => {
        const field = new DebrisField(seeded());
        live(field, 3, () => ({ speed: 250, gust: 300, from: 0 }));
        expect(field.bits.length).toBeGreaterThan(0);
        field.step(1 / 60, VIEW, () => ({ speed: 250, gust: 300, from: 0, calm: true }));
        expect(field.bits).toHaveLength(0);
    });
});
