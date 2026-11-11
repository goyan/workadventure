import { describe, expect, it } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import {
    decodeNerfHearts,
    NERF_HEARTS_VARIABLE,
    nerfGunPose,
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
