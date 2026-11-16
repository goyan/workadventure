import { describe, expect, it } from "vitest";
import { OutdoorGrid, type Rect } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";

const SIZE = 320;
const CELL = 32;

/** A room whose walls run on cells 2 to 6, with an optional gap at (6, 4). */
function room({ gap = false, door = false } = {}): Rect[] {
    const walls: Rect[] = [
        { x: 64, y: 64, width: 160, height: 32 },
        { x: 64, y: 192, width: 160, height: 32 },
        { x: 64, y: 96, width: 32, height: 96 },
    ];
    if (gap) {
        walls.push({ x: 192, y: 96, width: 32, height: 32 }, { x: 192, y: 160, width: 32, height: 32 });
        if (door) walls.push({ x: 192, y: 128, width: 32, height: 32 });
    } else {
        walls.push({ x: 192, y: 96, width: 32, height: 96 });
    }
    return walls;
}

describe("OutdoorGrid", () => {
    it("all outdoor without walls", () => {
        const grid = OutdoorGrid.fromWalls(SIZE, SIZE, CELL, []);
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) expect(grid.isOutdoorCell(col, row)).toBe(true);
        }
    });

    it("closed room is indoor", () => {
        const grid = OutdoorGrid.fromWalls(SIZE, SIZE, CELL, room());
        expect(grid.isOutdoorCell(4, 4)).toBe(false);
        expect(grid.isOutdoorCell(0, 0)).toBe(true);
    });

    it("room with an open doorway is outdoor", () => {
        expect(OutdoorGrid.fromWalls(SIZE, SIZE, CELL, room({ gap: true })).isOutdoorCell(4, 4)).toBe(true);
    });

    it("room closed by a door is indoor", () => {
        expect(OutdoorGrid.fromWalls(SIZE, SIZE, CELL, room({ gap: true, door: true })).isOutdoorCell(4, 4)).toBe(
            false,
        );
    });

    it("wall cells are not outdoor", () => {
        expect(OutdoorGrid.fromWalls(SIZE, SIZE, CELL, room()).isOutdoorCell(2, 2)).toBe(false);
    });

    it("thin wall covers the cells it overlaps", () => {
        const thin = OutdoorGrid.fromWalls(SIZE, SIZE, CELL, [{ x: 36, y: 0, width: 8, height: 320 }]);
        expect(thin.isOutdoorCell(1, 5)).toBe(false);
        expect(thin.isOutdoorCell(0, 5)).toBe(true);
        expect(thin.isOutdoorCell(2, 5)).toBe(true);
        const exact = OutdoorGrid.fromWalls(SIZE, SIZE, CELL, [{ x: 32, y: 0, width: 32, height: 320 }]);
        expect(exact.isOutdoorCell(0, 5)).toBe(true);
        expect(exact.isOutdoorCell(1, 5)).toBe(false);
        expect(exact.isOutdoorCell(2, 5)).toBe(true);
    });

    it("isOutdoorAt converts pixels", () => {
        const grid = OutdoorGrid.fromWalls(SIZE, SIZE, CELL, room());
        expect(grid.isOutdoorAt(4 * 32 + 5, 4 * 32 + 5)).toBe(grid.isOutdoorCell(4, 4));
        expect(grid.isOutdoorAt(5, 5)).toBe(true);
        expect(grid.isOutdoorAt(-50, 9999)).toBe(true);
    });

    it("runs in view", () => {
        const grid = OutdoorGrid.fromWalls(SIZE, SIZE, CELL, room());
        const row4 = grid.outdoorRunsInView({ x: 0, y: 0, width: 320, height: 320 }).filter((run) => run.y === 128);
        expect(row4).toEqual([
            { x: 0, y: 128, width: 64, height: 32 },
            { x: 224, y: 128, width: 96, height: 32 },
        ]);
    });
});

describe("OutdoorGrid rooms", () => {
    // Two rooms side by side: an outline from the cells 2 to 8 (columns) and 2 to 6 (rows), split by the column 5.
    const walls: Rect[] = [
        { x: 64, y: 64, width: 224, height: 32 },
        { x: 64, y: 192, width: 224, height: 32 },
        { x: 64, y: 96, width: 32, height: 96 },
        { x: 256, y: 96, width: 32, height: 96 },
        { x: 160, y: 96, width: 32, height: 96 },
    ];
    const grid = OutdoorGrid.fromWalls(SIZE, SIZE, CELL, walls);

    it("numbers each closed set of indoor cells", () => {
        const left = grid.roomAt(3 * CELL + 16, 4 * CELL + 16);
        const right = grid.roomAt(6 * CELL + 16, 4 * CELL + 16);
        expect(left).toBeDefined();
        expect(right).toBeDefined();
        expect(left).not.toBe(right);
        expect(grid.roomAt(4 * CELL + 16, 3 * CELL + 16)).toBe(left);
    });

    it("has no room outdoors, in a wall or off the map", () => {
        expect(grid.roomAt(16, 16)).toBeUndefined();
        expect(grid.roomAt(5 * CELL + 16, 4 * CELL + 16)).toBeUndefined();
        expect(grid.roomAt(-10, 4 * CELL)).toBeUndefined();
        expect(grid.roomAt(SIZE + 10, 4 * CELL)).toBeUndefined();
    });

    it("tells the rooms a wall borders", () => {
        const left = grid.roomAt(3 * CELL + 16, 4 * CELL + 16);
        const right = grid.roomAt(6 * CELL + 16, 4 * CELL + 16);
        expect([...grid.roomsTouching(walls[4])].sort()).toEqual([left, right].sort());
        expect([...grid.roomsTouching(walls[2])]).toEqual([left]);
        expect(grid.roomsTouching({ x: 0, y: 0, width: 32, height: 32 }).size).toBe(0);
    });
});
