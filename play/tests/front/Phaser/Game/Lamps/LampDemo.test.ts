import { describe, expect, it } from "vitest";
import { parseLampDemo, resolveLampDemo } from "../../../../../src/front/Phaser/Game/Lamps/LampDemo";

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

describe("resolveLampDemo", () => {
    it("takes the tempo of the address when there is one, whatever the setting", () => {
        expect(resolveLampDemo({ bpm: 96 }, false)).toEqual({ bpm: 96 });
        expect(resolveLampDemo({ bpm: 96 }, true)).toEqual({ bpm: 96 });
    });

    it("shows the demo at 120 BPM when the user turned the setting on", () => {
        expect(resolveLampDemo(undefined, true)).toEqual({ bpm: 120 });
    });

    it("shows no demo otherwise", () => {
        expect(resolveLampDemo(undefined, false)).toBeUndefined();
    });
});
