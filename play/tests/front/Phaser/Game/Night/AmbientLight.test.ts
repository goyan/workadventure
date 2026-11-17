import { describe, expect, it } from "vitest";
import {
    AMBIENT_FULL_SHARE,
    AMBIENT_MAX,
    LIGHT_SOFT_EDGE_MAX_PX,
    clippedArea,
    lightSoftEdgePx,
    roomAmbience,
} from "../../../../../src/front/Phaser/Game/Night/AmbientLight";

const square = (x: number, y: number, side: number) => [
    { x, y },
    { x: x + side, y },
    { x: x + side, y: y + side },
    { x, y: y + side },
];
const room = { id: "room", x: 0, y: 0, width: 100, height: 100 };

describe("clippedArea", () => {
    it("is the whole surface of a shape inside the rectangle", () => {
        expect(clippedArea(square(10, 10, 20), room)).toBeCloseTo(400);
    });

    it("is the part of a shape that is inside the rectangle", () => {
        expect(clippedArea(square(80, 80, 40), room)).toBeCloseTo(400);
    });

    it("is nothing for a shape outside, or for less than a triangle", () => {
        expect(clippedArea(square(200, 200, 20), room)).toBe(0);
        expect(clippedArea([{ x: 1, y: 1 }], room)).toBe(0);
    });

    it("counts a shape that is not convex, like a light cut by a wall", () => {
        // An L: a 40 x 40 square without its 20 x 20 top-right corner.
        const l = [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 40 },
            { x: 0, y: 40 },
        ];
        expect(clippedArea(l, room)).toBeCloseTo(1200);
        expect(clippedArea(l, { x: 0, y: 0, width: 30, height: 100 })).toBeCloseTo(1000);
    });

    it("does not depend on the way round the shape is drawn", () => {
        expect(clippedArea([...square(10, 10, 20)].reverse(), room)).toBeCloseTo(400);
    });
});

describe("roomAmbience", () => {
    const beam = { polygon: square(0, 0, 20) }; // 4 % of the room

    it("lights faintly, all over, a room a light comes into", () => {
        const share = 0.04 / AMBIENT_FULL_SHARE;
        expect(roomAmbience([room], [beam], 1)).toEqual([
            { ...room, id: "ambient:room", intensity: expect.closeTo(AMBIENT_MAX * share, 5) },
        ]);
    });

    it("follows the setting, and does nothing when it is at zero", () => {
        const [full] = roomAmbience([room], [beam], 1);
        const [half] = roomAmbience([room], [beam], 0.5);
        expect(half.intensity).toBeCloseTo(full.intensity / 2);
        expect(roomAmbience([room], [beam], 0)).toEqual([]);
    });

    it("never takes more of the veil away than its maximum, however much light comes in", () => {
        const flood = { polygon: square(0, 0, 100) };
        expect(roomAmbience([room], [flood, flood], 1)[0].intensity).toBeCloseTo(AMBIENT_MAX);
    });

    it("adds the lights that come into the same room, each by its strength", () => {
        const [one] = roomAmbience([room], [beam], 1);
        const [two] = roomAmbience([room], [beam, { polygon: square(50, 50, 20), intensity: 0.5 }], 1);
        expect(two.intensity).toBeCloseTo(one.intensity * 1.5);
    });

    it("leaves dark a room no light comes into, and a light without shape", () => {
        const elsewhere = { polygon: square(500, 500, 20) };
        expect(roomAmbience([room], [elsewhere, { polygon: undefined }], 1)).toEqual([]);
    });

    it("keeps a light on its own floor of the map", () => {
        const upstairs = { ...room, id: "up", elevation: 64 };
        const lit = roomAmbience([room, upstairs], [{ ...beam, elevation: 64 }], 1);
        expect(lit.map((area) => area.id)).toEqual(["ambient:up"]);
    });
});

describe("lightSoftEdgePx", () => {
    it("softens the edge of the lights with the setting, up to half a tile", () => {
        expect(lightSoftEdgePx(0)).toBe(0);
        expect(lightSoftEdgePx(0.5)).toBeCloseTo(LIGHT_SOFT_EDGE_MAX_PX / 2);
        expect(lightSoftEdgePx(1)).toBe(LIGHT_SOFT_EDGE_MAX_PX);
        expect(lightSoftEdgePx(3)).toBe(LIGHT_SOFT_EDGE_MAX_PX);
        expect(lightSoftEdgePx(Number.NaN)).toBe(0);
    });
});
