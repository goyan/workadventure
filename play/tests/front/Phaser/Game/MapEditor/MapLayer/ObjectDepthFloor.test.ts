import { describe, expect, it } from "vitest";
import {
    applySupportDepthFloor,
    applyWallDepthFloor,
} from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/ObjectDepthFloor";

describe("applyWallDepthFloor", () => {
    // A 2x3 tiles table sorted on its top row (depth offset -64), crossed by a wall piece with a +21 offset.
    const table = { x: 64, y: 0, width: 64, height: 96 };
    const naturalDepth = 96 - 64;

    it("keeps the object in front of a wall on a tile north of its foot", () => {
        const wall = { x: 64, y: 32, width: 32, height: 32, depth: 64 + 21 };
        expect(applyWallDepthFloor(naturalDepth, table, [wall])).toBeGreaterThan(wall.depth);
    });

    it("leaves the wall in front of an object standing on the wall tile", () => {
        const wall = { x: 64, y: 64, width: 32, height: 32, depth: 96 + 21 };
        expect(applyWallDepthFloor(naturalDepth, table, [wall])).toBe(naturalDepth);
    });

    it("ignores walls that do not overlap the object", () => {
        const wall = { x: 160, y: 32, width: 32, height: 32, depth: 64 + 21 };
        expect(applyWallDepthFloor(naturalDepth, table, [wall])).toBe(naturalDepth);
    });

    it("does not lower an object already above the wall", () => {
        const wall = { x: 64, y: 32, width: 32, height: 32, depth: 10 };
        expect(applyWallDepthFloor(500, table, [wall])).toBe(500);
    });
});

describe("applySupportDepthFloor", () => {
    const table = {
        x: 0,
        y: 0,
        width: 64,
        height: 96,
        depth: 60,
        naturalDepth: 60,
        collisionGrid: [
            [0, 0],
            [1, 1],
            [1, 1],
        ],
    };
    const plant = (x: number, y: number) => ({ x, y, width: 32, height: 64 });

    it("draws an object standing on solid cells of the support over it", () => {
        expect(applySupportDepthFloor(40, plant(32, 0), [table])).toBeGreaterThan(table.depth);
    });

    it("ignores an object whose foot is outside the solid cells", () => {
        expect(applySupportDepthFloor(40, plant(32, -64), [table])).toBe(40);
        expect(applySupportDepthFloor(40, plant(96, 0), [table])).toBe(40);
    });

    it("does not lower an object already above the support", () => {
        expect(applySupportDepthFloor(100, plant(32, 0), [table])).toBe(100);
    });

    it("draws books inside a shelf over it when a wall raised the shelf", () => {
        // 2x3 tiles shelf sorted on its top (natural depth 0), raised to 85.5 by the wall behind it.
        const shelf = { x: 0, y: 0, width: 64, height: 96, depth: 85.5, naturalDepth: 0 };
        const books = { x: 16, y: 32, width: 32, height: 32 };
        expect(applySupportDepthFloor(64, books, [shelf])).toBeGreaterThan(shelf.depth);
    });

    it("keeps an object behind a shelf when its foot is above the shelf", () => {
        const shelf = { x: 0, y: 64, width: 64, height: 96, depth: 64, naturalDepth: 64 };
        expect(applySupportDepthFloor(40, { x: 16, y: 0, width: 32, height: 40 }, [shelf])).toBe(40);
    });
});
