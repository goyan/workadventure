import { describe, expect, it } from "vitest";
import { floorGroupBounds, floorGroups } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorGroups";
import { FloorModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";

function slabs(model: FloorModel, elevation: number, x0: number, y0: number, x1: number, y1: number): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) model.setSlab(elevation, x, y, "parquet-clair");
}

describe("floorGroups", () => {
    it("makes one floor of the slabs of an altitude that touch each other", () => {
        const model = new FloorModel();
        slabs(model, 52, 2, 2, 4, 3);
        const groups = floorGroups(model);
        expect(groups).toHaveLength(1);
        expect(groups[0].level).toBe(52);
        expect(groups[0].cells).toHaveLength(6);
        expect(groups[0].key).toBe("52:2:2");
    });

    it("keeps apart the floors of two buildings at the same altitude, and the floors of two altitudes", () => {
        const model = new FloorModel();
        slabs(model, 52, 2, 2, 3, 3);
        // Another building, further east: not a slab in between.
        slabs(model, 52, 6, 2, 7, 3);
        // And a floor above the first one.
        slabs(model, 116, 2, 2, 3, 3);
        const groups = floorGroups(model);
        expect(groups.map((group) => group.key)).toEqual(["52:2:2", "52:6:2", "116:2:2"]);
        expect(groups.map((group) => group.cells.length)).toEqual([4, 4, 4]);
    });

    it("does not join two slabs that only touch by a corner", () => {
        const model = new FloorModel();
        model.setSlab(52, 2, 2, "parquet-clair");
        model.setSlab(52, 3, 3, "parquet-clair");
        expect(floorGroups(model)).toHaveLength(2);
    });
});

describe("floorGroupBounds", () => {
    it("gives the rectangle a floor covers on the screen: its tiles, drawn its altitude further north", () => {
        const model = new FloorModel();
        slabs(model, 52, 2, 5, 4, 6);
        model.setSlab(52, 5, 6, "parquet-clair");
        const [group] = floorGroups(model);
        expect(floorGroupBounds(group)).toEqual({ x: 64, y: 5 * 32 - 52, width: 4 * 32, height: 2 * 32 });
    });
});
