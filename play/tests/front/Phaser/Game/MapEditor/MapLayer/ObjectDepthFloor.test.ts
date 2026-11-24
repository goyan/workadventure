import { describe, expect, it } from "vitest";
import {
    applyDepthStep,
    applySupportDepthFloor,
    applyHungOnWallDepth,
    standsOnSameFloor,
    applyWallDepthFloor,
    getDepthStepRange,
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

    it("reads the foot of a high wall piece on the ground, not under its raised image", () => {
        // The joint of a wall 3 tiles high standing on the row of the foot of the table: its image is drawn 64 px higher,
        // on the first row, but the wall stands on the third one, where the table is behind it.
        const joint = { x: 64, y: 0, width: 12, height: 12, depth: 12 + 21 + 64, footY: 96 };
        expect(applyWallDepthFloor(naturalDepth, table, [joint])).toBe(naturalDepth);
        // The same image without a raised foot is a wall of the first row: the table stands in front of it.
        const low = { x: 64, y: 0, width: 12, height: 12, depth: 12 + 21 };
        expect(applyWallDepthFloor(naturalDepth, table, [low])).toBeGreaterThan(low.depth);
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

describe("applyDepthStep", () => {
    const overlapping = [10, 20, 30, 20];

    it("keeps the automatic depth without a step", () => {
        expect(applyDepthStep(15, 0, overlapping)).toBe(15);
    });

    it("goes over the nth image above, counting each depth once", () => {
        expect(applyDepthStep(15, 1, overlapping)).toBe(20.5);
        expect(applyDepthStep(15, 2, overlapping)).toBe(30.5);
    });

    it("goes under the nth image below", () => {
        expect(applyDepthStep(25, -1, overlapping)).toBe(19.5);
        expect(applyDepthStep(25, -2, overlapping)).toBe(9.5);
    });

    it("stays beyond the last image when the step is too large", () => {
        expect(applyDepthStep(15, 9, overlapping)).toBe(30.5);
        expect(applyDepthStep(15, -9, overlapping)).toBe(9.5);
    });

    it("keeps the automatic depth without any image to cross", () => {
        expect(applyDepthStep(15, 1, [])).toBe(15);
    });
});

describe("getDepthStepRange", () => {
    it("counts the distinct depths above and below", () => {
        expect(getDepthStepRange(15, [10, 20, 30, 20, 15])).toEqual({ down: 1, up: 2 });
    });
});

describe("applyHungOnWallDepth", () => {
    // Two facades of a wall 2 tiles high, side by side: 32 px wide, a cap of 12 px then a face of 52 px.
    const left = { x: 64, y: 100, width: 32, height: 64, depth: 170 };
    const right = { x: 96, y: 100, width: 32, height: 64, depth: 173 };
    const faces = [left, right].map((wall) => ({ ...wall, y: wall.y + 12, height: wall.height - 12 }));

    it("draws a painting hung on the face of a wall over that wall", () => {
        // Its foot is north of the foot of the wall: sorted by its foot it would be hidden behind the wall.
        const painting = { x: 68, y: 120, width: 24, height: 20 };
        expect(applyHungOnWallDepth(140, painting, faces)).toBeGreaterThan(left.depth);
    });

    it("draws it over every wall it hangs across", () => {
        const wide = { x: 80, y: 120, width: 40, height: 20 };
        expect(applyHungOnWallDepth(140, wide, faces)).toBeGreaterThan(right.depth);
    });

    it("leaves behind the wall an object that shows over its cap, or beside it", () => {
        const tree = { x: 68, y: 80, width: 24, height: 70 };
        expect(applyHungOnWallDepth(150, tree, faces)).toBe(150);
        const beside = { x: 50, y: 120, width: 24, height: 20 };
        expect(applyHungOnWallDepth(140, beside, faces)).toBe(140);
    });

    it("never lowers an object already drawn over the wall", () => {
        const painting = { x: 68, y: 120, width: 24, height: 20 };
        expect(applyHungOnWallDepth(400, painting, faces)).toBe(400);
        expect(applyHungOnWallDepth(140, painting, [])).toBe(140);
    });
});

describe("standsOnSameFloor", () => {
    it("keeps the neighbours of the same floor of the map", () => {
        expect(standsOnSameFloor(0, { elevation: 0, floorPiece: false })).toBe(true);
        expect(standsOnSameFloor(52, { elevation: 52, floorPiece: false })).toBe(true);
    });

    it("leaves out an object of another floor: a pool of a raised floor does not carry a fireplace of the ground", () => {
        expect(standsOnSameFloor(0, { elevation: 52, floorPiece: false })).toBe(false);
        expect(standsOnSameFloor(52, { elevation: 0, floorPiece: false })).toBe(false);
    });

    it("leaves out the slabs and stairs: they are the floor, not something on it", () => {
        expect(standsOnSameFloor(52, { elevation: 52, floorPiece: true })).toBe(false);
    });
});
