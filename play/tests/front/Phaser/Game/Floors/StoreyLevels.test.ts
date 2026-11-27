import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ Scenes: { Events: { POST_UPDATE: "postupdate" } } }));

import { storeyLevels } from "../../../../../src/front/Phaser/Game/Floors/FloorSpike";

describe("the storeys listed in the stack of floors", () => {
    it("are the floors over a room, not the decks of bridges in the open air", () => {
        const levels = [
            // The decks of two bridges, at level 1 (20 px): no room under them.
            { elevation: 20, roomsUnder: new Set<number>() },
            { elevation: 20, roomsUnder: new Set<number>() },
            // The storeys of an office, and a second floor at 52 px that is a bridge elsewhere on the map.
            { elevation: 116, roomsUnder: new Set([3]) },
            { elevation: 52, roomsUnder: new Set([1, 2]) },
            { elevation: 52, roomsUnder: new Set<number>() },
        ];
        expect(storeyLevels(levels)).toEqual([52, 116]);
    });

    it("are none on a map with bridges only", () => {
        expect(storeyLevels([{ elevation: 20, roomsUnder: new Set<number>() }])).toEqual([]);
    });
});
