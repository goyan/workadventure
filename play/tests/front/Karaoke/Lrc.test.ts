import { describe, expect, it } from "vitest";
import { activeLyricIndex, parseLrc } from "../../../src/front/Karaoke/Lrc";

describe("LRC lyrics", () => {
    it("reads repeated timestamps, fractions and an offset, in time order", () => {
        const lines = parseLrc("[ar:Test]\n[offset:500]\n[00:03.20]Second\n[00:01.5][00:05.000]First");
        expect(lines).toEqual([
            { atMs: 1000, text: "First" },
            { atMs: 2700, text: "Second" },
            { atMs: 4500, text: "First" },
        ]);
        expect(activeLyricIndex(lines, 999)).toBe(-1);
        expect(activeLyricIndex(lines, 1000)).toBe(0);
        expect(activeLyricIndex(lines, 4000)).toBe(1);
        expect(activeLyricIndex(lines, 4500)).toBe(2);
    });

    it("keeps instrumental gaps and literal text, ignores invalid timestamps", () => {
        const lines = parseLrc("[00:01.00]<b>Literal</b>\n[00:02.00]\n[00:99.00]Invalid\n[broken]Ignored");
        expect(lines).toEqual([
            { atMs: 1000, text: "<b>Literal</b>" },
            { atMs: 2000, text: "" },
        ]);
        expect(activeLyricIndex([], 10)).toBe(-1);
    });
});
