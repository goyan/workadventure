import { describe, expect, it } from "vitest";
import {
    chipsFold,
    popoverPlacement,
    POPOVER_MIN_HEIGHT_PX,
} from "../../../../src/front/Components/ClockLine/ClockLineFold";

describe("chipsFold", () => {
    // Widths read in the preview: the weather of two places, the floors at 250 px, the clock and its rainbow.
    const line = { others: 752, labelled: 250, iconsOnly: 72, gap: 8, column: false };

    it("keeps the labels when they fit beside the other items", () => {
        expect(chipsFold({ ...line, room: 1264 })).toBe("labels");
        expect(chipsFold({ ...line, room: 752 + 8 + 250 })).toBe("labels");
    });

    it("folds to the icons first, when only they fit", () => {
        expect(chipsFold({ ...line, room: 1008 })).toBe("icons");
        expect(chipsFold({ ...line, room: 752 + 8 + 72 })).toBe("icons");
    });

    it("gives the chips a row of their own when even their icons would push the clock", () => {
        expect(chipsFold({ ...line, room: 752 + 8 + 71 })).toBe("own-row");
        expect(chipsFold({ ...line, room: 752 })).toBe("own-row");
    });

    it("keeps the labels in the column of the narrow layouts, the icons if even they do not fit there", () => {
        expect(chipsFold({ ...line, column: true, room: 400 })).toBe("labels");
        expect(chipsFold({ ...line, column: true, room: 200 })).toBe("icons");
    });
});

describe("popoverPlacement", () => {
    const viewport = { width: 1280, height: 800 };
    const chip = (left: number, top = 80, bottom = 112) => ({ left, right: left + 110, top, bottom });

    it("opens under the chip, its left edge on the chip's", () => {
        expect(popoverPlacement(chip(300), 500, viewport)).toEqual({
            left: 0,
            top: 32 + 8,
            maxWidth: 1264,
            maxHeight: 800 - 112 - 8 - 12,
        });
    });

    it("moves left so as never to pass the right edge of the window", () => {
        const placement = popoverPlacement(chip(1100), 500, viewport);
        expect(1100 + placement.left + 500).toBe(1280 - 8);
    });

    it("never passes the left edge either, on a window narrower than the popover", () => {
        const placement = popoverPlacement(chip(200), 900, { width: 600, height: 800 });
        expect(200 + placement.left).toBe(8);
        expect(placement.maxWidth).toBe(584);
    });

    it("keeps a least height on the smallest windows, scrolled inside", () => {
        expect(popoverPlacement(chip(10, 268, 300), 200, { width: 600, height: 350 }).maxHeight).toBe(
            POPOVER_MIN_HEIGHT_PX,
        );
    });

    it("opens under the floors it would cover, taller than the chip, but not under items beside it", () => {
        // The stack of the floors, two lines high, from 809 px: under a popover 680 px wide from 279 px.
        const floors = { left: 809, right: 1059, top: 80, bottom: 132 };
        const weather = { left: 520, right: 801, top: 80, bottom: 112 };
        const placement = popoverPlacement(chip(279), 680, viewport, [weather, floors]);
        expect(80 + placement.top).toBe(132 + 8);
        expect(placement.maxHeight).toBe(800 - 132 - 8 - 12);
        // Narrower, it stops short of the floors: right under the chip.
        expect(popoverPlacement(chip(279), 300, viewport, [weather, floors]).top).toBe(32 + 8);
        // An item of another row (the chips in a row of their own, under the line) is not in the way.
        expect(popoverPlacement(chip(279, 140, 172), 680, viewport, [floors]).top).toBe(32 + 8);
    });
});
