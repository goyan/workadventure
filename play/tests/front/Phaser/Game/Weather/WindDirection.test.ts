import { describe, expect, it } from "vitest";
import { compassPointOf, windArrowOf } from "../../../../../src/front/Phaser/Game/Weather/WindDirection";

describe("compassPointOf", () => {
    it("names the 8 points of where the wind comes from, each a sector of 45° centred on its point", () => {
        expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassPointOf)).toEqual([
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw",
        ]);
    });
    it("puts each bound in the sector that starts there: north is [337.5 ; 22.5[", () => {
        expect(compassPointOf(337.49)).toBe("nw");
        expect(compassPointOf(337.5)).toBe("n");
        expect(compassPointOf(22.49)).toBe("n");
        expect(compassPointOf(22.5)).toBe("ne");
        expect(compassPointOf(67.5)).toBe("e");
        expect(compassPointOf(292.5)).toBe("nw");
    });
    it("reads 360° as north and an angle outside 0 to 360 on the same circle", () => {
        expect(compassPointOf(360)).toBe("n");
        expect(compassPointOf(-45)).toBe("nw");
        expect(compassPointOf(405)).toBe("ne");
    });
    it("gives nothing for an angle that is not a number", () => {
        expect(compassPointOf(Number.NaN)).toBeUndefined();
        expect(compassPointOf(Number.POSITIVE_INFINITY)).toBeUndefined();
    });
});

describe("windArrowOf", () => {
    it("points the arrow where the wind goes: its point + 180°, north up", () => {
        expect(windArrowOf("n").towards).toBe(180);
        expect(windArrowOf("nw").towards).toBe(135);
        expect(windArrowOf("e").towards).toBe(270);
        expect(windArrowOf("sw").towards).toBe(45);
    });
    it("draws a straight or a diagonal arrow turned by quarter turns only, to keep its pixels sharp", () => {
        // the straight arrow points up, the diagonal one up and right (north-east)
        expect(windArrowOf("s")).toEqual({ towards: 0, diagonal: false, quarterTurns: 0 });
        expect(windArrowOf("n")).toEqual({ towards: 180, diagonal: false, quarterTurns: 2 });
        expect(windArrowOf("w")).toEqual({ towards: 90, diagonal: false, quarterTurns: 1 });
        expect(windArrowOf("sw")).toEqual({ towards: 45, diagonal: true, quarterTurns: 0 });
        expect(windArrowOf("nw")).toEqual({ towards: 135, diagonal: true, quarterTurns: 1 });
        expect(windArrowOf("ne")).toEqual({ towards: 225, diagonal: true, quarterTurns: 2 });
        expect(windArrowOf("se")).toEqual({ towards: 315, diagonal: true, quarterTurns: 3 });
    });
});
