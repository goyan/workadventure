import { describe, expect, it } from "vitest";
import { clickSelectsEntity } from "../../../../src/front/Phaser/Game/MapEditor/EntityClickIntent";

const standing = { layer: undefined };
const floor = { layer: "floor" as const };
const overhead = { layer: "overhead" as const };

describe("clickSelectsEntity", () => {
    it("selects the clicked object when nothing is being placed", () => {
        expect(clickSelectsEntity(undefined, standing, false)).toBe(true);
        expect(clickSelectsEntity(undefined, floor, true)).toBe(true);
    });

    it("selects the clicked object instead of placing the picked one over it", () => {
        expect(clickSelectsEntity(standing, standing, false)).toBe(true);
        expect(clickSelectsEntity(overhead, standing, false)).toBe(true);
        expect(clickSelectsEntity(floor, floor, false)).toBe(true);
    });

    it("keeps placing an object on a floor object, like a chair on a rug", () => {
        expect(clickSelectsEntity(standing, floor, false)).toBe(false);
        expect(clickSelectsEntity(overhead, floor, false)).toBe(false);
    });

    it("places over any object while Shift is held", () => {
        expect(clickSelectsEntity(standing, standing, true)).toBe(false);
        expect(clickSelectsEntity(floor, floor, true)).toBe(false);
    });
});
