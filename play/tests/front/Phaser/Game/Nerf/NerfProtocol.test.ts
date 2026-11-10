import { describe, expect, it } from "vitest";
import { decodeNerfHearts, NERF_HEARTS_VARIABLE } from "../../../../../src/front/Phaser/Game/Nerf/NerfProtocol";

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
