import { describe, expect, it } from "vitest";
import {
    LEVEL_FADE_MS,
    VEIL_ALPHA,
    aboveLevelShows,
    roofOver,
    roomRoof,
    opensOver,
    EDITOR_OPEN_AIR_ABOVE_ALPHA,
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
    it("shows under an open space indoors, as a mezzanine seen from the hall, and hides under a roof", () => {
        expect(aboveLevelShows({ indoors: true, raised: false, hidesAvatar: false, roofed: false })).toEqual({
            alpha: 1,
        });
        expect(aboveLevelShows({ indoors: true, raised: false, hidesAvatar: true, roofed: false })).toEqual({
            alpha: 1,
            window: true,
        });
        expect(aboveLevelShows({ indoors: false, raised: true, hidesAvatar: false, roofed: false })).toEqual({
            alpha: 1,
        });
        expect(aboveLevelShows({ indoors: true, raised: false, hidesAvatar: false, roofed: true })).toEqual({
            alpha: 0,
        });
    });

    it("closes a room covered at least three quarters by a floor, keeps a mezzanine office and a hall open", () => {
        const ground = new Set([0]);
        // An office of 36 cells, 29 under the floor at 52 px (a stairwell and an edge leave 7 open): closed by 52.
        expect(
            roomRoof(
                [
                    { elevation: 52, covered: 29 },
                    { elevation: 116, covered: 36 },
                ],
                36,
                ground,
            ),
        ).toBe(52);
        // A hall of 315 cells with a mezzanine over 53 of them: open up to 116, which covers it.
        expect(
            roomRoof(
                [
                    { elevation: 52, covered: 53 },
                    { elevation: 116, covered: 300 },
                ],
                315,
                ground,
            ),
        ).toBe(116);
        // Nothing over it.
        expect(roomRoof([{ elevation: 52, covered: 0 }], 36, ground)).toBe(Number.POSITIVE_INFINITY);
        // Hervé's office: 25 of its 36 cells under the floor at 52 px (stairwell counted), the rest open: a mezzanine.
        expect(roomRoof([{ elevation: 52, covered: 25 }], 36, ground)).toBe(Number.POSITIVE_INFINITY);
        // A closed office, wholly under its floor.
        expect(roomRoof([{ elevation: 52, covered: 72 }], 72, ground)).toBe(52);
        // Hall 11 and Hervé's office 17 are open, my office 19 is closed by its first floor.
        const roofs = new Map([
            [11, Number.POSITIVE_INFINITY],
            [17, Number.POSITIVE_INFINITY],
            [19, 52],
        ]);
        const roofOf = (room: number): number => roofs.get(room) ?? Number.POSITIVE_INFINITY;
        const floor = (elevation: number, under: number[], covered: number[] = under) => ({
            elevation,
            roomsUnder: new Set(under),
            roomsCovered: new Set(covered),
        });
        // Hervé's mezzanine shows from his office, from the hall and from my closed office.
        expect(opensOver(floor(52, [17]), roofOf, 17)).toBe(true);
        expect(opensOver(floor(116, [17, 11], [17]), roofOf, 11)).toBe(true);
        expect(opensOver(floor(52, [17]), roofOf, 19)).toBe(true);
        // The floors of my office never show, even partly over the hall.
        expect(opensOver(floor(52, [19]), roofOf, 17)).toBe(false);
        expect(opensOver(floor(116, [19, 11], [19]), roofOf, 11)).toBe(false);
        // An open mezzanine drawn over my closed office does not show inside it.
        expect(opensOver(floor(52, [17], [19, 17]), roofOf, 19)).toBe(false);
        // A deck in the open air is no mezzanine.
        expect(opensOver(floor(20, []), roofOf, 11)).toBe(false);
        // An unknown room is open to nothing rather than divided by zero.
        expect(roomRoof([{ elevation: 52, covered: 3 }], 0, ground)).toBe(Number.POSITIVE_INFINITY);
    });

    it("finds the roof over the avatar: the lowest floor above it with a slab right over it", () => {
        const levels = [
            { elevation: 52, covers: false },
            { elevation: 116, covers: true },
            { elevation: 180, covers: true },
            { elevation: 244, covers: false },
        ];
        // On the ground: open over it up to 116, which is its roof (116 and up hidden, 52 shown).
        expect(roofOver(levels, new Set([0]))).toBe(116);
        // On 116: its own floor is no roof, 180 is.
        expect(roofOver(levels, new Set([116]))).toBe(180);
        // Climbing a stair between 116 and 180: the roof is above both.
        expect(roofOver(levels, new Set([116, 180]))).toBe(Number.POSITIVE_INFINITY);
        expect(roofOver([{ elevation: 52, covers: false }], new Set([0]))).toBe(Number.POSITIVE_INFINITY);
    });

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

    it("always shows a floor in the open air (the deck of a bridge), with a window around an avatar under it", () => {
        const deck = { raised: false, hidesAvatar: false, openAir: true };
        expect(aboveLevelShows({ ...deck, indoors: false })).toEqual({ alpha: 1 });
        // From a room far away, and from under its slabs.
        expect(aboveLevelShows({ ...deck, indoors: true })).toEqual({ alpha: 1 });
        expect(aboveLevelShows({ ...deck, indoors: false, underFloor: true })).toEqual({ alpha: 1, window: true });
        expect(aboveLevelShows({ ...deck, indoors: false, hidesAvatar: true })).toEqual({ alpha: 1, window: true });
        // Drawn over the room the avatar is in, it would hide the room.
        expect(aboveLevelShows({ ...deck, indoors: true, coversRoom: true })).toEqual({ alpha: 0 });
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
    it("keeps a floor in the open air in view, seen through when it is above the platform edited", () => {
        expect(editorLevelAlpha(52, 0, true)).toBe(EDITOR_OPEN_AIR_ABOVE_ALPHA);
        expect(editorLevelAlpha(20, 0, true)).toBe(EDITOR_OPEN_AIR_ABOVE_ALPHA);
        expect(editorLevelAlpha(52, 52, true)).toBe(1);
        expect(editorLevelAlpha(52, 116, true)).toBe(1);
        expect(editorLevelAlpha(52, Number.POSITIVE_INFINITY, true)).toBe(1);
        expect(EDITOR_OPEN_AIR_ABOVE_ALPHA).toBeGreaterThan(0.3);
        expect(EDITOR_OPEN_AIR_ABOVE_ALPHA).toBeLessThan(1);
    });
    it("keeps the whole building available in automatic mode", () => {
        expect(editorLevelAlpha(52, Number.POSITIVE_INFINITY)).toBe(1);
    });
});
