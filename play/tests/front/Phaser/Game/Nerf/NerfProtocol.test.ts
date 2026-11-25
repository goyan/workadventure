import { describe, expect, it } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import {
    decodeNerfHearts,
    decodeNerfShot,
    NERF_AIM_HOLD_MS,
    NERF_HEARTS_VARIABLE,
    NERF_SHOT_EVENT,
    nerfAimAt,
    nerfAimHeld,
    nerfGunPose,
    type NerfHeldAim,
} from "../../../../../src/front/Phaser/Game/Nerf/NerfProtocol";

describe("decodeNerfHearts", () => {
    it("is published as _nerfHearts", () => {
        expect(NERF_HEARTS_VARIABLE).toBe("_nerfHearts");
    });

    it.each([0, 7, 15])("accepts %d thirds", (value) => {
        expect(decodeNerfHearts(value)).toBe(value);
    });

    it.each([-1, 16, 1.5, "3", null, undefined])("ignores %j", (value) => {
        expect(decodeNerfHearts(value)).toBeUndefined();
    });
});

describe("nerfGunPose", () => {
    it("holds the blaster in the hand, at the side the avatar faces", () => {
        expect(nerfGunPose(PositionMessage_Direction.RIGHT)).toMatchObject({ x: 5, y: 5 });
        expect(nerfGunPose(PositionMessage_Direction.LEFT)).toMatchObject({ x: -5, y: 5 });
        expect(nerfGunPose(PositionMessage_Direction.DOWN)).toMatchObject({ x: 5, y: 7 });
        expect(nerfGunPose(PositionMessage_Direction.UP)).toMatchObject({ x: 5, y: -3 });
    });
});

describe("nerfGunPose aimed at an angle", () => {
    it("points the barrel along the angle, the grip staying at the side the avatar faces", () => {
        const pose = nerfGunPose(PositionMessage_Direction.RIGHT, 6, Math.atan2(1, 2));
        expect(pose).toMatchObject({ x: 5, y: 5 });
        expect(pose.dx).toBeCloseTo(2 / Math.sqrt(5));
        expect(pose.dy).toBeCloseTo(1 / Math.sqrt(5));
        expect(pose.angle).toBeCloseTo(Math.atan2(1, 2));
    });

    it("keeps its eight headings without an angle", () => {
        const pose = nerfGunPose(PositionMessage_Direction.UP, 3);
        expect(pose.dx).toBeCloseTo(-Math.SQRT1_2);
        expect(pose.dy).toBeCloseTo(-Math.SQRT1_2);
    });
});

describe("nerfAimAt", () => {
    it("fires from the hand straight through the point aimed at", () => {
        // The hand of an avatar facing right is 5 px aside and 5 px lower.
        expect(nerfAimAt({ x: 100, y: 100 }, { x: 200, y: 105 }, false)).toEqual({
            direction: PositionMessage_Direction.RIGHT,
            heading: 6,
            angle: 0,
        });
    });

    it("turns the avatar to the side of the point, and tells older browsers the nearest of eight headings", () => {
        const aim = nerfAimAt({ x: 100, y: 100 }, { x: 40, y: 20 }, false);
        expect(aim?.direction).toBe(PositionMessage_Direction.UP);
        // From the hand at (105, 97): up and to the left.
        expect(aim?.angle).toBeCloseTo(Math.atan2(-77, -65), 2);
        expect(aim?.heading).toBe(3);
        expect(nerfAimAt({ x: 100, y: 100 }, { x: 100, y: 300 }, false)?.direction).toBe(
            PositionMessage_Direction.DOWN,
        );
        expect(nerfAimAt({ x: 100, y: 100 }, { x: 0, y: 110 }, false)?.direction).toBe(PositionMessage_Direction.LEFT);
    });

    it("aims from the hand of a seated avatar, 4 px higher", () => {
        expect(nerfAimAt({ x: 100, y: 100 }, { x: 200, y: 101 }, true)?.angle).toBe(0);
    });

    it("does not aim at a point on the avatar itself", () => {
        expect(nerfAimAt({ x: 100, y: 100 }, { x: 106, y: 104 }, false)).toBeUndefined();
    });

    it("sends an angle the shot accepts, even towards the west", () => {
        const aim = nerfAimAt({ x: 100, y: 100 }, { x: -200, y: 105.0001 }, false);
        expect(aim?.angle).toBeLessThanOrEqual(Math.PI);
        expect(
            decodeNerfShot(NERF_SHOT_EVENT, { x: 100, y: 100, direction: aim?.direction, angle: aim?.angle }),
        ).toBeDefined();
    });
});

describe("decodeNerfShot with an angle", () => {
    const shot = { x: 100, y: 100, direction: PositionMessage_Direction.RIGHT, heading: 6 };

    it("accepts a shot at the pointer, and a shot without an angle", () => {
        expect(decodeNerfShot(NERF_SHOT_EVENT, { ...shot, angle: -2.5 })?.angle).toBe(-2.5);
        expect(decodeNerfShot(NERF_SHOT_EVENT, shot)?.angle).toBeUndefined();
    });

    it.each([Number.NaN, Infinity, 4, -4, "1"])("ignores a shot at the angle %j", (angle) => {
        expect(decodeNerfShot(NERF_SHOT_EVENT, { ...shot, angle })).toBeUndefined();
    });
});

describe("nerfAimHeld", () => {
    const held = (faced: boolean): NerfHeldAim => ({
        angle: 0.5,
        direction: PositionMessage_Direction.RIGHT,
        x: 100,
        y: 100,
        at: 1000,
        faced,
    });
    const right = PositionMessage_Direction.RIGHT;

    it("holds the aim while the avatar stays where it fired, facing the shot", () => {
        expect(nerfAimHeld(held(true), { x: 100, y: 100, direction: right }, 60_000)).toBe(true);
    });

    it("holds the aim a while when the avatar walks on, then lets it go", () => {
        expect(nerfAimHeld(held(true), { x: 130, y: 100, direction: right }, 1000 + NERF_AIM_HOLD_MS)).toBe(true);
        expect(nerfAimHeld(held(true), { x: 130, y: 100, direction: right }, 1001 + NERF_AIM_HOLD_MS)).toBe(false);
    });

    it("lets the aim go as soon as the avatar turns away from the shot", () => {
        expect(nerfAimHeld(held(true), { x: 100, y: 100, direction: PositionMessage_Direction.UP }, 1001)).toBe(false);
    });

    it("waits a while for another player's turn, which may reach this browser after the shot", () => {
        const aim = held(false);
        expect(nerfAimHeld(aim, { x: 100, y: 100, direction: PositionMessage_Direction.UP }, 1100)).toBe(true);
        expect(nerfAimHeld(aim, { x: 100, y: 100, direction: right }, 1200)).toBe(true);
        expect(aim.faced).toBe(true);
        expect(nerfAimHeld(aim, { x: 100, y: 100, direction: right }, 60_000)).toBe(true);
        expect(
            nerfAimHeld(
                held(false),
                { x: 100, y: 100, direction: PositionMessage_Direction.UP },
                1001 + NERF_AIM_HOLD_MS,
            ),
        ).toBe(false);
    });
});
