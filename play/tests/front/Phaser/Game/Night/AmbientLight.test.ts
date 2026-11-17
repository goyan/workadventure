import { describe, expect, it } from "vitest";
import { clippedArea, roomAmbience } from "../../../../../src/front/Phaser/Game/Night/AmbientLight";

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
    // Up to half of the veil, reached when 40 % of the room is lit directly.
    const settings = { strength: 0.5, fullShare: 0.4 };

    it("lights faintly, all over, a room a light comes into", () => {
        expect(roomAmbience([room], [beam], settings)).toEqual([
            { ...room, id: "ambient:room", intensity: expect.closeTo(0.5 * (0.04 / 0.4), 5) },
        ]);
    });

    it("follows the strength set, and does nothing when it is at zero", () => {
        const [strong] = roomAmbience([room], [beam], { ...settings, strength: 1 });
        const [weak] = roomAmbience([room], [beam], settings);
        expect(weak.intensity).toBeCloseTo(strong.intensity / 2);
        expect(roomAmbience([room], [beam], { ...settings, strength: 0 })).toEqual([]);
    });

    it("is at its strongest sooner when a smaller share of the room is asked for", () => {
        const [slow] = roomAmbience([room], [beam], settings);
        const [quick] = roomAmbience([room], [beam], { ...settings, fullShare: 0.04 });
        expect(quick.intensity).toBeCloseTo(0.5);
        expect(slow.intensity).toBeLessThan(quick.intensity);
    });

    it("never takes more of the veil away than the strength set, however much light comes in", () => {
        const flood = { polygon: square(0, 0, 100) };
        expect(roomAmbience([room], [flood, flood], settings)[0].intensity).toBeCloseTo(0.5);
    });

    it("adds the lights that come into the same room, each by its strength", () => {
        const [one] = roomAmbience([room], [beam], settings);
        const [two] = roomAmbience([room], [beam, { polygon: square(50, 50, 20), intensity: 0.5 }], settings);
        expect(two.intensity).toBeCloseTo(one.intensity * 1.5);
    });

    it("leaves dark a room no light comes into, and a light without shape", () => {
        const elsewhere = { polygon: square(500, 500, 20) };
        expect(roomAmbience([room], [elsewhere, { polygon: undefined }], settings)).toEqual([]);
    });

    it("keeps a light on its own floor of the map", () => {
        const upstairs = { ...room, id: "up", elevation: 64 };
        const lit = roomAmbience([room, upstairs], [{ ...beam, elevation: 64 }], settings);
        expect(lit.map((area) => area.id)).toEqual(["ambient:up"]);
    });

    it("reads a setting it cannot use as no bounced light", () => {
        expect(roomAmbience([room], [beam], { strength: Number.NaN, fullShare: 0.4 })).toEqual([]);
        expect(roomAmbience([room], [beam], { strength: 0.5, fullShare: 0 })[0].intensity).toBeCloseTo(0.5);
    });
});
