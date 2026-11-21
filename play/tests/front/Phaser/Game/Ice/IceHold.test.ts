import { describe, expect, it } from "vitest";
import { iceHolds } from "@wa/front/Phaser/Game/Ice/IceHold";

describe("the ice of the server under the feet", () => {
    it("is slipped on from 5 mm where one would walk: a frozen puddle, black ice", () => {
        expect(iceHolds(0, false)).toBe(false);
        expect(iceHolds(4, false)).toBe(false);
        expect(iceHolds(5, false)).toBe(true);
        expect(iceHolds(200, false)).toBe(true);
    });

    it("bears a walker over deep water from 50 mm only: thinner, it gives way and one swims", () => {
        expect(iceHolds(20, true)).toBe(false);
        expect(iceHolds(49, true)).toBe(false);
        expect(iceHolds(50, true)).toBe(true);
        expect(iceHolds(Number.NaN, true)).toBe(false);
    });
});
