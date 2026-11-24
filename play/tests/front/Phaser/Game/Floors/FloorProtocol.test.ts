import { describe, expect, it } from "vitest";
import { decodeFloorZ, floorZToShare } from "../../../../../src/front/Phaser/Game/Floors/FloorProtocol";

describe("altitude shared between players", () => {
    it("reads the altitude of another player, the ground for anything else", () => {
        expect(decodeFloorZ(52)).toBe(52);
        expect(decodeFloorZ(17.5)).toBe(17.5);
        // An older client never sets it; a broken or hostile value is the ground.
        expect(decodeFloorZ(undefined)).toBe(0);
        expect(decodeFloorZ("52")).toBe(0);
        expect(decodeFloorZ(-3)).toBe(0);
        expect(decodeFloorZ(Number.NaN)).toBe(0);
        expect(decodeFloorZ(1e9)).toBe(0);
    });

    it("shares a floor at once, and a stair by steps and not too often", () => {
        // Standing on a floor (no stair): the exact altitude, as soon as it changed.
        expect(floorZToShare({ elevation: 52 }, 0, 0)).toBe(52);
        expect(floorZToShare({ elevation: 52 }, 52, 5000)).toBeUndefined();
        expect(floorZToShare({ elevation: 0 }, 52, 0)).toBe(0);
        // On a stair the altitude changes at every frame: rounded to 4 px, at most every 150 ms.
        expect(floorZToShare({ elevation: 17.3, stair: 0 }, 0, 200)).toBe(16);
        expect(floorZToShare({ elevation: 17.3, stair: 0 }, 0, 100)).toBeUndefined();
        expect(floorZToShare({ elevation: 17.3, stair: 0 }, 16, 200)).toBeUndefined();
    });
});
