import { describe, expect, it } from "vitest";
import { parseLampDemo } from "../../../../../src/front/Phaser/Game/Lamps/LampDemo";

describe("parseLampDemo", () => {
    it("is off by default", () => {
        expect(parseLampDemo("")).toBeUndefined();
        expect(parseLampDemo("?foo=bar")).toBeUndefined();
    });

    it("is on with the bare flag, at 120 BPM", () => {
        expect(parseLampDemo("?lampDemo")).toEqual({ bpm: 120 });
        expect(parseLampDemo("?lampDemo=1")).toEqual({ bpm: 120 });
    });

    it("takes a tempo", () => {
        expect(parseLampDemo("?lampDemo=96")).toEqual({ bpm: 96 });
    });

    it("keeps the tempo in a musical range", () => {
        expect(parseLampDemo("?lampDemo=5")).toEqual({ bpm: 120 });
        expect(parseLampDemo("?lampDemo=999")).toEqual({ bpm: 120 });
        expect(parseLampDemo("?lampDemo=abc")).toEqual({ bpm: 120 });
    });

    it("can be turned off", () => {
        expect(parseLampDemo("?lampDemo=0")).toBeUndefined();
        expect(parseLampDemo("?lampDemo=off")).toBeUndefined();
    });
});
