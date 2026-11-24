import { describe, expect, it } from "vitest";
import { iceOfThickness } from "@wa/front/Phaser/Game/Ice/IceHold";

describe("the ice of the server under the feet", () => {
    it("is slipped on from 5 mm where one would walk: a frozen puddle, black ice", () => {
        expect(iceOfThickness(0, false)).toBe("none");
        expect(iceOfThickness(4, false)).toBe("none");
        expect(iceOfThickness(5, false)).toBe("solid");
        expect(iceOfThickness(200, false)).toBe("solid");
    });

    it("bears a walker over deep water from 50 mm; thinner, it is thin ice that cracks and gives way", () => {
        expect(iceOfThickness(4, true)).toBe("none");
        expect(iceOfThickness(20, true)).toBe("thin");
        expect(iceOfThickness(49, true)).toBe("thin");
        expect(iceOfThickness(50, true)).toBe("solid");
        expect(iceOfThickness(Number.NaN, true)).toBe("none");
    });
});
