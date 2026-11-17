import { describe, expect, it } from "vitest";
import { avatarGroundTile, stairLabels } from "../../../../../src/front/Phaser/Game/Floors/StairHints";
import { FloorModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";

const name = (level: number): string => (level === 0 ? "Sol" : `Niveau ${level}`);

/** A stair going north from the ground to 52, its first step on (5, 6): it arrives on (5, 4). */
function model(): FloorModel {
    const floors = new FloorModel();
    floors.addStair({ direction: "n", width: 1, rise: 52, open: false }, { x: 5, y: 6 }, 0);
    return floors;
}

describe("the label at the other end of a stair", () => {
    it("tells the floor it goes up to, seen from 2 tiles of its foot", () => {
        expect(stairLabels(model().getStairs(), { x: 5, y: 9 }, { elevation: 0 }, name)).toEqual([
            { stair: 0, at: "top", text: "Niveau 52 ↑" },
        ]);
        expect(stairLabels(model().getStairs(), { x: 7, y: 8 }, { elevation: 0 }, name)).toHaveLength(1);
    });

    it("is not there farther than 2 tiles", () => {
        expect(stairLabels(model().getStairs(), { x: 5, y: 10 }, { elevation: 0 }, name)).toEqual([]);
    });

    it("tells the floor it goes down to, seen from its top", () => {
        expect(stairLabels(model().getStairs(), { x: 5, y: 3 }, { elevation: 52 }, name)).toEqual([
            { stair: 0, at: "foot", text: "Sol ↓" },
        ]);
    });

    it("is not there on the stair, nor from another floor", () => {
        expect(stairLabels(model().getStairs(), { x: 5, y: 6 }, { elevation: 26, stair: 0 }, name)).toEqual([]);
        expect(stairLabels(model().getStairs(), { x: 5, y: 9 }, { elevation: 84 }, name)).toEqual([]);
    });
});

describe("the tile of the avatar", () => {
    it("is read on the ground: its feet on the screen moved south by its altitude", () => {
        // On the floor at 52, standing on the ground tile (5, 3): its feet are drawn 52 px further north.
        expect(avatarGroundTile({ x: 5 * 32 + 16, y: 3 * 32 + 16 - 52 }, 52)).toEqual({ x: 5, y: 3 });
        expect(avatarGroundTile({ x: 5 * 32 + 16, y: 9 * 32 + 16 }, 0)).toEqual({ x: 5, y: 9 });
    });
});
