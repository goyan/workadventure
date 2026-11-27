import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ Scenes: { Events: { POST_UPDATE: "postupdate" } } }));

import { shownFloorAt } from "../../../../../src/front/Phaser/Game/Floors/FloorSpike";

// Three storeys over the same tiles x 2..4, ground rows 2..10: a point of the screen falls on a slab of each.
const cells = (): Set<string> => {
    const set = new Set<string>();
    for (let x = 2; x <= 4; x++) for (let y = 2; y <= 10; y++) set.add(`${x}:${y}`);
    return set;
};
const point = { x: 3 * 32 + 16, y: 5 * 32 + 16 };

describe("the floor a click aims at", () => {
    it("is the highest floor drawn there while every floor shows (outdoors on the ground)", () => {
        const levels = [52, 84, 116].map((elevation) => ({ elevation, cells: cells() }));
        expect(shownFloorAt(levels, point.x, point.y)).toBe(116);
    });

    it("is not a floor hidden above the avatar: the floor it stands on, the ground under hidden floors", () => {
        // On the first floor: the two above are hidden.
        const up = [
            { elevation: 52, cells: cells() },
            { elevation: 84, cells: cells(), hidden: true },
            { elevation: 116, cells: cells(), hidden: true },
        ];
        expect(shownFloorAt(up, point.x, point.y)).toBe(52);
        // On the ground inside the building: every floor is hidden.
        const ground = [52, 84, 116].map((elevation) => ({ elevation, cells: cells(), hidden: true }));
        expect(shownFloorAt(ground, point.x, point.y)).toBe(0);
    });

    it("is the floor chosen in the stack of floors, not one above it", () => {
        const viewed = [
            { elevation: 52, cells: cells() },
            { elevation: 84, cells: cells() },
            { elevation: 116, cells: cells(), hidden: true },
        ];
        expect(shownFloorAt(viewed, point.x, point.y)).toBe(84);
    });

    it("is the ground where no floor is drawn", () => {
        expect(shownFloorAt([{ elevation: 52, cells: cells() }], 20 * 32, 20 * 32)).toBe(0);
    });
});
