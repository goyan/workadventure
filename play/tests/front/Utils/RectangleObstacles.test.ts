import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/front/Phaser/Entity/Character", () => ({
    CHARACTER_BODY_HEIGHT: 16,
    CHARACTER_BODY_OFFSET_X: 0,
    CHARACTER_BODY_OFFSET_Y: 8,
}));

import { RectangleObstacles } from "../../../src/front/Utils/RectangleObstacles";
import { PathfindingManager } from "../../../src/front/Utils/PathfindingManager";

/** The body of the avatar: 16 x 16, its feet at the middle of its bottom side. */
const BODY = { offsetX: -8, offsetY: -16, width: 16, height: 16 };
const tile = { width: 32, height: 32 };
const centerOf = (x: number, y: number) => ({ x: x * 32 + 16, y: y * 32 + 16 });
const emptyGrid = (columns: number, rows: number): number[][] =>
    Array.from({ length: rows }, () => Array<number>(columns).fill(0));

describe("RectangleObstacles", () => {
    const obstacles = new RectangleObstacles([{ x: 100, y: 100, width: 20, height: 20 }], BODY);

    it("blocks the feet when the body would touch the rectangle", () => {
        expect(obstacles.blocksPoint({ x: 110, y: 110 })).toBe(true);
        // Feet just under the rectangle: the body (16 px above them) overlaps it.
        expect(obstacles.blocksPoint({ x: 110, y: 130 })).toBe(true);
        expect(obstacles.blocksPoint({ x: 110, y: 140 })).toBe(false);
        // Touching an edge is not overlapping.
        expect(obstacles.blocksPoint({ x: 92, y: 110 })).toBe(false);
    });

    it("blocks a segment going through the rectangle, not one passing by", () => {
        expect(obstacles.blocksSegment({ x: 50, y: 110 }, { x: 200, y: 110 })).toBe(true);
        expect(obstacles.blocksSegment({ x: 50, y: 160 }, { x: 200, y: 160 })).toBe(false);
    });

    it("leaves out the rectangle the body overlaps now, not the others", () => {
        const rectangles = [
            { x: 100, y: 100, width: 20, height: 20 },
            { x: 200, y: 100, width: 20, height: 20 },
        ];
        // Spawned or pushed with the feet inside the first rectangle.
        const fromInside = new RectangleObstacles(rectangles, BODY, { x: 110, y: 110 });
        expect(fromInside.blocksPoint({ x: 110, y: 110 })).toBe(false);
        expect(fromInside.blocksSegment({ x: 110, y: 110 }, { x: 110, y: 160 })).toBe(false);
        // The second rectangle on the way still blocks.
        expect(fromInside.blocksSegment({ x: 110, y: 110 }, { x: 300, y: 110 })).toBe(true);
    });
});

describe("PathfindingManager with pixel obstacles", () => {
    it("walks around an object whose tiles are free in the collision grid", async () => {
        // A thin wall (6 px) across the column 3, from the row 0 to the row 3: the grid does not see it.
        const manager = new PathfindingManager(emptyGrid(7, 6), tile);
        manager.setObstacles(new RectangleObstacles([{ x: 3 * 32 + 13, y: 0, width: 6, height: 4 * 32 }], BODY));

        const path = await manager.findPathFromGameCoordinates({ x: centerOf(1, 1).x, y: 1 * 32 }, centerOf(5, 1));

        expect(path.length).toBeGreaterThan(2);
        expect(path.at(-1)).toEqual(centerOf(5, 1));
        expect(path.some((step) => step.y > 4 * 32)).toBe(true);
    });

    it("finds a way out when the avatar stands inside an object (spawn on a shelf)", async () => {
        const manager = new PathfindingManager(emptyGrid(7, 6), tile);
        // A shelf covering the start tile and its neighbours, the grid does not see it.
        const start = { x: centerOf(1, 1).x, y: 1 * 32 };
        const feet = { x: start.x, y: start.y + 16 };
        manager.setObstacles(new RectangleObstacles([{ x: 10, y: 20, width: 90, height: 50 }], BODY, feet));

        const path = await manager.findPathFromGameCoordinates(start, centerOf(5, 4));

        expect(path.at(-1)).toEqual(centerOf(5, 4));
    });
});
