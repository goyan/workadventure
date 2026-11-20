import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import { avatarDrop } from "../../../../../src/front/Phaser/Game/Terrain/AvatarDrop";

/** A hollow 128 px deep: cells 10 to 13 across and 10 to 21 down (its floor from x 168 to 216, y 168 to 344). */
const hollow = withHeights(
    undefined,
    new Map(
        Array.from({ length: 4 * 12 }, (_, index): [string, number] => [
            cellKey(10 + (index % 4), 10 + Math.floor(index / 4)),
            -128,
        ]),
    ),
);
const floor = { x: 192, y: 250 };

describe("how much lower an avatar is drawn", () => {
    it("as much as the ground under its feet: half its depth", () => {
        expect(avatarDrop(hollow, floor, 0, 0, false)).toBe(64);
        expect(avatarDrop(hollow, { x: 192, y: 100 }, 0, 0, false)).toBe(0);
    });

    it("at the surface of the water it swims in", () => {
        // 20 px of water over a floor 128 px deep: its surface is 108 px down, drawn 54 px lower.
        expect(avatarDrop(hollow, floor, 20, 0, false)).toBe(54);
    });

    it("not at all on a raised floor, nor while the map editor is open", () => {
        expect(avatarDrop(hollow, floor, 0, 52, false)).toBe(0);
        expect(avatarDrop(hollow, floor, 0, 0, true)).toBe(0);
        expect(avatarDrop(undefined, floor, 0, 0, false)).toBe(0);
    });
});
