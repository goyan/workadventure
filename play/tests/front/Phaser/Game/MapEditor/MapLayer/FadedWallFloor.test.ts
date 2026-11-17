import { describe, expect, it } from "vitest";
import { fadedWallFloorPatches } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FadedWallFloor";

/** Floors by "column,row". */
function floors(cells: Record<string, string>) {
    return (column: number, row: number): string | undefined => cells[`${column},${row}`];
}

describe("fadedWallFloorPatches", () => {
    it("carries the floor under the top of a faded wall down to its foot, where no floor lies", () => {
        // A wall two tiles high: its image covers rows 5 and 6; the room laid its floor under row 5 only.
        const patches = fadedWallFloorPatches([{ x: 64, y: 160, width: 32, height: 64 }], floors({ "2,5": "olive" }));
        expect(patches).toEqual([{ column: 2, row: 6, floor: "olive" }]);
    });

    it("takes the floor of the room just north of the wall when none lies under its image", () => {
        const patches = fadedWallFloorPatches([{ x: 64, y: 160, width: 32, height: 64 }], floors({ "2,4": "mauve" }));
        expect(patches).toEqual([
            { column: 2, row: 5, floor: "mauve" },
            { column: 2, row: 6, floor: "mauve" },
        ]);
    });

    it("leaves alone a cell that has its own floor (under a door), and a wall with no floor north of it", () => {
        expect(
            fadedWallFloorPatches(
                [{ x: 64, y: 160, width: 32, height: 64 }],
                floors({ "2,5": "olive", "2,6": "mauve" }),
            ),
        ).toEqual([]);
        expect(fadedWallFloorPatches([{ x: 64, y: 160, width: 32, height: 64 }], floors({}))).toEqual([]);
    });

    it("covers each column whose centre is under the piece, once, whatever pieces overlap", () => {
        // An end piece starts 6 px west of its cell and is 38 px wide; a joint overlaps it.
        const patches = fadedWallFloorPatches(
            [
                { x: 58, y: 160, width: 38, height: 64 },
                { x: 58, y: 160, width: 12, height: 64 },
            ],
            floors({ "2,5": "olive", "1,5": "stone" }),
        );
        expect(patches).toEqual([{ column: 2, row: 6, floor: "olive" }]);
    });
});
