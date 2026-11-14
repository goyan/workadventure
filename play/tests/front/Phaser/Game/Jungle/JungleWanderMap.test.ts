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

    it("has no seats", () => {
        expect("seats" in outdoorWanderMap(baseMap(), isOutdoor, 32)).toBe(false);
    });
});
