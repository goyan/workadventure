import { describe, expect, it } from "vitest";
import { MeadowState, strawLevel } from "../../../../../src/front/Phaser/Game/Terrain/MeadowState";

describe("the dryness of the meadow", () => {
    it("is read with the grass, tile by tile", () => {
        const meadow = new MeadowState();
        meadow.receive({
            width: 2,
            height: 1,
            grass: new Uint8Array([255, 0]),
            moisture: new Uint8Array([10, 10]),
            dryness: new Uint8Array([200, 0]),
        });
        expect(meadow.drynessAt(0, 0)).toBe(200);
        expect(meadow.drynessAt(1, 0)).toBe(0);
        expect(meadow.drynessAt(5, 5)).toBe(0);
    });

    it("is green where an older server tells none, or one that does not fit", () => {
        const meadow = new MeadowState();
        const state = { width: 2, height: 1, grass: new Uint8Array([255, 255]), moisture: new Uint8Array([0, 0]) };
        meadow.receive(state);
        expect(meadow.drynessAt(0, 0)).toBe(0);
        meadow.receive({ ...state, dryness: new Uint8Array(0) });
        expect(meadow.drynessAt(0, 0)).toBe(0);
        meadow.receive({ ...state, dryness: new Uint8Array([9]) });
        expect(meadow.drynessAt(0, 0)).toBe(0);
        expect(meadow.grassAt(0, 0)).toBe(255);
    });
});

describe("strawLevel", () => {
    it("is how much straw is drawn over the grass of a cell: as much as it is dry, no more than there is grass", () => {
        expect(strawLevel(255, 255)).toBe(255);
        expect(strawLevel(255, 0)).toBe(0);
        expect(strawLevel(0, 255)).toBe(0);
        expect(strawLevel(200, 128)).toBe(Math.round((200 * 128) / 255));
    });
});
