import { describe, expect, it } from "vitest";
import { litPolygon, type Point } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";
import {
    obstacleSegments,
    shadowRectangles,
    wallSegments,
} from "../../../../../src/front/Phaser/Game/Lamps/RgbLampObstacles";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { PathTileType } from "../../../../../src/front/Utils/PathfindingManager";

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

const closed = (): boolean => false;

describe("wallSegments", () => {
    it("puts a horizontal wall on the middle of its cap, on the top of its tile row", () => {
        const model = new MapLayerModel();
        model.setWall("h", 1, 2, "blanc");
        // The cap is 12 px thick from the top of the row 2 (y = 64): its middle is at 70.
        expect(wallSegments(model, closed)).toEqual([{ ax: 32, ay: 70, bx: 64, by: 70 }]);
    });

    it("puts a vertical wall on its grid line, between the middles of the caps of its two ends", () => {
        const model = new MapLayerModel();
        model.setWall("v", 3, 1, "blanc");
        expect(wallSegments(model, closed)).toEqual([{ ax: 96, ay: 38, bx: 96, by: 70 }]);
    });

    it("stops the light on a closed door, and lets it through an open one", () => {
        const model = new MapLayerModel();
        model.setWall("h", 1, 1, "blanc");
        model.setWall("h", 2, 1, "blanc");
        model.setWall("h", 3, 1, "blanc");
        model.setDoor({ orientation: "h", x: 3, y: 1 });
        expect(wallSegments(model, closed)).toHaveLength(3);
        const open = wallSegments(model, (door) => door.orientation === "h" && door.x === 3 && door.y === 1);
        expect(open).toEqual([{ ax: 32, ay: 38, bx: 64, by: 38 }]);
    });

    it("lets no light through an L corner", () => {
        const model = new MapLayerModel();
        // A corner at the vertex (3, 1): a wall coming from the west, another going down.
        model.setWall("h", 1, 1, "blanc");
        model.setWall("h", 2, 1, "blanc");
        model.setWall("v", 3, 1, "blanc");
        model.setWall("v", 3, 2, "blanc");
        const light = { x: 64, y: 80, radius: 200, direction: 90, angle: 360 };
        const polygon = litPolygon(light, wallSegments(model, closed));
        // Inside the corner: lit. Beyond it, along the diagonal through the corner and beside it: dark.
        expect(isLit(polygon, { x: 90, y: 45 })).toBe(true);
        for (const point of [
            { x: 102, y: 32 },
            { x: 110, y: 20 },
            { x: 99, y: 30 },
            { x: 105, y: 37 },
            { x: 80, y: 20 },
            { x: 120, y: 80 },
        ]) {
            expect(isLit(polygon, point)).toBe(false);
        }
    });

    it("lets no light through a T junction", () => {
        const model = new MapLayerModel();
        // A wall along the line y = 2, from x = 0 to 4, and a wall going down from its middle.
        for (let x = 0; x < 4; x++) {
            model.setWall("h", x, 2, "blanc");
        }
        model.setWall("v", 2, 2, "blanc");
        model.setWall("v", 2, 3, "blanc");
        // The lamp is in the room south-west of the T.
        const light = { x: 40, y: 100, radius: 200, direction: 90, angle: 360 };
        const polygon = litPolygon(light, wallSegments(model, closed));
        expect(isLit(polygon, { x: 60, y: 75 })).toBe(true);
        for (const point of [
            { x: 68, y: 75 },
            { x: 66, y: 72 },
            { x: 64, y: 60 },
            { x: 62, y: 66 },
            { x: 70, y: 66 },
            { x: 100, y: 100 },
            { x: 40, y: 50 },
        ]) {
            expect(isLit(polygon, point)).toBe(false);
        }
    });
});

describe("shadowRectangles", () => {
    const at = { x: 100, y: 200 };

    it("is nothing for an object that is not tall: a low table lets the light pass", () => {
        expect(shadowRectangles({ collisionRectangles: [{ x: 0, y: 0, width: 32, height: 32 }] }, at, 32)).toEqual([]);
        expect(shadowRectangles({ castsShadow: false, collisionGrid: [[1]] }, at, 32)).toEqual([]);
    });

    it("is the declared collision rectangles of a tall object, where it stands", () => {
        expect(
            shadowRectangles(
                { castsShadow: true, collisionRectangles: [{ x: 4, y: 8, width: 24, height: 16 }] },
                at,
                32,
            ),
        ).toEqual([{ x: 104, y: 208, width: 24, height: 16 }]);
    });

    it("is the blocking cells of the grid of a tall object without rectangles, on the map grid or off it", () => {
        const prefab = {
            castsShadow: true,
            collisionGrid: [
                [0, 1],
                [0, 1],
            ],
        };
        const expected = [
            { x: 32, y: 0, width: 32, height: 32 },
            { x: 32, y: 32, width: 32, height: 32 },
        ];
        expect(shadowRectangles(prefab, { x: 0, y: 0 }, 32)).toEqual(expected);
        expect(shadowRectangles(prefab, { x: 5, y: 7 }, 32)).toEqual(
            expected.map((rectangle) => ({ ...rectangle, x: rectangle.x + 5, y: rectangle.y + 7 })),
        );
    });

    it("is nothing for a tall object that walks around: its image is hidden", () => {
        expect(
            shadowRectangles({ castsShadow: true, collisionGrid: [[1]], wander: { sheetPath: "duck.png" } }, at, 32),
        ).toEqual([]);
    });
});

describe("obstacleSegments", () => {
    const light = { x: 100, y: 100, radius: 64 };
    const nothing = { grid: [], tileSize: 32, walls: [], rectangles: [] };

    it("gathers the walls of the grid, the walls of the map layer and the tall objects around the light", () => {
        const C = PathTileType.Collider;
        const W = PathTileType.Walkable;
        const segments = obstacleSegments(light, {
            grid: [
                [W, W, W, W, W],
                [W, W, W, W, W],
                [W, W, W, W, W],
                [W, W, W, W, C],
            ],
            tileSize: 32,
            walls: [{ ax: 64, ay: 70, bx: 128, by: 70 }],
            rectangles: [{ x: 110, y: 110, width: 10, height: 10 }],
        });
        expect(segments).toContainEqual({ ax: 64, ay: 70, bx: 128, by: 70 });
        expect(segments).toContainEqual({ ax: 110, ay: 110, bx: 120, by: 110 });
        expect(segments).toContainEqual({ ax: 128, ay: 96, bx: 128, by: 128 });
    });

    it("leaves out what the light cannot reach", () => {
        const segments = obstacleSegments(light, {
            ...nothing,
            walls: [{ ax: 0, ay: 300, bx: 500, by: 300 }],
            rectangles: [{ x: 300, y: 300, width: 10, height: 10 }],
        });
        expect(segments).toEqual([]);
    });

    it("ignores a tall object the light stands in: a lamp on a cupboard still shines", () => {
        const segments = obstacleSegments(light, {
            ...nothing,
            rectangles: [{ x: 90, y: 90, width: 20, height: 20 }],
        });
        expect(segments).toEqual([]);
    });
});
