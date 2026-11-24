import { describe, expect, it } from "vitest";
import { fireGlowAlpha, MeadowState, strawLevel } from "../../../../../src/front/Phaser/Game/Terrain/MeadowState";

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

describe("a dry map without grass", () => {
    it("still has its dry ground to draw", () => {
        const meadow = new MeadowState();
        const bare = { width: 2, height: 1, grass: new Uint8Array([0, 0]), moisture: new Uint8Array([0, 0]) };
        meadow.receive(bare);
        expect(meadow.hasGrass()).toBe(false);
        meadow.receive({ ...bare, dryness: new Uint8Array([0, 200]) });
        expect(meadow.hasGrass()).toBe(true);
    });
});

describe("strawLevel", () => {
    it("turns the ground to straw as much as its grass is dry, even where the grass is thin", () => {
        // Full straw on a full, dry meadow; none on green grass.
        expect(strawLevel(255, 255)).toBe(255);
        expect(strawLevel(255, 0)).toBe(0);
        // Bare fertile ground gone dry yellows too, a little less than grass: 200 of 255.
        expect(strawLevel(0, 255)).toBe(200);
        expect(strawLevel(0, 0)).toBe(0);
        // Thin grass gone dry still yellows the ground it grows on: 230 of 255 at least.
        expect(strawLevel(1, 255)).toBe(230);
        expect(strawLevel(1, 128)).toBe(Math.round((230 * 128) / 255));
        // And denser grass a little more.
        expect(strawLevel(128, 255)).toBeGreaterThan(strawLevel(1, 255));
        expect(strawLevel(128, 255)).toBeLessThan(255);
    });
});

describe("the fire and the ash of the meadow", () => {
    const state = { width: 2, height: 1, grass: new Uint8Array([255, 0]), moisture: new Uint8Array([0, 0]) };

    it("are read tile by tile, and a map has them to draw even without any grass left", () => {
        const meadow = new MeadowState();
        meadow.receive({
            ...state,
            grass: new Uint8Array([0, 0]),
            fire: new Uint8Array([0, 180]),
            ash: new Uint8Array([255, 40]),
        });
        expect(meadow.fireAt(1, 0)).toBe(180);
        expect(meadow.ashAt(0, 0)).toBe(255);
        expect(meadow.fireAt(7, 7)).toBe(0);
        expect(meadow.hasGrass()).toBe(true);
        expect(meadow.isBurning()).toBe(true);
    });

    it("are none from a server that knows no fire, or tells one that does not fit", () => {
        const meadow = new MeadowState();
        meadow.receive(state);
        expect(meadow.fireAt(0, 0)).toBe(0);
        expect(meadow.ashAt(0, 0)).toBe(0);
        expect(meadow.isBurning()).toBe(false);
        meadow.receive({ ...state, fire: new Uint8Array([9]), ash: new Uint8Array(0) });
        expect(meadow.fireAt(0, 0)).toBe(0);
        expect(meadow.grassAt(0, 0)).toBe(255);
    });

    it("glows on the ground as much as it burns", () => {
        expect(fireGlowAlpha(0)).toBe(0);
        expect(fireGlowAlpha(255)).toBeCloseTo(0.85, 5);
        expect(fireGlowAlpha(128)).toBeGreaterThan(fireGlowAlpha(60));
    });
});
