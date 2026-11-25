import type * as Phaser from "phaser";
import { describe, expect, it } from "vitest";
import { canAimWithPointer, pointerMapPoint } from "../../../../src/front/Phaser/UserInput/PointerAim";

describe("pointerMapPoint", () => {
    it("is the point of the map the main camera shows under the pointer", () => {
        const camera = {} as Phaser.Cameras.Scene2D.Camera;
        const pointer = {
            positionToCamera: (seen: Phaser.Cameras.Scene2D.Camera, output: Phaser.Types.Math.Vector2Like) => {
                expect(seen).toBe(camera);
                output.x = 412.5;
                output.y = 96;
                return output;
            },
        } as Pick<Phaser.Input.Pointer, "positionToCamera">;
        expect(pointerMapPoint(pointer, camera)).toEqual({ x: 412.5, y: 96 });
    });
});

describe("canAimWithPointer", () => {
    it("aims with a mouse over the game that has moved", () => {
        expect(canAimWithPointer(true, { wasTouch: false, moveTime: 1200 })).toBe(true);
    });

    it.each([
        { name: "a touch", isOver: true, pointer: { wasTouch: true, moveTime: 1200 } },
        { name: "a mouse out of the game", isOver: false, pointer: { wasTouch: false, moveTime: 1200 } },
        { name: "a mouse that never moved", isOver: true, pointer: { wasTouch: false, moveTime: 0 } },
    ])("does not aim with $name", ({ isOver, pointer }) => {
        expect(canAimWithPointer(isOver, pointer)).toBe(false);
    });
});
