import { describe, it, expect, vi } from "vitest";

// The body of the character: 16 px wide, its feet 16 px under the center of the avatar.
vi.mock("../../../src/front/Phaser/Entity/Character", () => ({
    CHARACTER_BODY_HEIGHT: 16,
    CHARACTER_BODY_OFFSET_X: 0,
    CHARACTER_BODY_OFFSET_Y: 8,
}));

import { PathfindingManager } from "../../../src/front/Utils/PathfindingManager";
import { TileBarriers } from "../../../src/front/Utils/TileBarriers";

const tile = { width: 32, height: 32 };
const centerOf = (x: number, y: number) => ({ x: x * 32 + 16, y: y * 32 + 16 });
/** Where the avatar is when its feet are at the center of a tile: it is positioned by its center, 16 px higher. */
const avatarAt = (x: number, y: number) => ({ x: x * 32 + 16, y: y * 32 });
const emptyGrid = (columns: number, rows: number): number[][] =>
    Array.from({ length: rows }, () => Array<number>(columns).fill(0));

/** A closed room of 3 x 3 tiles at (2, 2), walled on its four sides. */
function closedRoom(): TileBarriers {
    const barriers = new TileBarriers();
    for (let x = 2; x < 5; x += 1) {
        barriers.addSouthBorder(x, 1); // north side
        barriers.addSouthBorder(x, 4); // south side
    }
    for (let y = 2; y < 5; y += 1) {
        barriers.addWestBorder(2, y); // west side
        barriers.addWestBorder(5, y); // east side
    }
    return barriers;
}

describe("PathfindingManager", () => {
    it("finds a straight way on an empty map, from the avatar to the point", async () => {
        const manager = new PathfindingManager(emptyGrid(10, 10), tile);

        const path = await manager.findPathFromGameCoordinates(centerOf(1, 1), centerOf(6, 1));

        expect(path.length).toBeGreaterThan(1);
        expect(path[0].x).toBe(centerOf(1, 1).x);
        expect(path[path.length - 1]).toEqual(centerOf(6, 1));
    });

    it("walks around the tiles that are blocked", async () => {
        const grid = emptyGrid(7, 5);
        for (let y = 0; y < 4; y += 1) {
            grid[y][3] = 1;
        }
        const manager = new PathfindingManager(grid, tile);

        const path = await manager.findPathFromGameCoordinates(centerOf(1, 1), centerOf(5, 1));

        expect(path.length).toBeGreaterThan(2);
        expect(path.some((step) => step.y > 4 * 32)).toBe(true);
    });

    it("walks around a thin wall between two free tiles", async () => {
        // A wall between the columns 2 and 3, from the row 0 to the row 3: the way is by the row 4.
        const barriers = new TileBarriers();
        for (let y = 0; y < 4; y += 1) {
            barriers.addWestBorder(3, y);
        }
        const manager = new PathfindingManager(emptyGrid(7, 5), tile);
        manager.setBarriers(barriers);

        const path = await manager.findPathFromGameCoordinates(centerOf(2, 1), centerOf(4, 1));

        expect(path.length).toBeGreaterThan(2);
        expect(path.some((step) => step.y > 4 * 32)).toBe(true);
    });

    it("does not cut the corner of a wall with a diagonal move", async () => {
        // The wall ends at the corner shared by the tiles (1, 1), (2, 1), (1, 2) and (2, 2).
        const barriers = new TileBarriers();
        barriers.addSouthBorder(1, 1);
        const manager = new PathfindingManager(emptyGrid(4, 4), tile);
        manager.setBarriers(barriers);

        const path = await manager.findPathFromGameCoordinates(avatarAt(1, 1), centerOf(2, 2));

        // Not one step, which would go through the wall: through the free side.
        expect(path.length).toBeGreaterThan(2);
    });

    it("refuses a room closed by walls, wherever the point is in it", async () => {
        const manager = new PathfindingManager(emptyGrid(8, 8), tile);
        manager.setBarriers(closedRoom());

        expect(await manager.findPathFromGameCoordinates(centerOf(0, 3), centerOf(3, 3))).toEqual([]);
        // Even when asked for the nearest point: it is not moved to the other side of the wall.
        expect(await manager.findPathFromGameCoordinates(centerOf(0, 3), centerOf(3, 3), true)).toEqual([]);
    });

    it("walks inside a closed room that the avatar is in", async () => {
        const manager = new PathfindingManager(emptyGrid(8, 8), tile);
        manager.setBarriers(closedRoom());

        const path = await manager.findPathFromGameCoordinates(centerOf(2, 2), centerOf(4, 4));

        expect(path.length).toBeGreaterThan(1);
        expect(path[path.length - 1]).toEqual(centerOf(4, 4));
    });

    it("walks to the free tile next to an object that cannot be stood on, when asked to", async () => {
        const grid = emptyGrid(8, 8);
        grid[3][3] = 1; // a desk
        const manager = new PathfindingManager(grid, tile);

        expect(await manager.findPathFromGameCoordinates(centerOf(0, 3), centerOf(3, 3))).toEqual([]);

        const path = await manager.findPathFromGameCoordinates(centerOf(0, 3), centerOf(3, 3), true);
        const last = path[path.length - 1];
        expect(path.length).toBeGreaterThan(1);
        // On the side of the avatar, next to the desk.
        expect(Math.abs(Math.floor(last.x / 32) - 3)).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.floor(last.y / 32) - 3)).toBeLessThanOrEqual(1);
        expect(Math.floor(last.x / 32)).toBe(2);
    });

    it("does not move an object that is against a wall to the tile on the other side of that wall", async () => {
        const grid = emptyGrid(8, 8);
        grid[3][3] = 1;
        const barriers = new TileBarriers();
        // A wall closes the room of the desk on its west side, from the row 1 to the row 5.
        for (let y = 1; y < 6; y += 1) {
            barriers.addWestBorder(3, y);
            barriers.addWestBorder(5, y);
            barriers.addSouthBorder(3, 0);
        }
        barriers.addSouthBorder(3, 5);
        barriers.addSouthBorder(4, 5);
        barriers.addSouthBorder(4, 0);
        const manager = new PathfindingManager(grid, tile);
        manager.setBarriers(barriers);

        const path = await manager.findPathFromGameCoordinates(centerOf(0, 3), centerOf(3, 3), true);

        expect(path).toEqual([]);
    });

    it("stops at the center of a tile that has a wall on one side", async () => {
        const barriers = new TileBarriers();
        barriers.addWestBorder(6, 1);
        const manager = new PathfindingManager(emptyGrid(10, 10), tile);
        manager.setBarriers(barriers);

        const path = await manager.findPathFromGameCoordinates(centerOf(1, 1), { x: 6 * 32 + 3, y: 1 * 32 + 5 });

        expect(path[path.length - 1]).toEqual(centerOf(6, 1));
    });

    it("keeps the exact point inside a tile with no wall, as long as the body fits in it", async () => {
        const manager = new PathfindingManager(emptyGrid(10, 10), tile);

        const path = await manager.findPathFromGameCoordinates(centerOf(1, 1), { x: 6 * 32 + 20, y: 1 * 32 + 20 });

        expect(path[path.length - 1]).toEqual({ x: 6 * 32 + 20, y: 1 * 32 + 20 });
    });

    it("returns no path for the tile the avatar is in", async () => {
        const manager = new PathfindingManager(emptyGrid(4, 4), tile);

        expect(await manager.findPathFromGameCoordinates(avatarAt(1, 1), centerOf(1, 1))).toEqual([]);
    });

    it("avoids the tiles that cost more when another way exists", async () => {
        const grid = emptyGrid(7, 3);
        for (let x = 1; x < 6; x += 1) {
            grid[1][x] = 2; // exit tiles, costly
        }
        const manager = new PathfindingManager(grid, tile);

        const path = await manager.findPathFromGameCoordinates(centerOf(0, 1), centerOf(6, 1));

        expect(path.every((step) => Math.floor(step.y / 32) !== 1 || step.x < 32 || step.x >= 6 * 32)).toBe(true);
    });

    it("finds its way on a large map at once", async () => {
        const grid = emptyGrid(240, 160);
        const manager = new PathfindingManager(grid, tile);
        const barriers = new TileBarriers();
        for (let y = 0; y < 150; y += 1) {
            barriers.addWestBorder(120, y);
        }
        manager.setBarriers(barriers);

        const startTime = Date.now();
        const path = await manager.findPathFromGameCoordinates(centerOf(10, 10), centerOf(230, 10));

        expect(path.length).toBeGreaterThan(2);
        expect(Date.now() - startTime).toBeLessThan(2000);
    });

    it("takes the side of a wall from the feet of the avatar, not from its center", async () => {
        // A wall under the row 2, from the column 1 to the column 5. The center of the avatar is in the row 2, but its
        // feet, 16 px under, are in the row 3: it is in front of the wall, and the point behind it is not a step away.
        const barriers = new TileBarriers();
        for (let x = 1; x < 6; x += 1) {
            barriers.addSouthBorder(x, 2);
        }
        const manager = new PathfindingManager(emptyGrid(8, 8), tile);
        manager.setBarriers(barriers);

        const path = await manager.findPathFromGameCoordinates({ x: 3 * 32 + 16, y: 2 * 32 + 20 }, centerOf(3, 1));

        expect(path.length).toBeGreaterThan(2);
    });

    it("does not let a straight line brush a wall, even when it saves a turn", async () => {
        // A wall between the columns 4 and 5, from the row 0 to the row 5: a line to the tile right of its end would pass
        // at a few pixels from it.
        const barriers = new TileBarriers(6);
        for (let y = 0; y < 6; y += 1) {
            barriers.addWestBorder(5, y);
        }
        const manager = new PathfindingManager(emptyGrid(10, 10), tile);
        manager.setBarriers(barriers);

        const path = await manager.findPathFromGameCoordinates(centerOf(4, 5), centerOf(5, 7));

        // Never within the width of the body and of the wall of the line x = 5 * 32 above the end of the wall.
        for (let index = 1; index < path.length; index += 1) {
            const from = path[index - 1];
            const to = path[index];
            for (let step = 0; step <= 20; step += 1) {
                const point = { x: from.x + ((to.x - from.x) * step) / 20, y: from.y + ((to.y - from.y) * step) / 20 };
                if (point.y < 6 * 32) {
                    expect(Math.abs(point.x - 5 * 32)).toBeGreaterThanOrEqual(14 - 0.001);
                }
            }
        }
    });

    describe("straight lines", () => {
        it("walks a diagonal in one go instead of in stairs", async () => {
            const manager = new PathfindingManager(emptyGrid(12, 12), tile);

            const path = await manager.findPathFromGameCoordinates(centerOf(1, 1), centerOf(9, 6));

            expect(path).toHaveLength(2);
        });

        it("still turns where a wall is in the way, and keeps away from its end", async () => {
            // A wall between the columns 4 and 5, from the row 0 to the row 5.
            const barriers = new TileBarriers(6);
            for (let y = 0; y < 6; y += 1) {
                barriers.addWestBorder(5, y);
            }
            const manager = new PathfindingManager(emptyGrid(10, 10), tile);
            manager.setBarriers(barriers);

            const path = await manager.findPathFromGameCoordinates(centerOf(3, 2), centerOf(7, 2));

            expect(path.length).toBeGreaterThan(2);
            // Round the end of the wall, which is at the bottom of the row 5: under it, by more than the body and the wall.
            const lowest = Math.max(...path.map((step) => step.y));
            expect(lowest).toBeGreaterThanOrEqual(6 * 32 + 8 + 6);
        });

        it("does not lead the body into a blocked tile", async () => {
            const grid = emptyGrid(10, 10);
            grid[3][4] = 1;
            const manager = new PathfindingManager(grid, tile);

            const path = await manager.findPathFromGameCoordinates(centerOf(1, 3), centerOf(8, 3));

            // A straight line along the row 3 would run into the tile: the way goes round it.
            expect(path.length).toBeGreaterThan(2);
        });
    });
});
