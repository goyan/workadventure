import { describe, expect, it } from "vitest";
import { WHEEL_GRID, wheelCell } from "../../../../src/front/Components/ActionsMenu/PixelWheel";

const C = WHEEL_GRID / 2;
/** The cell at this distance from the center, in this direction (0 = top, clockwise, in degrees). */
function cellAt(radius: number, degrees: number): [number, number] {
    const angle = (degrees * Math.PI) / 180;
    return [Math.floor(C + Math.sin(angle) * radius), Math.floor(C - Math.cos(angle) * radius)];
}

describe("PixelWheel", () => {
    it("puts the first sector at the top and the others clockwise", () => {
        expect(wheelCell(...cellAt(38, 0), 4)).toMatchObject({ kind: "sector", index: 0 });
        expect(wheelCell(...cellAt(38, 90), 4)).toMatchObject({ kind: "sector", index: 1 });
        expect(wheelCell(...cellAt(38, 180), 4)).toMatchObject({ kind: "sector", index: 2 });
        expect(wheelCell(...cellAt(38, 270), 4)).toMatchObject({ kind: "sector", index: 3 });
    });

    it("leaves the center for the avatar, a dark gap around it, and nothing outside the ring", () => {
        expect(wheelCell(C, C, 4).kind).toBe("center");
        expect(wheelCell(...cellAt(19, 0), 4).kind).toBe("gap");
        expect(wheelCell(0, 0, 4).kind).toBe("empty");
        expect(wheelCell(...cellAt(49.5, 0), 4).kind).toBe("empty");
    });

    it("separates neighbouring sectors by a dark gap, so the map does not show through the wheel", () => {
        expect(wheelCell(...cellAt(38, 45), 4).kind).toBe("gap");
        expect(wheelCell(...cellAt(38, 30), 4)).toMatchObject({ kind: "sector", index: 0 });
    });

    it("outlines each sector with the cells next to something else", () => {
        expect(wheelCell(...cellAt(48, 0), 4)).toMatchObject({ kind: "sector", edge: true });
        expect(wheelCell(...cellAt(36, 0), 4)).toMatchObject({ kind: "sector", edge: false });
    });

    it("works with few actions, as on a costume without outfits: two halves, or one full ring", () => {
        expect(wheelCell(...cellAt(38, 0), 2)).toMatchObject({ kind: "sector", index: 0 });
        expect(wheelCell(...cellAt(38, 180), 2)).toMatchObject({ kind: "sector", index: 1 });
        expect(wheelCell(...cellAt(38, 90), 1)).toMatchObject({ kind: "sector", index: 0 });
        expect(wheelCell(...cellAt(38, 180), 1)).toMatchObject({ kind: "sector", index: 0 });
    });
});
