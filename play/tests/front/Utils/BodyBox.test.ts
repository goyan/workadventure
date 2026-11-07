import { describe, expect, it } from "vitest";
import { bodyBoxFromSprite } from "../../../src/front/Utils/BodyBox";

describe("bodyBoxFromSprite", () => {
    const body = { x: 100, y: 200, width: 16, height: 16, offset: { x: 8, y: 24 } };

    it("places the box from the sprite transform, not from the last synced body position", () => {
        // The physics only steps while something moves: body.x/y (100, 200) may be stale.
        const sprite = { x: 500, y: 300, scaleX: 1, scaleY: 1, displayOriginX: 16, displayOriginY: 16 };
        expect(bodyBoxFromSprite(sprite, body)).toEqual({ x: 492, y: 308, width: 16, height: 16 });
    });

    it("follows the scale of the sprite", () => {
        const sprite = { x: 500, y: 300, scaleX: 2, scaleY: 2, displayOriginX: 16, displayOriginY: 16 };
        expect(bodyBoxFromSprite(sprite, body)).toEqual({ x: 484, y: 316, width: 16, height: 16 });
    });
});
