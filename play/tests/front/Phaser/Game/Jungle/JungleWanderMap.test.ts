import { describe, expect, it } from "vitest";
import { outdoorWanderMap } from "../../../../../src/front/Phaser/Game/Jungle/JungleWanderMap";
import type { Point, WanderMap } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

// Tiles with x >= 10 are inside a building; tile (3, 3) is taken.
const isOutdoor = (x: number): boolean => x < 10 * 32;

function baseMap(path: Point[] = []): WanderMap {
    return {
        isWalkable: (tile) => !(tile.x === 3 && tile.y === 3),
        findPath: () => Promise.resolve(path),
        seats: () => [{ x: 16, y: 16 }],
    };
}

describe("outdoorWanderMap", () => {
    it("a tile is walkable only when free and outdoors", () => {
        const map = outdoorWanderMap(baseMap(), isOutdoor, 32);
        expect(map.isWalkable({ x: 2, y: 3 })).toBe(true);
        expect(map.isWalkable({ x: 12, y: 3 })).toBe(false);
        expect(map.isWalkable({ x: 3, y: 3 })).toBe(false);
    });

    it("a path that goes indoors is no path", async () => {
        // Through the doors of a building, between two outdoor tiles.
        const throughBuilding = [
            { x: 9 * 32 + 16, y: 48 },
            { x: 11 * 32 + 16, y: 48 },
            { x: 9 * 32 + 16, y: 80 },
        ];
        expect(
            await outdoorWanderMap(baseMap(throughBuilding), isOutdoor, 32).findPath({ x: 0, y: 0 }, { x: 0, y: 0 }),
        ).toEqual([]);
        const outside = [
            { x: 16, y: 48 },
            { x: 48, y: 48 },
            { x: 80, y: 48 },
        ];
        expect(
            await outdoorWanderMap(baseMap(outside), isOutdoor, 32).findPath({ x: 0, y: 0 }, { x: 0, y: 0 }),
        ).toEqual(outside);
    });

    it("rejects sparse paths whose outdoor waypoints cross a building", async () => {
        const from = { x: 16, y: 48 };
        const to = { x: 144, y: 48 };
        const outside = (x: number): boolean => x < 64 || x >= 96;
        const map = outdoorWanderMap(baseMap([from, to]), outside, 32);
        expect(map.isWalkable({ x: 0, y: 1 })).toBe(true);
        expect(map.isWalkable({ x: 4, y: 1 })).toBe(true);
        expect(await map.findPath(from, to)).toEqual([]);
    });

    it("checks the segment to the destination when the base path omits it", async () => {
        const from = { x: 16, y: 48 };
        const to = { x: 144, y: 48 };
        const map = outdoorWanderMap(baseMap([from]), (x) => x < 64 || x >= 96, 32);
        expect(await map.findPath(from, to)).toEqual([]);
    });

    it("checks diagonals through a narrow indoor strip", async () => {
        const from = { x: 16, y: 16 };
        const to = { x: 144, y: 144 };
        const map = outdoorWanderMap(baseMap([from, to]), (x, y) => x < 64 || x >= 72 || y < 64 || y >= 72, 32);
        expect(await map.findPath(from, to)).toEqual([]);
    });

    it("rejects a diagonal that barely grazes an indoor cell", async () => {
        const from = { x: 16, y: 16.1 };
        const to = { x: 144, y: 144.1 };
        const map = outdoorWanderMap(baseMap([from, to]), (x, y) => x < 64 || x >= 72 || y < 72 || y >= 80, 32);
        expect(await map.findPath(from, to)).toEqual([]);
    });

    it("has no seats", () => {
        expect("seats" in outdoorWanderMap(baseMap(), isOutdoor, 32)).toBe(false);
    });
});
