import { describe, expect, it } from "vitest";
import { litPolygon } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";
import {
    obstacleSegments,
    shadowRectangles,
    wallSegments,
} from "../../../../../src/front/Phaser/Game/Lamps/RgbLampObstacles";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { PathTileType } from "../../../../../src/front/Utils/PathfindingManager";
import { isLit } from "./LightTestUtils";

const closed = (): boolean => false;

describe("wallSegments", () => {
    it("puts a horizontal wall on the middle of its cap, on the top of its tile row", () => {
        const model = new MapLayerModel();
        model.setWall("h", 1, 2, "blanc");
        // The cap is 12 px thick from the top of the row 2 (y = 64): its middle is at 70.
        expect(wallSegments(model, closed)).toEqual([{ ax: 32, ay: 70, bx: 64, by: 70 }]);
    });

    it("stops the light on the cap of a high wall, drawn above its foot: its whole face is lit from the south", () => {
        const model = new MapLayerModel();
        model.setWall("h", 1, 4, "blanc", 2);
        model.setWall("h", 2, 4, "blanc", 2);
        const segments = wallSegments(model, closed);
        // The cap of a wall two tiles high is drawn one tile north of the cap of a low wall (y = 134): at 102.
        expect(segments).toContainEqual({ ax: 32, ay: 102, bx: 64, by: 102 });
        expect(segments).toContainEqual({ ax: 64, ay: 102, bx: 96, by: 102 });
        expect(segments.some((segment) => segment.ay === 134 && segment.by === 134)).toBe(false);
        const fromSouth = litPolygon({ x: 64, y: 180, radius: 200, direction: 270, angle: 360 }, segments);
        // The face, from the foot of the wall up to its cap: lit. Behind the wall: dark.
        expect(isLit(fromSouth, { x: 64, y: 150 })).toBe(true);
        expect(isLit(fromSouth, { x: 64, y: 110 })).toBe(true);
        expect(isLit(fromSouth, { x: 64, y: 90 })).toBe(false);
        // From the room behind it, the light stops on the cap: it does not light the face on the other side.
        const fromNorth = litPolygon({ x: 64, y: 60, radius: 200, direction: 90, angle: 360 }, segments);
        expect(isLit(fromNorth, { x: 64, y: 90 })).toBe(true);
        expect(isLit(fromNorth, { x: 64, y: 120 })).toBe(false);
    });

    it("casts no shadow on the face of a high wall from a light at its foot", () => {
        const model = new MapLayerModel();
        for (const x of [1, 2, 3, 4, 5, 6]) model.setWall("h", x, 4, "blanc", 2);
        // A light right under the wall, at its east end: the face far to the west is lit up to its cap.
        const polygon = litPolygon(
            { x: 200, y: 150, radius: 400, direction: 180, angle: 360 },
            wallSegments(model, closed),
        );
        for (const x of [180, 140, 100, 60, 40]) {
            expect(isLit(polygon, { x, y: 106 })).toBe(true);
        }
    });

    it("lets no light through the face of a high wall where a wall leaves it towards the south", () => {
        const model = new MapLayerModel();
        for (const x of [1, 2, 3, 4]) model.setWall("h", x, 4, "blanc", 2);
        // A wall going down from the middle of the high wall: two spaces south of it.
        model.setWall("v", 3, 4, "blanc", 2);
        model.setWall("v", 3, 5, "blanc", 2);
        model.setWall("v", 3, 6, "blanc", 2);
        const light = { x: 70, y: 170, radius: 300, direction: 0, angle: 360 };
        const polygon = litPolygon(light, wallSegments(model, closed));
        expect(isLit(polygon, { x: 80, y: 120 })).toBe(true);
        // On the other side of the wall going down: dark, also right under the cap of the high wall.
        for (const point of [
            { x: 110, y: 110 },
            { x: 120, y: 125 },
            { x: 130, y: 160 },
        ]) {
            expect(isLit(polygon, point)).toBe(false);
        }
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
