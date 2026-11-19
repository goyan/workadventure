import { describe, expect, it } from "vitest";
import {
    LEVEL_FADE_MS,
    VEIL_ALPHA,
    aboveLevelShows,
    editorLevelAlpha,
    currentLevels,
    stairCoversAvatar,
    stairDepth,
    stairShows,
    veilAlphaToward,
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

describe("a floor above the avatar", () => {
    it("is hidden whole, what stands on it included, once the avatar is indoors or up a floor", () => {
        expect(aboveLevelShows({ indoors: true, raised: false, hidesAvatar: false })).toEqual({ alpha: 0 });
        expect(aboveLevelShows({ indoors: false, raised: true, hidesAvatar: false })).toEqual({ alpha: 0 });
    });

    it("outdoors on the ground keeps the building whole, with a window around the avatar it hides", () => {
        expect(aboveLevelShows({ indoors: false, raised: false, hidesAvatar: false })).toEqual({ alpha: 1 });
        expect(aboveLevelShows({ indoors: false, raised: false, hidesAvatar: true })).toEqual({
            alpha: 1,
            window: true,
        });
    });

    it("hides a floor above a Woka under its slabs even when a doorway has no indoor room", () => {
        expect(aboveLevelShows({ indoors: false, raised: false, hidesAvatar: true, underFloor: true })).toEqual({
            alpha: 0,
        });
    });

    it("leaves the floors under the avatar clearly darker", () => {
        expect(VEIL_ALPHA).toBe(0.7);
    });
});

describe("the depth of a stair", () => {
    it("is its own one, but over the veil while it comes from under the avatar", () => {
        expect(stairDepth(1234, undefined, "below")).toBe(1234);
        expect(stairDepth(1234, 5000, "current")).toBe(1234);
        expect(stairDepth(1234, 5000, "below")).toBe(5001);
    });
});

describe("the veil when the avatar leaves its floor going down", () => {
    it("fades in, but goes at once, so that nothing goes back under a veil still there", () => {
        expect(veilAlphaToward(0, 0.7, 150, false)).toBeCloseTo(0.35);
        expect(veilAlphaToward(0.7, 0, 16, false)).toBe(0);
        expect(veilAlphaToward(0, 0.7, 16, true)).toBe(0.7);
    });
});

describe("a stair over the avatar", () => {
    // A stair going east from the ground to 52, drawn at (100, 48) over 96 × 84, its foot row ending at y = 132.
    const stair = { image: { x: 100, y: 48, width: 96, height: 84 }, groundBottom: 132, top: 52 };

    it("lets the avatar show through when the avatar walks behind it", () => {
        expect(stairCoversAvatar(stair, { x: 140, y: 100, elevation: 0, onStair: false })).toBe(true);
    });

    it("does not when the avatar is in front of it, on it, or above where it arrives", () => {
        expect(stairCoversAvatar(stair, { x: 140, y: 140, elevation: 0, onStair: false })).toBe(false);
        expect(stairCoversAvatar(stair, { x: 140, y: 100, elevation: 20, onStair: true })).toBe(false);
        expect(stairCoversAvatar(stair, { x: 140, y: 60, elevation: 52, onStair: false })).toBe(false);
        expect(stairCoversAvatar(stair, { x: 40, y: 100, elevation: 0, onStair: false })).toBe(false);
    });
});

describe("a stair seen from a floor", () => {
    it("shows when it leaves or reaches the floor of the avatar", () => {
        expect(stairShows({ base: 0, top: 52 }, new Set([0]))).toBe(true);
        expect(stairShows({ base: 0, top: 52 }, new Set([52]))).toBe(true);
        expect(stairShows({ base: 52, top: 104 }, new Set([0, 52]))).toBe(true);
    });

    it("is hidden on a floor under or above the avatar, which it would seem to lead to", () => {
        expect(stairShows({ base: 0, top: 52 }, new Set([208]))).toBe(false);
        expect(stairShows({ base: 104, top: 156 }, new Set([0]))).toBe(false);
    });
});

describe("construction level visibility", () => {
    it("shows the selected platform and hides every other platform", () => {
        expect([52, 104, 156].map((level) => editorLevelAlpha(level, 104))).toEqual([0, 1, 0]);
        expect(editorLevelAlpha(52, 0)).toBe(0);
        expect(editorLevelAlpha(52, 84)).toBe(0);
    });
    it("keeps the whole building available in automatic mode", () => {
        expect(editorLevelAlpha(52, Number.POSITIVE_INFINITY)).toBe(1);
    });
});
