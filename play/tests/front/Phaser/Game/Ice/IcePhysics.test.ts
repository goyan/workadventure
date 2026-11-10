import { describe, expect, it } from "vitest";
import { iceStep, type Vector } from "../../../../../src/front/Phaser/Game/Ice/IcePhysics";

/** Runs `steps` steps of `dtMs`, and the distance travelled meanwhile. */
function run(velocity: Vector, wanted: Vector, steps: number, dtMs: number): { velocity: Vector; distance: number } {
    let distance = 0;
    for (let i = 0; i < steps; i++) {
        velocity = iceStep(velocity, wanted, dtMs);
        distance += (Math.hypot(velocity.x, velocity.y) * dtMs) / 1000;
    }
    return { velocity, distance };
}

describe("IcePhysics", () => {
    it("reaches about 63% of the wanted speed after 500 ms", () => {
        const { velocity } = run({ x: 0, y: 0 }, { x: 180, y: 0 }, 30, 500 / 30);
        expect(velocity.x).toBeGreaterThanOrEqual(180 * 0.61);
        expect(velocity.x).toBeLessThanOrEqual(180 * 0.65);
        expect(velocity.y).toBe(0);
    });

    it("glides about two tiles once released, then stops", () => {
        let velocity: Vector = { x: 180, y: 0 };
        let distance = 0;
        for (let i = 0; i < 300 && velocity.x !== 0; i++) {
            velocity = iceStep(velocity, { x: 0, y: 0 }, 16.67);
            distance += (velocity.x * 16.67) / 1000;
        }
        expect(distance).toBeGreaterThanOrEqual(50);
        expect(distance).toBeLessThanOrEqual(70);
        expect(velocity).toEqual({ x: 0, y: 0 });
    });

    it("stops below 8 px/s without input, but not while pushing", () => {
        expect(iceStep({ x: 7, y: 0 }, { x: 0, y: 0 }, 16)).toEqual({ x: 0, y: 0 });
        expect(iceStep({ x: 7, y: 0 }, { x: 180, y: 0 }, 16).x).toBeGreaterThan(7);
    });

    it("does not depend on the frame rate", () => {
        const fast = run({ x: 0, y: 0 }, { x: 180, y: 0 }, 60, 1000 / 60).velocity.x;
        const slow = run({ x: 0, y: 0 }, { x: 180, y: 0 }, 30, 1000 / 30).velocity.x;
        expect(Math.abs(fast - slow) / fast).toBeLessThan(0.01);
    });

    it("caps a long step at 100 ms", () => {
        expect(iceStep({ x: 180, y: 0 }, { x: 0, y: 0 }, 5000)).toEqual(iceStep({ x: 180, y: 0 }, { x: 0, y: 0 }, 100));
    });

    it("turns along an arc", () => {
        const velocity = iceStep({ x: 180, y: 0 }, { x: 0, y: 180 }, 100);
        expect(velocity.x).toBeGreaterThan(0);
        expect(velocity.y).toBeGreaterThan(0);
    });

    it("leaves its arguments untouched", () => {
        const velocity = { x: 100, y: 0 };
        iceStep(velocity, { x: 0, y: 0 }, 16);
        expect(velocity).toEqual({ x: 100, y: 0 });
    });
});
