import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import { avatarDrop, waterDepthAtPoint } from "../../../../../src/front/Phaser/Game/Terrain/AvatarDrop";

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
        expect(avatarDrop(hollow, floor, 0, 0, false, false)).toBe(64);
        expect(avatarDrop(hollow, { x: 192, y: 100 }, 0, 0, false, false)).toBe(0);
    });

    it("at the surface of the water it swims in", () => {
        // 20 px of water over a floor 128 px deep: its surface is 108 px down, drawn 54 px lower.
        expect(avatarDrop(hollow, floor, 20, 0, false, false)).toBe(54);
    });

    it("not at all on a raised floor, nor while the map editor is open", () => {
        expect(avatarDrop(hollow, floor, 0, 52, false, false)).toBe(0);
        expect(avatarDrop(hollow, floor, 0, 0, true, false)).toBe(0);
        expect(avatarDrop(undefined, floor, 0, 0, false, false)).toBe(0);
    });

    it("not at all on the deck of a bridge over a hollow: it walks at the level of the deck", () => {
        expect(avatarDrop(hollow, floor, 0, 0, false, true)).toBe(0);
    });

    it("goes down smoothly from the shore into a lake, as the lake is drawn", () => {
        // 100 px of water over the cells of the hollow (rows 10 to 21), dry ground around: the depth of a cell.
        const cellDepth = (x: number, y: number): number => {
            const cellX = Math.floor(x / 16);
            const cellY = Math.floor(y / 16);
            return cellX >= 10 && cellX <= 13 && cellY >= 10 && cellY <= 21 ? 100 : 0;
        };
        let previous = 0;
        for (let y = 120; y <= 240; y++) {
            const feet = { x: 192, y };
            const drop = avatarDrop(hollow, feet, waterDepthAtPoint(cellDepth, feet.x, feet.y), 0, false, false);
            expect(Math.abs(drop - previous)).toBeLessThanOrEqual(2);
            previous = drop;
        }
    });
});
