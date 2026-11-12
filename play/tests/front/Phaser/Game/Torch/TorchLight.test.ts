import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import type { LightObstacles } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampObstacles";
import { torchAnchor, torchLightOrigin, torchLightShape } from "../../../../../src/front/Phaser/Game/Torch/TorchLight";
import { isLit } from "../Lamps/LightTestUtils";

/** A map of 40 by 40 free tiles. */
const freeGrid = (): number[][] => Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0));
const obstacles = (overrides: Partial<LightObstacles> = {}): LightObstacles => ({
    grid: freeGrid(),
    tileSize: 32,
    walls: [],
    rectangles: [],
    ...overrides,
});
const bearer = (x: number, y: number, direction = PositionMessage_Direction.DOWN, seated = false) => ({
    x,
    y,
    direction,
    seated,
});

describe("torchAnchor", () => {
    it("is the middle of the collision body, under the sprite's centre: never inside a wall", () => {
        expect(torchAnchor({ x: 100, y: 200 })).toEqual({ x: 100, y: 208 });
    });
});

describe("torchLightOrigin", () => {
    it("is the flame when nothing stands between the body and the flame", () => {
        expect(torchLightOrigin({ x: 0, y: 20 }, { x: 5, y: 0 }, [])).toEqual({ x: 5, y: 0 });
    });

    it("stays on the body's side of a wall the flame reaches over", () => {
        const origin = torchLightOrigin({ x: 0, y: 20 }, { x: 0, y: 0 }, [{ ax: -50, ay: 10, bx: 50, by: 10 }]);
        expect(origin.x).toBeCloseTo(0);
        expect(origin.y).toBeGreaterThan(10);
        expect(origin.y).toBeLessThan(11);
    });
});

describe("torchLightShape", () => {
    it("lights all around the flame, 5.5 tiles far", () => {
        const { light, polygon } = torchLightShape(bearer(640, 640), obstacles());
        expect(light).toEqual({ x: 645, y: 638, radius: 176, direction: 90, angle: 360 });
        expect(isLit(polygon, { x: 645, y: 800 })).toBe(true);
        expect(isLit(polygon, { x: 645, y: 470 })).toBe(true);
        expect(isLit(polygon, { x: 645, y: 830 })).toBe(false);
    });

    it("is stopped by a blocking column of the map", () => {
        const grid = freeGrid();
        for (let y = 0; y < 40; y++) grid[y][21] = 1;
        const { polygon } = torchLightShape(bearer(640, 640), obstacles({ grid }));
        expect(isLit(polygon, { x: 660, y: 640 })).toBe(true);
        expect(isLit(polygon, { x: 720, y: 640 })).toBe(false);
    });

    it("does not leak through a wall the flame of an avatar standing against it reaches over", () => {
        const grid = freeGrid();
        // A wall of one row, its bottom at y = 608; the avatar stands right under it, facing it.
        for (let x = 0; x < 40; x++) grid[18][x] = 1;
        const { light, polygon } = torchLightShape(bearer(640, 608, PositionMessage_Direction.UP), obstacles({ grid }));
        expect(light.y).toBeGreaterThanOrEqual(608);
        expect(isLit(polygon, { x: 640, y: 560 })).toBe(false);
        expect(isLit(polygon, { x: 640, y: 700 })).toBe(true);
    });

    // A horizontal wall of the map layer on grid line 22: drawn on the tile row 704-736, its cap (where it stops the
    // light) at 710, its collision the foot of the wall, 730-736 (see WALL_FOOTPRINT). The avatars
    // stand as close as their 16 px body allows: north, the sprite centre at 714 (body 714-730); south, at 736.
    const wall = { ax: 0, ay: 710, bx: 1280, by: 710 };

    it.each([PositionMessage_Direction.DOWN, PositionMessage_Direction.UP])(
        "lights the room of an avatar standing north of a thin wall, not the room behind it (facing %s)",
        (direction) => {
            const { light, polygon } = torchLightShape(bearer(640, 714, direction), obstacles({ walls: [wall] }));
            expect(light.y).toBeLessThan(710);
            expect(isLit(polygon, { x: 640, y: 650 })).toBe(true);
            expect(isLit(polygon, { x: 640, y: 780 })).toBe(false);
        },
    );

    it("lights the room of an avatar standing south of a thin wall, and the face of the wall, not the room behind", () => {
        const { polygon } = torchLightShape(
            bearer(640, 736, PositionMessage_Direction.UP),
            obstacles({ walls: [wall] }),
        );
        expect(isLit(polygon, { x: 640, y: 780 })).toBe(true);
        expect(isLit(polygon, { x: 640, y: 720 })).toBe(true);
        expect(isLit(polygon, { x: 640, y: 650 })).toBe(false);
    });

    // A wall on the line 10, columns 10 to 15: cap at 326, free end at x = 512; the avatar north of it, as close as it
    // can (sprite centre at 330), facing down: the flame is held 5 px aside, at y = 328, south of the cap.
    const endingWall = { ax: 320, ay: 326, bx: 512, by: 326 };

    it.each([507, 508, 510])(
        "lights the northern room of an avatar north of a wall up to the free end of the wall (x = %s)",
        (x) => {
            const { light, polygon } = torchLightShape(bearer(x, 330), obstacles({ walls: [endingWall] }));
            expect(light.y).toBeLessThan(326);
            expect(isLit(polygon, { x: 480, y: 280 })).toBe(true);
        },
    );

    it("keeps the room behind the wall dark while the flame is above the wall", () => {
        // x = 507: the flame (512) is still above the wall. Beyond its end, the light goes round the end, as it should.
        const { polygon } = torchLightShape(bearer(507, 330), obstacles({ walls: [endingWall] }));
        expect(isLit(polygon, { x: 480, y: 380 })).toBe(false);
    });

    it("is stopped by a tall object, and does not shine out of one the flame is held into", () => {
        const cupboard = { x: 608, y: 704, width: 64, height: 32 };
        const { polygon } = torchLightShape(bearer(640, 640), obstacles({ rectangles: [cupboard] }));
        expect(isLit(polygon, { x: 640, y: 690 })).toBe(true);
        expect(isLit(polygon, { x: 640, y: 780 })).toBe(false);

        // The avatar stands right under the cupboard, the flame held up into it.
        const above = { x: 608, y: 560, width: 64, height: 40 };
        const { polygon: held } = torchLightShape(
            bearer(640, 600, PositionMessage_Direction.UP),
            obstacles({ rectangles: [above] }),
        );
        expect(isLit(held, { x: 640, y: 540 })).toBe(false);
        expect(isLit(held, { x: 640, y: 680 })).toBe(true);
    });
});
