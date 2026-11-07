import { describe, expect, it } from "vitest";
import { getHitboxBounds, getSolidRectangles, getTileCollisionGrid } from "../../../src/front/Utils/EntityHitbox";

const DESK_GRID = [
    [1, 1],
    [0, 0],
];

describe("getTileCollisionGrid", () => {
    it("keeps the 32px grid of an entity placed on the grid of the map", () => {
        expect(getTileCollisionGrid({ x: 64, y: 96 }, { collisionGrid: DESK_GRID }, 32)).toEqual(DESK_GRID);
    });

    it("drops the grid of an entity placed off the grid: its cells would block other tiles than the image", () => {
        expect(getTileCollisionGrid({ x: 4052, y: 2591 }, { collisionGrid: DESK_GRID }, 32)).toBeUndefined();
    });

    it("never blocks with a wandering entity: a character walks in its place", () => {
        expect(
            getTileCollisionGrid({ x: 64, y: 96 }, { collisionGrid: DESK_GRID, wander: { sheetPath: "dog.png" } }, 32),
        ).toBeUndefined();
    });
});

describe("getSolidRectangles", () => {
    it("returns the declared rectangles", () => {
        const rectangles = [{ x: 4, y: 39, width: 24, height: 25 }];
        expect(getSolidRectangles({ x: 10, y: 10 }, { collisionRectangles: rectangles }, 32)).toEqual(rectangles);
    });

    it("turns the grid of an entity placed off the grid into rectangles on its image", () => {
        expect(getSolidRectangles({ x: 4052, y: 2591 }, { collisionGrid: DESK_GRID }, 32)).toEqual([
            { x: 0, y: 0, width: 32, height: 32 },
            { x: 32, y: 0, width: 32, height: 32 },
        ]);
    });

    it("leaves the grid of an entity on the grid to the tile layer", () => {
        expect(getSolidRectangles({ x: 64, y: 96 }, { collisionGrid: DESK_GRID }, 32)).toEqual([]);
    });

    it("never blocks with a wandering entity, even with declared rectangles", () => {
        expect(
            getSolidRectangles(
                { x: 4000, y: 2656 },
                { collisionRectangles: [{ x: 7, y: 7, width: 17, height: 24 }], wander: { sheetPath: "dog.png" } },
                32,
            ),
        ).toEqual([]);
    });

    it("has nothing to block without grid nor rectangles", () => {
        expect(getSolidRectangles({ x: 3, y: 5 }, {}, 32)).toEqual([]);
    });
});

describe("getHitboxBounds", () => {
    it("is the box around the declared rectangles", () => {
        expect(
            getHitboxBounds(
                {
                    collisionRectangles: [
                        { x: 4, y: 30, width: 10, height: 10 },
                        { x: 20, y: 34, width: 8, height: 12 },
                    ],
                },
                32,
            ),
        ).toEqual({ x: 4, y: 30, width: 24, height: 16 });
    });

    it("is the box around the blocking cells of the grid, wherever the entity is placed", () => {
        expect(getHitboxBounds({ collisionGrid: [[1], [0], [0]] }, 32)).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    });

    it("is undefined without any blocking part", () => {
        expect(getHitboxBounds({ collisionGrid: [[0, 0]] }, 32)).toBeUndefined();
    });
});
