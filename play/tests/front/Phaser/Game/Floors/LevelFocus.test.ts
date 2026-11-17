import { describe, expect, it } from "vitest";
import {
    LEVEL_FADE_MS,
    currentLevels,
    fadeToward,
    levelLook,
    veilDepth,
} from "../../../../../src/front/Phaser/Game/Floors/LevelFocus";
import { floorDepth } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorDepth";
import type { PlacedStair } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";

const stair = (base: number, top: number): PlacedStair => ({
    shape: { direction: "n", width: 1, rise: 52, open: false },
    foot: { x: 0, y: 0 },
    base,
    top,
    ground: { x: 0, y: 0, width: 32, height: 64 },
});

describe("the level of the avatar", () => {
    it("is the floor it stands on, or both floors of the stair it is on", () => {
        expect([...currentLevels({ elevation: 0 }, [])]).toEqual([0]);
        expect([...currentLevels({ elevation: 52 }, [])]).toEqual([52]);
        expect([...currentLevels({ elevation: 26, stair: 0 }, [stair(0, 52)])].sort((a, b) => a - b)).toEqual([0, 52]);
    });

    it("tells the floors under it, above it, and its own", () => {
        const current = new Set([52]);
        expect(levelLook(0, current)).toBe("below");
        expect(levelLook(52, current)).toBe("current");
        expect(levelLook(84, current)).toBe("above");
        // On a stair, both its floors are current.
        const climbing = new Set([0, 52]);
        expect(levelLook(0, climbing)).toBe("current");
        expect(levelLook(52, climbing)).toBe("current");
        expect(levelLook(116, climbing)).toBe("above");
    });
});

describe("the veil over the floors under the avatar", () => {
    it("lies just under the slabs of the lowest current floor, over everything lower", () => {
        const depth = veilDepth(new Set([52]));
        expect(depth).toBeDefined();
        // Under the slabs of 52 (drawn at floorDepth(52, 0) - 1), over the ground and over the floors lower than 52.
        expect(depth).toBeLessThan(floorDepth(52, 0) - 1);
        expect(depth).toBeGreaterThan(floorDepth(32, 1_000_000_000 / 1_000));
        expect(depth).toBeGreaterThan(960_000);
    });

    it("is not there on the ground, nor on a stair that starts from it", () => {
        expect(veilDepth(new Set([0]))).toBeUndefined();
        expect(veilDepth(new Set([0, 52]))).toBeUndefined();
    });

    it("fades in and out in 300 ms, at once when motion is reduced", () => {
        expect(LEVEL_FADE_MS).toBe(300);
        expect(fadeToward(0, 0.45, 150, 0.45, false)).toBeCloseTo(0.225);
        expect(fadeToward(0.45, 0, 150, 0.45, false)).toBeCloseTo(0.225);
        expect(fadeToward(0.4, 0.45, 300, 0.45, false)).toBe(0.45);
        expect(fadeToward(0, 0.45, 16, 0.45, true)).toBe(0.45);
    });
});
