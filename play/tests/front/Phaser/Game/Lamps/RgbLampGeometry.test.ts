import { describe, expect, it } from "vitest";
import {
    blockingCellSegments,
    litPolygon,
    rectangleSegments,
    segmentsNearLight,
    type LightCone,
    type Point,
    type Segment,
} from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";
import { PathTileType } from "../../../../../src/front/Utils/PathfindingManager";

/** Whether a point is inside a polygon (ray casting): what a player standing there sees of the light. */
function isLit(polygon: readonly Point[], point: Point): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

const disc = (radius = 100): LightCone => ({ x: 0, y: 0, radius, direction: 90, angle: 360 });
const sortSegments = (segments: readonly Segment[]): Segment[] =>
    [...segments].sort((a, b) => a.ay - b.ay || a.ax - b.ax || a.by - b.by || a.bx - b.bx);

describe("litPolygon", () => {
    it("is the whole disc of the reach when nothing stands in the way", () => {
        const polygon = litPolygon(disc(), []);
        for (const point of polygon) {
            expect(Math.hypot(point.x, point.y)).toBeCloseTo(100, 6);
        }
        // Round enough: no two neighbouring points further apart than 6 degrees.
        const angles = polygon.map((point) => Math.atan2(point.y, point.x)).sort((a, b) => a - b);
        for (let i = 1; i < angles.length; i++) {
            expect(angles[i] - angles[i - 1]).toBeLessThanOrEqual((6 * Math.PI) / 180);
        }
        expect(isLit(polygon, { x: 0, y: 0 })).toBe(true);
        expect(isLit(polygon, { x: 70, y: 70 })).toBe(true);
        expect(isLit(polygon, { x: 72, y: 72 })).toBe(false);
    });

    it("never reaches further than the reach", () => {
        const far: Segment = { ax: 150, ay: -50, bx: 150, by: 50 };
        for (const point of litPolygon(disc(), [far])) {
            expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(100 + 1e-6);
        }
    });

    it("leaves a shadow behind a wall, as wide as the wall is seen from the lamp", () => {
        // A wall 20 px wide, 10 px east of the lamp: at x = 50 its shadow covers |y| < 50.
        const wall: Segment = { ax: 10, ay: -10, bx: 10, by: 10 };
        const polygon = litPolygon(disc(), [wall]);
        expect(isLit(polygon, { x: 5, y: 0 })).toBe(true);
        expect(isLit(polygon, { x: 50, y: 0 })).toBe(false);
        expect(isLit(polygon, { x: 50, y: 45 })).toBe(false);
        expect(isLit(polygon, { x: 50, y: -45 })).toBe(false);
        expect(isLit(polygon, { x: 50, y: 55 })).toBe(true);
        expect(isLit(polygon, { x: 50, y: -55 })).toBe(true);
        expect(isLit(polygon, { x: -50, y: 0 })).toBe(true);
    });

    it("does not leak through the corner of two walls that meet", () => {
        const corner: Segment[] = [
            { ax: 20, ay: -20, bx: 20, by: 20 },
            { ax: 20, ay: 20, bx: -20, by: 20 },
        ];
        const polygon = litPolygon(disc(), corner);
        expect(isLit(polygon, { x: 40, y: 40 })).toBe(false);
        expect(isLit(polygon, { x: 30, y: 29 })).toBe(false);
        expect(isLit(polygon, { x: 29, y: 30 })).toBe(false);
        expect(isLit(polygon, { x: 15, y: 15 })).toBe(true);
    });

    it("lights only the cone: 90 degrees turned downwards", () => {
        const polygon = litPolygon({ x: 0, y: 0, radius: 100, direction: 90, angle: 90 }, []);
        expect(polygon[0]).toEqual({ x: 0, y: 0 });
        expect(isLit(polygon, { x: 0, y: 50 })).toBe(true);
        expect(isLit(polygon, { x: 30, y: 40 })).toBe(true);
        expect(isLit(polygon, { x: -30, y: 40 })).toBe(true);
        expect(isLit(polygon, { x: 0, y: -50 })).toBe(false);
        expect(isLit(polygon, { x: 50, y: 0 })).toBe(false);
        expect(isLit(polygon, { x: 40, y: 30 })).toBe(false);
    });

    it("lights a cone wider than half a turn, which is not convex", () => {
        const polygon = litPolygon({ x: 0, y: 0, radius: 100, direction: 0, angle: 270 }, []);
        expect(isLit(polygon, { x: 50, y: 0 })).toBe(true);
        expect(isLit(polygon, { x: 0, y: 50 })).toBe(true);
        expect(isLit(polygon, { x: 0, y: -50 })).toBe(true);
        expect(isLit(polygon, { x: -30, y: 40 })).toBe(true);
        expect(isLit(polygon, { x: -30, y: -40 })).toBe(true);
        expect(isLit(polygon, { x: -50, y: 0 })).toBe(false);
        expect(isLit(polygon, { x: -40, y: 10 })).toBe(false);
    });

    it("lights a cone turned to the west, across the jump of the angles", () => {
        const polygon = litPolygon({ x: 0, y: 0, radius: 100, direction: 180, angle: 60 }, []);
        expect(isLit(polygon, { x: -50, y: 5 })).toBe(true);
        expect(isLit(polygon, { x: -50, y: -5 })).toBe(true);
        expect(isLit(polygon, { x: -50, y: 25 })).toBe(true);
        expect(isLit(polygon, { x: -50, y: 35 })).toBe(false);
        expect(isLit(polygon, { x: 50, y: 0 })).toBe(false);
    });

    it("has no corner at the lamp when it shines all around", () => {
        const polygon = litPolygon(disc(), [{ ax: 10, ay: -10, bx: 10, by: 10 }]);
        expect(polygon.some((point) => point.x === 0 && point.y === 0)).toBe(false);
    });

    it("casts the shadow of a wall inside a cone", () => {
        const wall: Segment = { ax: -10, ay: 20, bx: 10, by: 20 };
        const polygon = litPolygon({ x: 0, y: 0, radius: 100, direction: 90, angle: 120 }, [wall]);
        expect(isLit(polygon, { x: 0, y: 10 })).toBe(true);
        expect(isLit(polygon, { x: 0, y: 60 })).toBe(false);
        // Beside the wall, still in the cone.
        expect(isLit(polygon, { x: 40, y: 40 })).toBe(true);
    });

    it("shines on both sides of a wall it is hung on", () => {
        const wall: Segment = { ax: -50, ay: 0, bx: 50, by: 0 };
        const polygon = litPolygon(disc(), [wall]);
        expect(isLit(polygon, { x: 0, y: 50 })).toBe(true);
        expect(isLit(polygon, { x: 0, y: -50 })).toBe(true);
    });

    it("works away from the origin of the map", () => {
        const wall: Segment = { ax: 1010, ay: 1990, bx: 1010, by: 2010 };
        const polygon = litPolygon({ x: 1000, y: 2000, radius: 100, direction: 90, angle: 360 }, [wall]);
        expect(isLit(polygon, { x: 1050, y: 2000 })).toBe(false);
        expect(isLit(polygon, { x: 950, y: 2000 })).toBe(true);
    });
});

describe("blockingCellSegments", () => {
    const W = PathTileType.Walkable;
    const C = PathTileType.Collider;
    const light = { x: 16, y: 16, radius: 320 };

    it("gives the four sides of a lone blocking cell", () => {
        const grid = [
            [W, W, W, W],
            [W, W, C, W],
            [W, W, W, W],
        ];
        expect(sortSegments(blockingCellSegments(grid, 32, light))).toEqual(
            sortSegments([
                { ax: 64, ay: 32, bx: 96, by: 32 },
                { ax: 64, ay: 64, bx: 96, by: 64 },
                { ax: 64, ay: 32, bx: 64, by: 64 },
                { ax: 96, ay: 32, bx: 96, by: 64 },
            ]),
        );
    });

    it("merges the sides of blocking cells in a row into one segment", () => {
        const grid = [
            [W, W, W, W],
            [W, C, C, C],
            [W, W, W, W],
        ];
        const segments = blockingCellSegments(grid, 32, light);
        expect(segments).toContainEqual({ ax: 32, ay: 32, bx: 128, by: 32 });
        expect(segments).toContainEqual({ ax: 32, ay: 64, bx: 128, by: 64 });
        expect(segments).toHaveLength(4);
    });

    it("leaves out the side shared by two blocking cells", () => {
        const grid = [
            [W, W, W],
            [W, C, W],
            [W, C, W],
        ];
        const segments = blockingCellSegments(grid, 32, light);
        expect(segments).toContainEqual({ ax: 32, ay: 32, bx: 32, by: 96 });
        expect(segments).toContainEqual({ ax: 64, ay: 32, bx: 64, by: 96 });
        expect(segments).toHaveLength(4);
    });

    it("only stops the light on walls: an exit, a start or a weighted cell lets it pass", () => {
        const grid = [
            [W, PathTileType.Exit, PathTileType.Start],
            [PathTileType.MeetingRoom, PathTileType.PersonalDesk, W],
        ];
        expect(blockingCellSegments(grid, 32, light)).toEqual([]);
    });

    it("ignores the cells out of the reach of the lamp", () => {
        const row = [W, W, W, W, W, W, W, W, W, C];
        // 9 cells east of the lamp, whose light reaches 3 cells.
        expect(blockingCellSegments([row], 32, { x: 16, y: 16, radius: 96 })).toEqual([]);
    });

    it("ignores the cell the lamp stands in: a wall lamp still shines", () => {
        const grid = [
            [C, W],
            [W, W],
        ];
        expect(blockingCellSegments(grid, 32, light)).toEqual([]);
    });

    it("copes with a ragged or empty grid", () => {
        expect(blockingCellSegments([], 32, light)).toEqual([]);
        expect(blockingCellSegments([[W, C], [W]], 32, { x: 16, y: 48, radius: 320 })).toHaveLength(4);
    });
});

describe("rectangleSegments", () => {
    it("gives the four sides of a rectangle", () => {
        expect(sortSegments(rectangleSegments({ x: 10, y: 20, width: 30, height: 40 }))).toEqual(
            sortSegments([
                { ax: 10, ay: 20, bx: 40, by: 20 },
                { ax: 10, ay: 60, bx: 40, by: 60 },
                { ax: 10, ay: 20, bx: 10, by: 60 },
                { ax: 40, ay: 20, bx: 40, by: 60 },
            ]),
        );
    });
});

describe("segmentsNearLight", () => {
    it("keeps the segments that touch the disc of the reach, and only them", () => {
        const light = { x: 0, y: 0, radius: 100 };
        const touching: Segment = { ax: 90, ay: -500, bx: 90, by: 500 };
        const crossing: Segment = { ax: -500, ay: 10, bx: 500, by: 10 };
        const outside: Segment = { ax: 101, ay: -500, bx: 101, by: 500 };
        const beyondCorner: Segment = { ax: 80, ay: 80, bx: 200, by: 80 };
        expect(segmentsNearLight([touching, crossing, outside, beyondCorner], light)).toEqual([touching, crossing]);
    });
});
