import { describe, expect, it } from "vitest";
import { placementElevation } from "../../../../../src/front/Phaser/Game/Floors/FloorPlacement";

const slab = (cellX: number, cellY: number, elevation: number) => ({
    collectionName: "Carte Paliers",
    prefabId: "Carte Paliers:dalle-parquet-clair:Default:Down",
    x: cellX * 32,
    y: cellY * 32 - elevation,
    elevation,
});

describe("altitude of an object placed on the map", () => {
    // A floor at 52 px over the tiles 4..6 x 3..5: drawn from y = 44 to y = 140.
    const placed = [3, 4, 5].flatMap((y) => [4, 5, 6].map((x) => slab(x, y, 52)));

    it("puts an object on the floor drawn under its foot", () => {
        // A plant 32 x 48 whose foot (the middle of its bottom) is at (160, 119): over the slab of the tile (5, 5).
        expect(placementElevation(placed, { x: 144, y: 72, width: 32, height: 48 }, false)).toBe(52);
    });

    it("leaves it on the ground where no floor is drawn", () => {
        expect(placementElevation(placed, { x: 16, y: 72, width: 32, height: 48 }, false)).toBe(0);
        // Its image overlaps the floor, but its foot stands south of it.
        expect(placementElevation(placed, { x: 144, y: 110, width: 32, height: 48 }, false)).toBe(0);
    });

    it("leaves it on the ground under a floor when asked to", () => {
        expect(placementElevation(placed, { x: 144, y: 72, width: 32, height: 48 }, true)).toBe(0);
    });

    it("takes the highest of two floors drawn there", () => {
        // A slab at 116 px over the tile (5, 7) is drawn from y = 108 to y = 140, over the first floor.
        expect(placementElevation([...placed, slab(5, 7, 116)], { x: 144, y: 72, width: 32, height: 48 }, false)).toBe(
            116,
        );
    });
});
